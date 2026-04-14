use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: redis::Client,
    pub config: crate::config::Config,
}

// ─── Guild ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Guild {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub banner_url: Option<String>,
    pub owner_id: Uuid,
    pub is_public: bool,
    pub vanity_url_code: Option<String>,
    pub verification_level: i16,
    pub explicit_filter: i16,
    pub default_notif_level: i16,
    pub boost_count: i32,
    pub boost_level: i16,
    pub max_members: i32,
    pub preferred_locale: String,
    pub system_channel_id: Option<Uuid>,
    pub rules_channel_id: Option<Uuid>,
    pub afk_channel_id: Option<Uuid>,
    pub afk_timeout: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

// ─── Role ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Role {
    pub id: Uuid,
    pub guild_id: Uuid,
    pub name: String,
    pub color: i32,
    pub hoist: bool,
    pub icon_url: Option<String>,
    pub position: i32,
    pub permissions: i64,
    pub mentionable: bool,
    pub managed: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ─── Channel ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub guild_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub r#type: i16,
    pub topic: Option<String>,
    pub position: i32,
    pub nsfw: bool,
    pub slowmode_delay: i32,
    pub bitrate: i32,
    pub user_limit: i32,
    pub rtc_region: Option<String>,
    pub video_quality: i16,
    pub last_message_id: Option<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

// ─── Channel Overwrite ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelOverwrite {
    pub channel_id: Uuid,
    pub target_id: Uuid,
    pub target_type: String,
    pub allow: i64,
    pub deny: i64,
}

// ─── Guild Member ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct GuildMember {
    pub guild_id: Uuid,
    pub user_id: Uuid,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub joined_at: chrono::DateTime<chrono::Utc>,
    pub premium_since: Option<chrono::DateTime<chrono::Utc>>,
    pub deaf: bool,
    pub mute: bool,
    pub pending: bool,
    pub timed_out_until: Option<chrono::DateTime<chrono::Utc>>,
}

// ─── Invite ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Invite {
    pub code: String,
    pub guild_id: Uuid,
    pub channel_id: Option<Uuid>,
    pub creator_id: Uuid,
    pub uses: i32,
    pub max_uses: Option<i32>,
    pub temporary: bool,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

// ─── Request DTOs ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, validator::Validate)]
pub struct CreateGuildRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: String,
    #[validate(length(max = 1024))]
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct UpdateGuildRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: Option<String>,
    #[validate(length(max = 1024))]
    pub description: Option<String>,
    pub icon_url: Option<String>,
    pub banner_url: Option<String>,
    pub is_public: Option<bool>,
    pub verification_level: Option<i16>,
    pub default_notif_level: Option<i16>,
    pub explicit_filter: Option<i16>,
    pub preferred_locale: Option<String>,
    pub system_channel_id: Option<Uuid>,
    pub afk_channel_id: Option<Uuid>,
    pub afk_timeout: Option<i32>,
    pub vanity_url_code: Option<String>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct CreateChannelRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: String,
    pub r#type: Option<i16>,
    pub parent_id: Option<Uuid>,
    #[validate(length(max = 1024))]
    pub topic: Option<String>,
    pub nsfw: Option<bool>,
    pub position: Option<i32>,
    pub slowmode_delay: Option<i32>,
    pub bitrate: Option<i32>,
    pub user_limit: Option<i32>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct UpdateChannelRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: Option<String>,
    #[validate(length(max = 1024))]
    pub topic: Option<String>,
    pub nsfw: Option<bool>,
    pub slowmode_delay: Option<i32>,
    pub bitrate: Option<i32>,
    pub user_limit: Option<i32>,
    pub parent_id: Option<Uuid>,
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct CreateRoleRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    pub color: Option<i32>,
    pub hoist: Option<bool>,
    pub mentionable: Option<bool>,
    pub permissions: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub color: Option<i32>,
    pub hoist: Option<bool>,
    pub mentionable: Option<bool>,
    pub permissions: Option<i64>,
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    pub max_uses: Option<i32>,
    pub max_age: Option<i32>,   // seconds; 0 or None = never expires
    pub temporary: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRequest {
    pub nickname: Option<String>,
    pub mute: Option<bool>,
    pub deaf: Option<bool>,
    pub timed_out_until: Option<chrono::DateTime<chrono::Utc>>,
    pub channel_id: Option<Uuid>,        // move to voice channel
}

#[derive(Debug, Deserialize)]
pub struct BanRequest {
    pub reason: Option<String>,
    pub delete_message_days: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub id: Uuid,
    pub position: i32,
}
