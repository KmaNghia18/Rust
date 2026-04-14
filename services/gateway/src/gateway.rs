use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use tokio::{
    net::TcpStream,
    sync::{mpsc, RwLock},
    time::{interval, timeout},
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::{
    config::Config,
    events::*,
    session::{IdentifyPayload, ResumePayload, Session, StatusUpdatePayload},
};

/// Sender half of a WebSocket connection
pub type WsSender = mpsc::UnboundedSender<Message>;

/// Gateway state shared across all connections
pub struct Gateway {
    /// user_id → list of their active WS senders (multiple devices)
    pub connections: Arc<DashMap<Uuid, Vec<WsSender>>>,
    /// session_id → Session metadata
    pub sessions: Arc<DashMap<String, Session>>,
    pub redis: redis::Client,
    pub config: Config,
}

impl Gateway {
    pub fn new(redis: redis::Client, config: Config) -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
            sessions: Arc::new(DashMap::new()),
            redis,
            config,
        }
    }

    /// Handle an incoming TCP connection, upgrade to WebSocket
    pub async fn handle_connection(
        self: Arc<Self>,
        stream: TcpStream,
        addr: SocketAddr,
    ) -> anyhow::Result<()> {
        info!("New connection from {}", addr);

        let ws = accept_async(stream).await?;
        let (mut ws_write, mut ws_read) = ws.split();

        // Create an unbounded channel — we send to ws_write from this channel
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
        let tx_clone = tx.clone();

        // ── 1. Send HELLO ───────────────────────────────────────────────
        let hello = serde_json::to_string(&ServerMessage::hello(
            self.config.heartbeat_interval_ms,
        ))?;
        ws_write.send(Message::text(hello)).await?;

        // ── 2. Spawn writer task ────────────────────────────────────────
        let write_task = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_write.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // ── 3. Wait for IDENTIFY (timeout 30s) ─────────────────────────
        let session = match timeout(
            Duration::from_secs(30),
            self.wait_for_identify(&mut ws_read, &tx_clone),
        )
        .await
        {
            Ok(Ok(session)) => session,
            Ok(Err(e)) => {
                warn!("Identify failed from {}: {}", addr, e);
                return Ok(());
            }
            Err(_) => {
                warn!("Identify timeout from {}", addr);
                return Ok(());
            }
        };

        let user_id = session.user_id;
        let session_id = session.id.clone();

        // ── 4. Register connection ──────────────────────────────────────
        self.connections
            .entry(user_id)
            .or_default()
            .push(tx_clone.clone());
        self.sessions.insert(session_id.clone(), session.clone());

        info!("User {} connected (session: {})", user_id, session_id);

        // ── 5. Send READY event ─────────────────────────────────────────
        self.send_ready(&session, &tx_clone).await;

        // ── 6. Subscribe to Redis pub/sub for this user's events ────────
        let gateway_clone = Arc::clone(&self);
        let tx_redis = tx_clone.clone();
        let user_id_clone = user_id;
        let redis_task = tokio::spawn(async move {
            if let Err(e) = gateway_clone.redis_subscriber(user_id_clone, tx_redis).await {
                error!("Redis subscriber error for {}: {}", user_id_clone, e);
            }
        });

        // ── 7. Heartbeat task ───────────────────────────────────────────
        let tx_hb = tx_clone.clone();
        let hb_interval = self.config.heartbeat_interval_ms;
        let hb_task = tokio::spawn(async move {
            let mut ticker = interval(Duration::from_millis(hb_interval + 5000));
            ticker.tick().await; // skip first immediate tick
            loop {
                ticker.tick().await;
                let msg = serde_json::to_string(&ServerMessage::<()> {
                    op: 1,
                    d: None,
                    s: None,
                    t: None,
                })
                .unwrap_or_default();
                if tx_hb.send(Message::text(msg)).is_err() {
                    break;
                }
            }
        });

        // ── 8. Main read loop ───────────────────────────────────────────
        while let Some(Ok(msg)) = ws_read.next().await {
            match msg {
                Message::Text(text) => {
                    if let Err(e) = self
                        .handle_client_message(&text, &session, &tx_clone)
                        .await
                    {
                        error!("Error handling client message: {}", e);
                    }
                }
                Message::Close(_) => {
                    info!("Client {} disconnected", user_id);
                    break;
                }
                Message::Ping(data) => {
                    let _ = tx_clone.send(Message::Pong(data));
                }
                _ => {}
            }
        }

        // ── 9. Cleanup ──────────────────────────────────────────────────
        self.sessions.remove(&session_id);

        // Remove this sender from connections map
        if let Some(mut senders) = self.connections.get_mut(&user_id) {
            senders.retain(|s| !s.is_closed());
            if senders.is_empty() {
                drop(senders);
                self.connections.remove(&user_id);

                // User went fully offline — update presence
                self.publish_presence(user_id, "offline").await;
            }
        }

        redis_task.abort();
        hb_task.abort();
        write_task.await.ok();

        info!("Connection {} cleaned up", addr);
        Ok(())
    }

    // ─── Wait for IDENTIFY ─────────────────────────────────────────────────

    async fn wait_for_identify(
        &self,
        ws_read: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin),
        tx: &WsSender,
    ) -> anyhow::Result<Session> {
        while let Some(Ok(msg)) = ws_read.next().await {
            if let Message::Text(text) = msg {
                let client_msg: ClientMessage = serde_json::from_str(&text)?;

                if client_msg.op == 2 {
                    // IDENTIFY
                    let payload: IdentifyPayload = serde_json::from_value(
                        client_msg.d.ok_or_else(|| anyhow::anyhow!("No data"))?,
                    )?;

                    return self.authenticate(payload).await;
                } else if client_msg.op == 1 {
                    // Heartbeat before identify — ack it
                    let ack = serde_json::to_string(&ServerMessage::heartbeat_ack())?;
                    let _ = tx.send(Message::text(ack));
                }
            }
        }
        Err(anyhow::anyhow!("Connection closed before IDENTIFY"))
    }

    // ─── Authenticate via JWT ──────────────────────────────────────────────

    async fn authenticate(&self, payload: IdentifyPayload) -> anyhow::Result<Session> {
        use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let claims = decode::<crate::session::JwtClaims>(
            &payload.token,
            &DecodingKey::from_secret(self.config.jwt_secret.as_bytes()),
            &validation,
        )
        .map_err(|e| anyhow::anyhow!("Invalid token: {}", e))?
        .claims;

        if claims.token_type != "access" {
            return Err(anyhow::anyhow!("Access token required"));
        }

        let user_id = claims.sub.parse::<Uuid>()?;
        Ok(Session::new(user_id, claims.email))
    }

    // ─── Send READY ────────────────────────────────────────────────────────

    async fn send_ready(&self, session: &Session, tx: &WsSender) {
        let ready = ReadyPayload {
            v: 10,
            user: serde_json::json!({
                "id": session.user_id,
                "email": session.email,
            }),
            guilds: vec![], // TODO: fetch from guilds service
            session_id: session.id.clone(),
            resume_gateway_url: format!("wss://gateway.{}", self.config.domain),
        };

        let msg = ServerMessage::dispatch("READY", ready, session.next_seq());
        if let Ok(text) = serde_json::to_string(&msg) {
            let _ = tx.send(Message::text(text));
        }
    }

    // ─── Handle Client Messages ────────────────────────────────────────────

    async fn handle_client_message(
        &self,
        text: &str,
        session: &Session,
        tx: &WsSender,
    ) -> anyhow::Result<()> {
        let msg: ClientMessage = serde_json::from_str(text)?;

        match msg.op {
            1 => {
                // HEARTBEAT — send ACK
                debug!("Heartbeat from {}", session.user_id);
                let ack = serde_json::to_string(&ServerMessage::heartbeat_ack())?;
                let _ = tx.send(Message::text(ack));
            }
            3 => {
                // STATUS_UPDATE
                if let Some(data) = msg.d {
                    let payload: StatusUpdatePayload = serde_json::from_value(data)?;
                    self.publish_presence(session.user_id, &payload.status).await;
                }
            }
            6 => {
                // RESUME — send a few missed events
                // TODO: implement session resume with sequence replay
                let invalid = serde_json::to_string(&ServerMessage::invalid_session(false))?;
                let _ = tx.send(Message::text(invalid));
            }
            _ => {
                debug!("Unknown opcode {} from {}", msg.op, session.user_id);
            }
        }

        Ok(())
    }

    // ─── Redis Pub/Sub Subscriber ──────────────────────────────────────────

    async fn redis_subscriber(&self, user_id: Uuid, tx: WsSender) -> anyhow::Result<()> {
        let mut conn = self.redis.get_connection()?;
        let mut pubsub = conn.as_pubsub();

        // Subscribe to user-specific channel
        pubsub.subscribe(format!("user:{}", user_id))?;
        // Subscribe to this gateway instance's broadcast
        pubsub.subscribe("gateway:broadcast")?;

        info!("Subscribed to Redis channels for user {}", user_id);

        loop {
            let msg = pubsub.get_message()?;
            let payload: String = msg.get_payload()?;

            if tx.send(Message::text(payload)).is_err() {
                break; // client disconnected
            }
        }

        Ok(())
    }

    // ─── Publish Events ────────────────────────────────────────────────────

    /// Push an event to a specific user (all their devices)
    pub async fn send_to_user(&self, user_id: Uuid, event: &str) {
        if let Some(senders) = self.connections.get(&user_id) {
            for sender in senders.iter() {
                let _ = sender.send(Message::text(event.to_string()));
            }
        }
    }

    /// Broadcast an event to all members of a channel via Redis pub/sub
    pub async fn publish_to_channel(
        &self,
        channel_id: Uuid,
        event_name: &str,
        data: &serde_json::Value,
    ) {
        let msg = serde_json::json!({
            "op": 0,
            "t": event_name,
            "d": data,
        });

        if let Ok(mut conn) = self.redis.get_connection() {
            let key = format!("channel:{}", channel_id);
            let _: redis::RedisResult<()> =
                redis::cmd("PUBLISH").arg(&key).arg(msg.to_string()).query(&mut conn);
        }
    }

    /// Publish presence update
    async fn publish_presence(&self, user_id: Uuid, status: &str) {
        if let Ok(mut conn) = self.redis.get_connection() {
            let key = format!("presence:{}", user_id);
            // Store current status
            let _: redis::RedisResult<()> = redis::cmd("SET")
                .arg(&key)
                .arg(status)
                .arg("EX")
                .arg(300u64) // expire in 5 min (refreshed by heartbeats)
                .query(&mut conn);

            // Publish PRESENCE_UPDATE to all subscribers
            let event = serde_json::json!({
                "op": 0,
                "t": "PRESENCE_UPDATE",
                "d": { "user_id": user_id, "status": status },
            });
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg("gateway:broadcast")
                .arg(event.to_string())
                .query(&mut conn);
        }

        info!("Presence update: {} → {}", user_id, status);
    }
}
