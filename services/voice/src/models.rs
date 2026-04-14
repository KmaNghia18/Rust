use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Voice state for a single user in a voice channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceState {
    pub user_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub channel_id: Option<Uuid>,   // None = disconnected
    pub session_id: String,
    pub self_mute: bool,
    pub self_deaf: bool,
    pub self_video: bool,
    pub self_stream: bool,          // Go Live
    pub server_mute: bool,          // muted by server admin
    pub server_deaf: bool,
    pub suppress: bool,             // stage channel listener
    pub joined_at: Option<i64>,
}

/// A voice channel room — tracks all participants
#[derive(Debug, Clone)]
pub struct VoiceRoom {
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub participants: HashMap<Uuid, VoiceParticipant>,
}

#[derive(Debug, Clone)]
pub struct VoiceParticipant {
    pub user_id: Uuid,
    pub session_id: String,
    pub state: VoiceState,
    pub peer_id: String,            // WebRTC peer identifier
}

// ─── WebRTC Signaling Messages ─────────────────────────────────────────────

/// Client → Voice Server (over WebSocket)
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientSignal {
    Identify { token: String, channel_id: Uuid },
    Offer { sdp: String, peer_id: String },
    Answer { sdp: String, peer_id: String },
    IceCandidate { candidate: IceCandidateDto, peer_id: String },
    Heartbeat,
    StateUpdate { self_mute: bool, self_deaf: bool, self_video: bool },
    Disconnect,
}

/// Voice Server → Client (over WebSocket)
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerSignal {
    Hello { heartbeat_interval: u64, session_id: String },
    Ready { ssrc: u32, ip: String, port: u16, modes: Vec<String> },
    SessionDescription { sdp: String, peer_id: String },
    IceCandidate { candidate: IceCandidateDto, peer_id: String },
    /// Sent when a new user joins this voice channel
    UserJoined { user_id: Uuid, peer_id: String, state: VoiceState },
    /// Sent when a user leaves this voice channel
    UserLeft { user_id: Uuid },
    /// Current state of the voice channel
    VoiceStateUpdate { states: Vec<VoiceState> },
    /// Who is speaking right now
    Speaking { user_id: Uuid, speaking: bool, ssrc: u32 },
    HeartbeatAck,
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceCandidateDto {
    pub candidate: String,
    pub sdp_mid: Option<String>,
    pub sdp_mline_index: Option<u16>,
}

// ─── REST Models ───────────────────────────────────────────────────────────

/// Response when client requests to join a voice channel
#[derive(Debug, Serialize)]
pub struct VoiceServerInfo {
    pub token: String,           // Short-lived voice token
    pub endpoint: String,        // WebSocket URL of voice server
    pub guild_id: Option<Uuid>,
    pub channel_id: Uuid,
}

/// Request to update own voice state
#[derive(Debug, Deserialize)]
pub struct VoiceStateUpdateRequest {
    pub channel_id: Option<Uuid>,   // None = disconnect
    pub self_mute: Option<bool>,
    pub self_deaf: Option<bool>,
}

/// App state for voice service
#[derive(Clone)]
pub struct AppState {
    pub redis: redis::Client,
    pub config: crate::config::Config,
    pub rooms: std::sync::Arc<dashmap::DashMap<Uuid, VoiceRoom>>,
}
