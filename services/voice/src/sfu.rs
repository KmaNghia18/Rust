use std::{net::SocketAddr, sync::Arc, time::Duration};
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use tokio::{
    net::TcpStream,
    sync::mpsc,
    time::{interval, timeout},
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::models::*;

/// WebRTC SFU (Selective Forwarding Unit) — routes media without decoding
///
/// Architecture:
/// ```
///  User A mic ──► SFU ──► User B speaker
///  User B mic ──► SFU ──► User A speaker
///  User C mic ──► SFU ──► User A, B speakers
/// ```
/// SFU does NOT decode audio/video — just forwards RTP packets.
/// This is far more efficient than MCU (mixing) for 2+ participants.
pub struct VoiceServer {
    pub rooms: Arc<DashMap<Uuid, VoiceRoom>>,
    pub redis: redis::Client,
    pub config: crate::config::Config,
}

impl VoiceServer {
    pub fn new(redis: redis::Client, config: crate::config::Config) -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
            redis,
            config,
        }
    }

    /// Accept a WebSocket connection for voice signaling
    pub async fn handle_connection(
        self: Arc<Self>,
        stream: TcpStream,
        addr: SocketAddr,
    ) -> anyhow::Result<()> {
        info!("Voice signaling connection from {}", addr);

        let ws = accept_async(stream).await?;
        let (mut ws_write, mut ws_read) = ws.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

        // 1. Send HELLO
        let session_id = nanoid::nanoid!(32);
        let hello = ServerSignal::Hello {
            heartbeat_interval: 5000,
            session_id: session_id.clone(),
        };
        ws_write.send(Message::text(serde_json::to_string(&hello)?)).await?;

        // 2. Spawn writer
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_write.send(msg).await.is_err() { break; }
            }
        });

        // 3. Wait for IDENTIFY (with token + channel_id)
        let (user_id, channel_id) = match timeout(
            Duration::from_secs(15),
            self.wait_for_identify(&mut ws_read, &tx),
        ).await {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => { warn!("Voice identify failed: {}", e); return Ok(()); }
            Err(_) => { warn!("Voice identify timeout from {}", addr); return Ok(()); }
        };

        info!("User {} joined voice channel {}", user_id, channel_id);

        // 4. Add user to room
        let peer_id = nanoid::nanoid!(16);
        let voice_state = VoiceState {
            user_id,
            guild_id: None,
            channel_id: Some(channel_id),
            session_id: session_id.clone(),
            self_mute: false,
            self_deaf: false,
            self_video: false,
            self_stream: false,
            server_mute: false,
            server_deaf: false,
            suppress: false,
            joined_at: Some(chrono::Utc::now().timestamp()),
        };

        // Notify existing participants of new user
        let existing_states = self.add_to_room(channel_id, user_id, peer_id.clone(), voice_state.clone());

        // 5. Send READY with all current participants
        let ready = ServerSignal::VoiceStateUpdate { states: existing_states };
        let _ = tx.send(Message::text(serde_json::to_string(&ready)?));

        // 6. Notify others that this user joined
        self.broadcast_to_room(channel_id, user_id, &ServerSignal::UserJoined {
            user_id,
            peer_id: peer_id.clone(),
            state: voice_state.clone(),
        }).await;

        // 7. Publish to Redis (so Gateway can send VOICE_STATE_UPDATE to text clients)
        self.publish_voice_state(&voice_state).await;

        // 8. Main signaling loop
        while let Some(Ok(msg)) = ws_read.next().await {
            if let Message::Text(text) = msg {
                if let Ok(signal) = serde_json::from_str::<ClientSignal>(&text) {
                    if let Err(e) = self.handle_signal(signal, user_id, channel_id, &peer_id, &tx).await {
                        error!("Signal error from {}: {}", user_id, e);
                    }
                }
            }
        }

        // 9. Cleanup on disconnect
        self.remove_from_room(channel_id, user_id);
        self.broadcast_to_room(channel_id, user_id, &ServerSignal::UserLeft { user_id }).await;

        let mut disconnect_state = voice_state.clone();
        disconnect_state.channel_id = None;
        self.publish_voice_state(&disconnect_state).await;

        info!("User {} left voice channel {}", user_id, channel_id);
        Ok(())
    }

    // ─── Signaling Handler ───────────────────────────────────────────────

    async fn handle_signal(
        &self,
        signal: ClientSignal,
        user_id: Uuid,
        channel_id: Uuid,
        peer_id: &str,
        tx: &mpsc::UnboundedSender<Message>,
    ) -> anyhow::Result<()> {
        match signal {
            ClientSignal::Heartbeat => {
                let _ = tx.send(Message::text(
                    serde_json::to_string(&ServerSignal::HeartbeatAck)?
                ));
            }

            ClientSignal::Offer { sdp, peer_id: target_peer } => {
                // Forward SDP offer to the target peer
                self.forward_to_peer(channel_id, &target_peer, &ServerSignal::SessionDescription {
                    sdp,
                    peer_id: peer_id.to_string(),
                }).await;
            }

            ClientSignal::Answer { sdp, peer_id: target_peer } => {
                self.forward_to_peer(channel_id, &target_peer, &ServerSignal::SessionDescription {
                    sdp,
                    peer_id: peer_id.to_string(),
                }).await;
            }

            ClientSignal::IceCandidate { candidate, peer_id: target_peer } => {
                // Forward ICE candidate to target peer for NAT traversal
                self.forward_to_peer(channel_id, &target_peer, &ServerSignal::IceCandidate {
                    candidate,
                    peer_id: peer_id.to_string(),
                }).await;
            }

            ClientSignal::StateUpdate { self_mute, self_deaf, self_video } => {
                // Update state in room
                if let Some(mut room) = self.rooms.get_mut(&channel_id) {
                    if let Some(participant) = room.participants.get_mut(&user_id) {
                        participant.state.self_mute = self_mute;
                        participant.state.self_deaf = self_deaf;
                        participant.state.self_video = self_video;

                        let state = participant.state.clone();
                        drop(room);

                        // Broadcast state change to room
                        self.publish_voice_state(&state).await;
                    }
                }
            }

            ClientSignal::Disconnect => {
                // Handle graceful disconnect
                info!("User {} requested voice disconnect", user_id);
            }

            _ => {}
        }

        Ok(())
    }

    // ─── Room Management ─────────────────────────────────────────────────

    fn add_to_room(
        &self,
        channel_id: Uuid,
        user_id: Uuid,
        peer_id: String,
        state: VoiceState,
    ) -> Vec<VoiceState> {
        let mut room = self.rooms.entry(channel_id).or_insert_with(|| VoiceRoom {
            channel_id,
            guild_id: None,
            participants: Default::default(),
        });

        // Collect current states before adding new participant
        let existing: Vec<VoiceState> = room.participants.values().map(|p| p.state.clone()).collect();

        room.participants.insert(user_id, VoiceParticipant {
            user_id,
            session_id: state.session_id.clone(),
            state,
            peer_id,
        });

        existing
    }

    fn remove_from_room(&self, channel_id: Uuid, user_id: Uuid) {
        if let Some(mut room) = self.rooms.get_mut(&channel_id) {
            room.participants.remove(&user_id);
            if room.participants.is_empty() {
                drop(room);
                self.rooms.remove(&channel_id);
                info!("Voice room {} is now empty, removed", channel_id);
            }
        }
    }

    // ─── Broadcast Helpers ───────────────────────────────────────────────

    async fn broadcast_to_room(&self, channel_id: Uuid, exclude_user: Uuid, signal: &ServerSignal) {
        let Ok(payload) = serde_json::to_string(signal) else { return };

        if let Ok(mut conn) = self.redis.get_connection() {
            let key = format!("voice_room:{}", channel_id);
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg(&key)
                .arg(&payload)
                .query(&mut conn);
        }
    }

    async fn forward_to_peer(&self, channel_id: Uuid, target_peer: &str, signal: &ServerSignal) {
        let Ok(payload) = serde_json::to_string(signal) else { return };

        if let Ok(mut conn) = self.redis.get_connection() {
            let key = format!("voice_peer:{}", target_peer);
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg(&key)
                .arg(&payload)
                .query(&mut conn);
        }
    }

    async fn publish_voice_state(&self, state: &VoiceState) {
        if let Ok(mut conn) = self.redis.get_connection() {
            let event = serde_json::json!({
                "op": 0,
                "t": "VOICE_STATE_UPDATE",
                "d": state,
            });
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg("gateway:broadcast")
                .arg(event.to_string())
                .query(&mut conn);
        }
    }

    // ─── Auth ────────────────────────────────────────────────────────────

    async fn wait_for_identify(
        &self,
        ws_read: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin),
        tx: &mpsc::UnboundedSender<Message>,
    ) -> anyhow::Result<(Uuid, Uuid)> {
        while let Some(Ok(msg)) = ws_read.next().await {
            if let Message::Text(text) = msg {
                if let Ok(ClientSignal::Identify { token, channel_id }) = serde_json::from_str(&text) {
                    let user_id = self.verify_voice_token(&token)?;
                    return Ok((user_id, channel_id));
                }
            }
        }
        Err(anyhow::anyhow!("Connection closed before IDENTIFY"))
    }

    fn verify_voice_token(&self, token: &str) -> anyhow::Result<Uuid> {
        use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
        use serde::Deserialize;

        #[derive(Deserialize)]
        struct Claims { sub: Uuid, exp: i64, token_type: String }

        let mut v = Validation::new(Algorithm::HS256);
        v.validate_exp = true;

        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.config.jwt_secret.as_bytes()),
            &v,
        )?.claims;

        if claims.token_type != "access" {
            return Err(anyhow::anyhow!("Invalid token type"));
        }

        Ok(claims.sub)
    }
}
