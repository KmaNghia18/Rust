/// Gateway Opcodes — Client ← Server
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerOpcode {
    Dispatch = 0,        // Event dispatch (MESSAGE_CREATE, etc.)
    Heartbeat = 1,       // Request heartbeat from client
    Reconnect = 7,       // Tell client to reconnect
    InvalidSession = 9,  // Session invalidated
    Hello = 10,          // First message: send heartbeat_interval
    HeartbeatAck = 11,   // Heartbeat acknowledged
}

/// Gateway Opcodes — Client → Server
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
pub enum ClientOpcode {
    Heartbeat = 1,   // Client keepalive
    Identify = 2,    // Initial auth
    StatusUpdate = 3, // Presence update
    VoiceStateUpdate = 4,
    Resume = 6,      // Resume after disconnect
    RequestGuildMembers = 8,
}

/// Gateway events — dispatched to clients (op=0)
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "t", content = "d")]
pub enum GatewayEvent {
    Ready(ReadyPayload),
    MessageCreate(serde_json::Value),
    MessageUpdate(serde_json::Value),
    MessageDelete(MessageDeletePayload),
    MessageReactionAdd(serde_json::Value),
    MessageReactionRemove(serde_json::Value),
    TypingStart(TypingPayload),
    PresenceUpdate(PresencePayload),
    GuildCreate(serde_json::Value),
    GuildUpdate(serde_json::Value),
    GuildDelete(GuildDeletePayload),
    GuildMemberAdd(serde_json::Value),
    GuildMemberRemove(MemberRemovePayload),
    GuildMemberUpdate(serde_json::Value),
    ChannelCreate(serde_json::Value),
    ChannelUpdate(serde_json::Value),
    ChannelDelete(serde_json::Value),
    VoiceStateUpdate(serde_json::Value),
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReadyPayload {
    pub v: u8,
    pub user: serde_json::Value,
    pub guilds: Vec<serde_json::Value>,
    pub session_id: String,
    pub resume_gateway_url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MessageDeletePayload {
    pub id: uuid::Uuid,
    pub channel_id: uuid::Uuid,
    pub guild_id: Option<uuid::Uuid>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TypingPayload {
    pub user_id: uuid::Uuid,
    pub channel_id: uuid::Uuid,
    pub guild_id: Option<uuid::Uuid>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresencePayload {
    pub user_id: uuid::Uuid,
    pub status: String,
    pub custom_status: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GuildDeletePayload {
    pub id: uuid::Uuid,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MemberRemovePayload {
    pub guild_id: uuid::Uuid,
    pub user_id: uuid::Uuid,
}

/// Incoming client message structure
#[derive(Debug, serde::Deserialize)]
pub struct ClientMessage {
    pub op: u8,
    pub d: Option<serde_json::Value>,
    pub s: Option<u64>,   // sequence number
    pub t: Option<String>,
}

/// Outgoing server message structure
#[derive(Debug, serde::Serialize)]
pub struct ServerMessage<T: serde::Serialize> {
    pub op: u8,
    pub d: Option<T>,
    pub s: Option<u64>,
    pub t: Option<String>,
}

impl<T: serde::Serialize> ServerMessage<T> {
    pub fn dispatch(event_name: &str, data: T, seq: u64) -> Self {
        Self { op: 0, d: Some(data), s: Some(seq), t: Some(event_name.to_string()) }
    }

    pub fn hello(heartbeat_interval: u64) -> ServerMessage<serde_json::Value> {
        ServerMessage {
            op: 10,
            d: Some(serde_json::json!({ "heartbeat_interval": heartbeat_interval })),
            s: None,
            t: None,
        }
    }

    pub fn heartbeat_ack() -> ServerMessage<serde_json::Value> {
        ServerMessage { op: 11, d: None, s: None, t: None }
    }

    pub fn invalid_session(resumable: bool) -> ServerMessage<bool> {
        ServerMessage { op: 9, d: Some(resumable), s: None, t: None }
    }
}
