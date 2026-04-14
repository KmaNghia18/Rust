use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use uuid::Uuid;

/// Represents a single active WebSocket session
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,                         // session_id (random string)
    pub user_id: Uuid,
    pub email: String,
    pub seq: Arc<AtomicU64>,               // sequence counter per session
    pub subscribed_guilds: Vec<Uuid>,      // guilds user belongs to
    pub subscribed_channels: Vec<Uuid>,    // channels user can see
}

impl Session {
    pub fn new(user_id: Uuid, email: String) -> Self {
        Self {
            id: nanoid::nanoid!(32),
            user_id,
            email,
            seq: Arc::new(AtomicU64::new(0)),
            subscribed_guilds: Vec::new(),
            subscribed_channels: Vec::new(),
        }
    }

    pub fn next_seq(&self) -> u64 {
        self.seq.fetch_add(1, Ordering::Relaxed)
    }
}

/// Claims decoded from the JWT token sent during IDENTIFY
#[derive(Debug, serde::Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    pub exp: i64,
    pub token_type: String,
}

/// The IDENTIFY payload sent by the client
#[derive(Debug, serde::Deserialize)]
pub struct IdentifyPayload {
    pub token: String,
    pub properties: Option<IdentifyProperties>,
    pub intents: Option<u64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct IdentifyProperties {
    pub os: Option<String>,
    pub browser: Option<String>,
    pub device: Option<String>,
}

/// Presence status update from client
#[derive(Debug, serde::Deserialize)]
pub struct StatusUpdatePayload {
    pub status: String,
    pub custom_status: Option<String>,
}

/// Resume payload sent by client after reconnect
#[derive(Debug, serde::Deserialize)]
pub struct ResumePayload {
    pub token: String,
    pub session_id: String,
    pub seq: u64,
}
