use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

// ─── User ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub bio: Option<String>,
    pub status: UserStatus,
    pub custom_status: Option<String>,
    pub is_bot: bool,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum UserStatus {
    Online,
    Idle,
    Dnd,
    #[default]
    Offline,
}

// ─── Guild ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guild {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub banner_url: Option<String>,
    pub owner_id: Uuid,
    pub is_public: bool,
    pub verification_level: i16,
    pub features: Vec<String>,
    pub member_count: i64,
    pub premium_tier: i16,
    pub created_at: DateTime<Utc>,
}

// ─── Channel ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: Uuid,
    pub guild_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub channel_type: ChannelType,
    pub position: i32,
    pub topic: Option<String>,
    pub nsfw: bool,
    pub slowmode_seconds: i32,
    pub bitrate: Option<i32>,
    pub user_limit: Option<i32>,
    pub last_message_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ChannelType {
    Text = 0,
    Dm = 1,
    Voice = 2,
    GroupDm = 3,
    Category = 4,
    Announcement = 5,
    Forum = 6,
}

// ─── Message ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,  // TIMEUUID as string
    pub channel_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub author_id: Uuid,
    pub content: String,
    pub timestamp: i64,
    pub edited_at: Option<i64>,
    pub message_type: MessageType,
    pub attachments: Vec<Attachment>,
    pub embeds: Vec<Embed>,
    pub reactions: Vec<Reaction>,
    pub mention_everyone: bool,
    pub mentions: Vec<Uuid>,
    pub reply_to_id: Option<String>,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    #[default]
    Default = 0,
    MemberJoin = 7,
    GuildBoost = 8,
    ChannelPinned = 6,
    ThreadCreated = 18,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: Uuid,
    pub url: String,
    pub filename: String,
    pub size: i64,
    pub content_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embed {
    pub embed_type: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub color: Option<i32>,
    pub image: Option<EmbedMedia>,
    pub thumbnail: Option<EmbedMedia>,
    pub author: Option<EmbedAuthor>,
    pub footer: Option<EmbedFooter>,
    pub fields: Vec<EmbedField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedMedia { pub url: String, pub width: Option<i32>, pub height: Option<i32> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedAuthor { pub name: String, pub icon_url: Option<String>, pub url: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedFooter { pub text: String, pub icon_url: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedField { pub name: String, pub value: String, pub inline: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction { pub emoji: String, pub count: i64, pub me: bool }

// ─── Voice State ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceState {
    pub user_id: Uuid,
    pub guild_id: Option<Uuid>,
    pub channel_id: Option<Uuid>,
    pub self_mute: bool,
    pub self_deaf: bool,
    pub self_video: bool,
    pub self_stream: bool,
    pub server_mute: bool,
    pub server_deaf: bool,
}

// ─── Permissions ───────────────────────────────────────────────────────────────

/// 64-bit permission bitfield — matches Discord's permission system
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Permissions(pub i64);

impl Permissions {
    pub const NONE: Self = Self(0);
    pub const VIEW_CHANNEL:              Self = Self(1 << 10);
    pub const SEND_MESSAGES:             Self = Self(1 << 11);
    pub const SEND_TTS_MESSAGES:         Self = Self(1 << 12);
    pub const MANAGE_MESSAGES:           Self = Self(1 << 13);
    pub const EMBED_LINKS:               Self = Self(1 << 14);
    pub const ATTACH_FILES:              Self = Self(1 << 15);
    pub const READ_MESSAGE_HISTORY:      Self = Self(1 << 16);
    pub const MENTION_EVERYONE:          Self = Self(1 << 17);
    pub const USE_EXTERNAL_EMOJIS:       Self = Self(1 << 18);
    pub const ADD_REACTIONS:             Self = Self(1 << 6);
    pub const CONNECT:                   Self = Self(1 << 20);
    pub const SPEAK:                     Self = Self(1 << 21);
    pub const MUTE_MEMBERS:              Self = Self(1 << 22);
    pub const DEAFEN_MEMBERS:            Self = Self(1 << 23);
    pub const MOVE_MEMBERS:              Self = Self(1 << 24);
    pub const USE_VAD:                   Self = Self(1 << 25);
    pub const CHANGE_NICKNAME:           Self = Self(1 << 26);
    pub const MANAGE_NICKNAMES:          Self = Self(1 << 27);
    pub const MANAGE_ROLES:              Self = Self(1 << 28);
    pub const MANAGE_WEBHOOKS:           Self = Self(1 << 29);
    pub const MANAGE_EMOJIS:             Self = Self(1 << 30);
    pub const KICK_MEMBERS:              Self = Self(1 << 1);
    pub const BAN_MEMBERS:               Self = Self(1 << 2);
    pub const ADMINISTRATOR:             Self = Self(1 << 3);
    pub const MANAGE_CHANNELS:           Self = Self(1 << 4);
    pub const MANAGE_GUILD:              Self = Self(1 << 5);
    pub const VIEW_AUDIT_LOG:            Self = Self(1 << 7);
    pub const USE_SLASH_COMMANDS:        Self = Self(1 << 31);
    pub const MANAGE_THREADS:            Self = Self(1 << 34);
    pub const ALL: Self = Self(i64::MAX);

    pub fn has(self, perm: Self) -> bool {
        self.0 & perm.0 == perm.0
    }

    pub fn add(self, perm: Self) -> Self {
        Self(self.0 | perm.0)
    }

    pub fn remove(self, perm: Self) -> Self {
        Self(self.0 & !perm.0)
    }

    pub fn is_admin(self) -> bool {
        self.has(Self::ADMINISTRATOR)
    }
}

impl From<i64> for Permissions {
    fn from(v: i64) -> Self { Self(v) }
}
impl From<Permissions> for i64 {
    fn from(p: Permissions) -> i64 { p.0 }
}
