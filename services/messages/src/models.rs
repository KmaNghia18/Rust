use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub scylla: Arc<scylla::Session>,
    pub redis: redis::Client,
    pub config: crate::config::Config,
}

// ─── Core Message Model ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct Message {
    pub id: String,            // TIMEUUID as string
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub author_id: Uuid,
    pub content: String,
    pub r#type: i8,
    pub attachments: Vec<Attachment>,
    pub embeds: Vec<Embed>,
    pub mentions: Vec<Uuid>,
    pub mention_roles: Vec<Uuid>,
    pub mention_everyone: bool,
    pub reactions: Vec<Reaction>,
    pub edited_at: Option<i64>,
    pub deleted: bool,
    pub reply_to: Option<MessageReference>,
    pub thread_id: Option<Uuid>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: Uuid,
    pub url: String,
    pub filename: String,
    pub size: i64,          // bytes
    pub content_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub spoiler: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embed {
    pub r#type: String,     // "link", "image", "video", "rich"
    pub url: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub color: Option<i32>,
    pub image: Option<EmbedMedia>,
    pub thumbnail: Option<EmbedMedia>,
    pub video: Option<EmbedMedia>,
    pub provider: Option<EmbedProvider>,
    pub author: Option<EmbedAuthor>,
    pub fields: Vec<EmbedField>,
    pub footer: Option<EmbedFooter>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedMedia { pub url: String, pub width: Option<i32>, pub height: Option<i32> }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedProvider { pub name: Option<String>, pub url: Option<String> }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedAuthor { pub name: String, pub url: Option<String>, pub icon_url: Option<String> }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedField { pub name: String, pub value: String, pub inline: bool }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedFooter { pub text: String, pub icon_url: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,      // unicode or "name:id"
    pub count: i32,
    pub me: bool,           // did the requesting user react
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageReference {
    pub message_id: String,
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
}

// ─── Request DTOs ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, validator::Validate)]
pub struct SendMessageRequest {
    #[validate(length(min = 1, max = 4000))]
    pub content: Option<String>,
    pub attachments: Option<Vec<AttachmentRef>>,
    pub embeds: Option<Vec<Embed>>,
    pub reply_to_id: Option<String>,
    pub nonce: Option<String>,  // idempotency key
    pub tts: Option<bool>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct EditMessageRequest {
    #[validate(length(min = 1, max = 4000))]
    pub content: Option<String>,
    pub embeds: Option<Vec<Embed>>,
    pub flags: Option<i32>,  // suppress_embeds
}

#[derive(Debug, Deserialize, Clone)]
pub struct AttachmentRef {
    pub id: Uuid,    // ID returned from /attachments upload endpoint
}

#[derive(Debug, Deserialize)]
pub struct GetMessagesQuery {
    pub before: Option<String>,  // TIMEUUID — get messages before this
    pub after: Option<String>,   // TIMEUUID — get messages after this
    pub around: Option<String>,  // TIMEUUID — get messages around this
    pub limit: Option<i32>,      // default 50, max 100
}

#[derive(Debug, Deserialize)]
pub struct GetReactorsQuery {
    pub after: Option<Uuid>,
    pub limit: Option<i32>,
}

// ─── Kafka Events ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct KafkaMessageEvent {
    pub event_type: String,  // "MESSAGE_CREATE" | "MESSAGE_UPDATE" | "MESSAGE_DELETE"
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub message: Option<Message>,
    pub message_id: Option<String>,
}
