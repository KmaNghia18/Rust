use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    push::{self, PushSubscription},
};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: redis::Client,
    pub config: crate::config::Config,
}

// ─── Get Inbox ─────────────────────────────────────────────────────────────

pub async fn get_notifications(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Query(params): Query<InboxQuery>,
) -> AppResult<Json<Vec<NotificationRow>>> {
    let limit = params.limit.unwrap_or(25).min(100) as i64;
    let unread_only = params.unread_only.unwrap_or(false);

    let rows = if unread_only {
        sqlx::query_as!(
            NotificationRow,
            r#"SELECT id, type as "notif_type", title, body, icon_url, action_url, read, data, created_at
               FROM notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC LIMIT $2"#,
            claims.sub, limit
        )
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as!(
            NotificationRow,
            r#"SELECT id, type as "notif_type", title, body, icon_url, action_url, read, data, created_at
               FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2"#,
            claims.sub, limit
        )
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(rows))
}

// ─── Mark Read ─────────────────────────────────────────────────────────────

pub async fn mark_read(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(notif_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2",
        notif_id, claims.sub
    )
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<StatusCode> {
    sqlx::query!(
        "UPDATE notifications SET read = true WHERE user_id = $1 AND read = false",
        claims.sub
    )
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_notification(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(notif_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
        notif_id, claims.sub
    )
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Push Subscription Management ─────────────────────────────────────────

pub async fn subscribe_push(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<SubscribeRequest>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        r#"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (endpoint) DO UPDATE SET p256dh = $3, auth = $4"#,
        claims.sub,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        payload.user_agent,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("Push subscription registered for user {}", claims.sub);
    Ok(StatusCode::CREATED)
}

pub async fn unsubscribe_push(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<UnsubscribeRequest>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
        claims.sub, payload.endpoint
    )
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Notification Settings ─────────────────────────────────────────────────

pub async fn get_settings(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<Vec<NotifSettingRow>>> {
    let rows = sqlx::query_as!(
        NotifSettingRow,
        "SELECT target_type, target_id, muted, muted_until, notification_level,
                suppress_everyone, suppress_roles, mobile_push
         FROM notification_settings WHERE user_id = $1",
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn update_settings(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<UpdateSettingsRequest>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        r#"INSERT INTO notification_settings
           (user_id, target_type, target_id, muted, notification_level,
            suppress_everyone, suppress_roles, mobile_push)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, target_type, COALESCE(target_id, '00000000-0000-0000-0000-000000000000'))
           DO UPDATE SET
               muted = $4,
               notification_level = $5,
               suppress_everyone = $6,
               suppress_roles = $7,
               mobile_push = $8"#,
        claims.sub,
        payload.target_type,
        payload.target_id,
        payload.muted.unwrap_or(false),
        payload.notification_level.unwrap_or(0),
        payload.suppress_everyone.unwrap_or(false),
        payload.suppress_roles.unwrap_or(false),
        payload.mobile_push.unwrap_or(true),
    )
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Internal: Send Notification (called by other services) ───────────────

pub async fn send_notification(
    State(state): State<AppState>,
    Json(payload): Json<SendNotifRequest>,
) -> AppResult<StatusCode> {
    // 1. Store in-app notification
    sqlx::query!(
        r#"INSERT INTO notifications
           (user_id, type, title, body, icon_url, action_url, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        payload.user_id,
        payload.notif_type,
        payload.title,
        payload.body,
        payload.icon_url,
        payload.action_url,
        payload.data,
    )
    .execute(&state.db)
    .await?;

    // 2. Check user notification settings
    let settings = sqlx::query!(
        "SELECT notification_level, muted FROM notification_settings
         WHERE user_id = $1 AND target_type = 'global'",
        payload.user_id
    )
    .fetch_optional(&state.db)
    .await?;

    let muted = settings.as_ref().map(|s| s.muted).unwrap_or(false);
    let level = settings.as_ref().map(|s| s.notification_level).unwrap_or(0);

    if muted || level == 2 {
        return Ok(StatusCode::ACCEPTED);
    }

    // 3. Real-time ping via Redis (Gateway will send to open clients)
    if let Ok(mut conn) = state.redis.get_connection() {
        let event = serde_json::json!({
            "op": 0,
            "t": "NOTIFICATION_CREATE",
            "d": {
                "user_id": payload.user_id,
                "type": payload.notif_type,
                "title": payload.title,
                "body": payload.body,
            }
        });
        let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
            .arg(format!("user:{}", payload.user_id))
            .arg(event.to_string())
            .query(&mut conn);
    }

    // 4. Web Push for offline/background users
    let subs = sqlx::query_as!(
        PushSubscription,
        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
        payload.user_id
    )
    .fetch_all(&state.db)
    .await?;

    for sub in subs {
        let config = state.config.clone();
        let title = payload.title.clone();
        let body = payload.body.clone();
        let action_url = payload.action_url.clone();
        let db = state.db.clone();
        let endpoint = sub.endpoint.clone();

        tokio::spawn(async move {
            match push::send_push(&config, &sub, &title, &body, None, action_url.as_deref()).await {
                Ok(_) => {}
                Err(e) if e.to_string() == "subscription_expired" => {
                    // Clean up dead subscription
                    let _ = sqlx::query!(
                        "DELETE FROM push_subscriptions WHERE endpoint = $1",
                        endpoint
                    )
                    .execute(&db)
                    .await;
                }
                Err(e) => tracing::error!("Push error: {}", e),
            }
        });
    }

    Ok(StatusCode::ACCEPTED)
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct NotificationRow {
    pub id: Uuid,
    pub notif_type: String,
    pub title: String,
    pub body: String,
    pub icon_url: Option<String>,
    pub action_url: Option<String>,
    pub read: bool,
    pub data: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct NotifSettingRow {
    pub target_type: String,
    pub target_id: Option<Uuid>,
    pub muted: bool,
    pub muted_until: Option<chrono::DateTime<chrono::Utc>>,
    pub notification_level: i16,
    pub suppress_everyone: bool,
    pub suppress_roles: bool,
    pub mobile_push: bool,
}

#[derive(Debug, Deserialize)]
pub struct InboxQuery { pub limit: Option<i64>, pub unread_only: Option<bool> }

#[derive(Debug, Deserialize)]
pub struct SubscribeRequest {
    pub endpoint: String,
    pub user_agent: Option<String>,
    pub keys: PushKeys,
}

#[derive(Debug, Deserialize)]
pub struct PushKeys { pub p256dh: String, pub auth: String }

#[derive(Debug, Deserialize)]
pub struct UnsubscribeRequest { pub endpoint: String }

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub target_type: String,
    pub target_id: Option<Uuid>,
    pub muted: Option<bool>,
    pub notification_level: Option<i16>,
    pub suppress_everyone: Option<bool>,
    pub suppress_roles: Option<bool>,
    pub mobile_push: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct SendNotifRequest {
    pub user_id: Uuid,
    pub notif_type: String,
    pub title: String,
    pub body: String,
    pub icon_url: Option<String>,
    pub action_url: Option<String>,
    pub data: Option<serde_json::Value>,
}
