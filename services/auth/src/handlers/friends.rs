use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use crate::{middleware::ExtractUser, error::ApiError};

// ─── Types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Friendship {
    pub id: Uuid,
    pub user_id: Uuid,
    pub friend_id: Uuid,
    pub status: String,
    pub initiator: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FriendWithUser {
    pub friendship_id: Uuid,
    pub status: String,
    pub friend_id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub avatar_url: Option<String>,
    pub online_status: String,
    pub since: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SendFriendRequest {
    pub username: String,
    pub discriminator: Option<String>,  // "username#1234" support
}

// ─── Handlers ──────────────────────────────────────────────────────────────

/// GET /api/v1/friends
/// List all friends, pending requests, and blocked users
pub async fn list_friends(
    user: ExtractUser,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let me = user.0.sub;

    let friends = sqlx::query_as::<_, FriendWithUser>(r#"
        SELECT
            f.id         AS friendship_id,
            f.status,
            u.id         AS friend_id,
            u.username,
            u.discriminator,
            u.avatar_url,
            COALESCE(u.status, 'offline') AS online_status,
            f.created_at AS since
        FROM friendships f
        JOIN users u ON (
            CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END = u.id
        )
        WHERE (f.user_id = $1 OR f.friend_id = $1)
          AND f.status != 'blocked'
        ORDER BY f.status, u.username
    "#)
    .bind(me)
    .fetch_all(&pool)
    .await?;

    let all_friends: Vec<_>     = friends.iter().filter(|f| f.status == "accepted").collect();
    let pending_in: Vec<_>      = friends.iter().filter(|f| f.status == "pending").collect();
    let pending_out: Vec<_>     = friends.iter().filter(|f| f.status == "pending").collect();

    Ok(Json(serde_json::json!({
        "friends": all_friends,
        "pending_incoming": pending_in,
        "pending_outgoing": pending_out,
    })))
}

/// POST /api/v1/friends
/// Send friend request by username
pub async fn send_friend_request(
    user: ExtractUser,
    State(pool): State<PgPool>,
    Json(body): Json<SendFriendRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let me = user.0.sub;

    // Parse "username#1234" format
    let (uname, disc) = if let Some((u, d)) = body.username.split_once('#') {
        (u.to_string(), Some(d.to_string()))
    } else {
        (body.username.clone(), body.discriminator)
    };

    // Find target user
    let target = sqlx::query!(
        "SELECT id FROM users WHERE username = $1 AND ($2::text IS NULL OR discriminator = $2)",
        uname, disc
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| ApiError::not_found(format!("User '{}' not found", uname)))?;

    let friend_id = target.id;

    if friend_id == me {
        return Err(ApiError::bad_request("You cannot add yourself as a friend"));
    }

    // Check existing relationship
    let existing = sqlx::query!(
        "SELECT status FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",
        me, friend_id
    )
    .fetch_optional(&pool)
    .await?;

    if let Some(rel) = existing {
        return Err(ApiError::conflict(format!(
            "Friendship already exists with status: {}", rel.status
        )));
    }

    // Create pending request (smaller UUID is always user_id for deduplication)
    let (uid, fid) = if me < friend_id { (me, friend_id) } else { (friend_id, me) };
    let friendship = sqlx::query_as::<_, Friendship>(
        "INSERT INTO friendships (user_id, friend_id, status, initiator)
         VALUES ($1, $2, 'pending', $3)
         RETURNING *"
    )
    .bind(uid)
    .bind(fid)
    .bind(me)
    .fetch_one(&pool)
    .await?;

    Ok(Json(serde_json::json!(friendship)))
}

/// PUT /api/v1/friends/:friendship_id/accept
pub async fn accept_friend_request(
    user: ExtractUser,
    Path(friendship_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let me = user.0.sub;

    let result = sqlx::query!(
        r#"UPDATE friendships
           SET status = 'accepted', updated_at = NOW()
           WHERE id = $1
             AND (user_id = $2 OR friend_id = $2)
             AND initiator != $2
             AND status = 'pending'
           RETURNING id"#,
        friendship_id, me
    )
    .fetch_optional(&pool)
    .await?;

    if result.is_none() {
        return Err(ApiError::not_found("Friend request not found or already processed"));
    }

    // Create DM channel between the two users
    let friendship = sqlx::query!(
        "SELECT user_id, friend_id FROM friendships WHERE id=$1", friendship_id
    )
    .fetch_one(&pool)
    .await?;

    let dm_id = open_dm_channel(&pool, friendship.user_id, friendship.friend_id).await?;

    Ok(Json(serde_json::json!({
        "friendship_id": friendship_id,
        "status": "accepted",
        "dm_channel_id": dm_id
    })))
}

/// DELETE /api/v1/friends/:friendship_id
/// Remove friend or decline request
pub async fn remove_friend(
    user: ExtractUser,
    Path(friendship_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<StatusCode, ApiError> {
    let me = user.0.sub;

    sqlx::query!(
        "DELETE FROM friendships WHERE id=$1 AND (user_id=$2 OR friend_id=$2)",
        friendship_id, me
    )
    .execute(&pool)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/friends/:user_id/block
pub async fn block_user(
    user: ExtractUser,
    Path(target_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let me = user.0.sub;

    // Upsert block relationship
    sqlx::query!(
        r#"INSERT INTO friendships (user_id, friend_id, status, initiator)
           VALUES ($1, $2, 'blocked', $1)
           ON CONFLICT (user_id, friend_id)
           DO UPDATE SET status = 'blocked', initiator = $1, updated_at = NOW()"#,
        me, target_id
    )
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({ "blocked_user_id": target_id })))
}

// ─── DM Channels ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DmChannel {
    pub id: Uuid,
    pub channel_type: i16,
    pub name: Option<String>,
    pub icon_url: Option<String>,
    pub last_message_id: Option<Uuid>,
}

/// GET /api/v1/channels/@me
/// List all user's DM channels
pub async fn list_dm_channels(
    user: ExtractUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<serde_json::Value>>, ApiError> {
    let me = user.0.sub;

    let channels = sqlx::query!(r#"
        SELECT
            dc.id, dc.channel_type, dc.name, dc.icon_url, dc.last_message_id,
            dp.last_read_at,
            (
                SELECT json_agg(json_build_object(
                    'user_id', p2.user_id,
                    'username', u.username,
                    'avatar_url', u.avatar_url,
                    'status', COALESCE(u.status, 'offline')
                ))
                FROM dm_participants p2
                JOIN users u ON u.id = p2.user_id
                WHERE p2.channel_id = dc.id AND p2.user_id != $1
            ) AS recipients
        FROM dm_channels dc
        JOIN dm_participants dp ON dp.channel_id = dc.id AND dp.user_id = $1
        WHERE dp.is_closed = false
        ORDER BY dc.updated_at DESC
    "#)
    .bind(me)
    .fetch_all(&pool)
    .await?;

    let result: Vec<_> = channels.iter().map(|c| serde_json::json!({
        "id": c.id,
        "type": c.channel_type,
        "name": c.name,
        "icon_url": c.icon_url,
        "last_message_id": c.last_message_id,
        "recipients": c.recipients,
        "last_read_at": c.last_read_at,
    })).collect();

    Ok(Json(result))
}

/// POST /api/v1/channels/@me
/// Open or get existing DM channel with a user
pub async fn open_or_get_dm(
    user: ExtractUser,
    State(pool): State<PgPool>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let me = user.0.sub;
    let recipient_id: Uuid = body["recipient_id"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| ApiError::bad_request("recipient_id required"))?;

    let channel_id = open_dm_channel(&pool, me, recipient_id).await?;

    // Re-open if was closed
    sqlx::query!(
        "UPDATE dm_participants SET is_closed=false WHERE channel_id=$1 AND user_id=$2",
        channel_id, me
    )
    .execute(&pool)
    .await?;

    Ok(Json(serde_json::json!({ "id": channel_id, "type": 1 })))
}

/// DELETE /api/v1/channels/@me/:channel_id
/// Close (hide) a DM channel
pub async fn close_dm_channel(
    user: ExtractUser,
    Path(channel_id): Path<Uuid>,
    State(pool): State<PgPool>,
) -> Result<StatusCode, ApiError> {
    let me = user.0.sub;

    sqlx::query!(
        "UPDATE dm_participants SET is_closed=true WHERE channel_id=$1 AND user_id=$2",
        channel_id, me
    )
    .execute(&pool)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Helper ─────────────────────────────────────────────────────────────────

pub async fn open_dm_channel(pool: &PgPool, user_a: Uuid, user_b: Uuid) -> Result<Uuid, ApiError> {
    // Find existing DM channel between two users
    let existing = sqlx::query!(r#"
        SELECT dc.id FROM dm_channels dc
        JOIN dm_participants p1 ON p1.channel_id = dc.id AND p1.user_id = $1
        JOIN dm_participants p2 ON p2.channel_id = dc.id AND p2.user_id = $2
        WHERE dc.channel_type = 1
        LIMIT 1
    "#, user_a, user_b)
    .fetch_optional(pool)
    .await?;

    if let Some(ch) = existing {
        return Ok(ch.id);
    }

    // Create new DM channel
    let channel_id: Uuid = sqlx::query_scalar!(
        "INSERT INTO dm_channels (channel_type) VALUES (1) RETURNING id"
    )
    .fetch_one(pool)
    .await?;

    // Add both participants
    sqlx::query!(
        "INSERT INTO dm_participants (channel_id, user_id) VALUES ($1, $2), ($1, $3)",
        channel_id, user_a, user_b
    )
    .execute(pool)
    .await?;

    Ok(channel_id)
}
