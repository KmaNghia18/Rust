use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::*,
    permissions::Permissions,
    handlers::guilds::{ensure_member, require_permission, log_audit},
};

// ─── List Channels ─────────────────────────────────────────────────────────

pub async fn list_channels(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<Vec<ChannelWithOverwrites>>> {
    ensure_member(&state.db, guild_id, claims.sub).await?;

    let channels = sqlx::query_as!(
        Channel,
        "SELECT * FROM channels WHERE guild_id = $1 ORDER BY position ASC, created_at ASC",
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    let mut result = Vec::with_capacity(channels.len());
    for channel in channels {
        let overwrites = sqlx::query_as!(
            ChannelOverwrite,
            "SELECT * FROM channel_overwrites WHERE channel_id = $1",
            channel.id
        )
        .fetch_all(&state.db)
        .await?;

        result.push(ChannelWithOverwrites { channel, overwrites });
    }

    Ok(Json(result))
}

// ─── Get Channel ───────────────────────────────────────────────────────────

pub async fn get_channel(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<Channel>> {
    let channel = sqlx::query_as!(
        Channel,
        "SELECT * FROM channels WHERE id = $1",
        channel_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    if let Some(guild_id) = channel.guild_id {
        ensure_member(&state.db, guild_id, claims.sub).await?;
    }

    Ok(Json(channel))
}

// ─── Create Channel ────────────────────────────────────────────────────────

pub async fn create_channel(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Json(payload): Json<CreateChannelRequest>,
) -> AppResult<(StatusCode, Json<Channel>)> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_CHANNELS).await?;

    // Get max position
    let max_pos = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(position), -1) FROM channels WHERE guild_id = $1",
        guild_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(-1);

    let channel_type = payload.r#type.unwrap_or(0);

    // Validate parent (category)
    if let Some(parent_id) = payload.parent_id {
        let parent = sqlx::query!(
            "SELECT type FROM channels WHERE id = $1 AND guild_id = $2",
            parent_id,
            guild_id
        )
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Category not found".to_string()))?;

        if parent.r#type != 4 {
            return Err(AppError::BadRequest("Parent must be a Category channel".to_string()));
        }
    }

    let channel = sqlx::query_as!(
        Channel,
        r#"
        INSERT INTO channels (guild_id, parent_id, name, type, topic, position, nsfw, slowmode_delay, bitrate, user_limit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#,
        guild_id,
        payload.parent_id,
        payload.name.to_lowercase().replace(' ', "-"),
        channel_type,
        payload.topic,
        payload.position.unwrap_or(max_pos + 1),
        payload.nsfw.unwrap_or(false),
        payload.slowmode_delay.unwrap_or(0),
        payload.bitrate.unwrap_or(64000),
        payload.user_limit.unwrap_or(0),
    )
    .fetch_one(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(channel.id), 10, None, None).await?;
    Ok((StatusCode::CREATED, Json(channel)))
}

// ─── Update Channel ────────────────────────────────────────────────────────

pub async fn update_channel(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<UpdateChannelRequest>,
) -> AppResult<Json<Channel>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let channel = sqlx::query!("SELECT guild_id FROM channels WHERE id = $1", channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    let guild_id = channel.guild_id.ok_or_else(|| {
        AppError::BadRequest("Cannot edit DM channels".to_string())
    })?;

    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_CHANNELS).await?;

    let updated = sqlx::query_as!(
        Channel,
        r#"
        UPDATE channels SET
            name           = COALESCE($1, name),
            topic          = COALESCE($2, topic),
            nsfw           = COALESCE($3, nsfw),
            slowmode_delay = COALESCE($4, slowmode_delay),
            bitrate        = COALESCE($5, bitrate),
            user_limit     = COALESCE($6, user_limit),
            parent_id      = COALESCE($7, parent_id),
            position       = COALESCE($8, position),
            updated_at     = NOW()
        WHERE id = $9
        RETURNING *
        "#,
        payload.name,
        payload.topic,
        payload.nsfw,
        payload.slowmode_delay,
        payload.bitrate,
        payload.user_limit,
        payload.parent_id,
        payload.position,
        channel_id,
    )
    .fetch_one(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(channel_id), 11, None, None).await?;
    Ok(Json(updated))
}

// ─── Delete Channel ────────────────────────────────────────────────────────

pub async fn delete_channel(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let channel = sqlx::query!("SELECT guild_id FROM channels WHERE id = $1", channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    let guild_id = channel.guild_id.ok_or_else(|| {
        AppError::BadRequest("Cannot delete DM channels".to_string())
    })?;

    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_CHANNELS).await?;

    sqlx::query!("DELETE FROM channels WHERE id = $1", channel_id)
        .execute(&state.db)
        .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(channel_id), 12, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Reorder Channels ──────────────────────────────────────────────────────

pub async fn reorder_channels(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Json(payload): Json<Vec<ReorderRequest>>,
) -> AppResult<StatusCode> {
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_CHANNELS).await?;

    let mut tx = state.db.begin().await?;
    for item in payload {
        sqlx::query!(
            "UPDATE channels SET position = $1 WHERE id = $2 AND guild_id = $3",
            item.position,
            item.id,
            guild_id,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Update Permission Overwrite ───────────────────────────────────────────

pub async fn update_overwrite(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, target_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateOverwriteRequest>,
) -> AppResult<StatusCode> {
    let channel = sqlx::query!("SELECT guild_id FROM channels WHERE id = $1", channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    let guild_id = channel.guild_id.unwrap();
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    sqlx::query!(
        r#"
        INSERT INTO channel_overwrites (channel_id, target_id, target_type, allow, deny)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (channel_id, target_id)
        DO UPDATE SET allow = $4, deny = $5
        "#,
        channel_id,
        target_id,
        payload.target_type,
        payload.allow,
        payload.deny,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Delete Permission Overwrite ───────────────────────────────────────────

pub async fn delete_overwrite(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, target_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    let channel = sqlx::query!("SELECT guild_id FROM channels WHERE id = $1", channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    let guild_id = channel.guild_id.unwrap();
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    sqlx::query!(
        "DELETE FROM channel_overwrites WHERE channel_id = $1 AND target_id = $2",
        channel_id,
        target_id,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct ChannelWithOverwrites {
    #[serde(flatten)]
    pub channel: Channel,
    pub overwrites: Vec<ChannelOverwrite>,
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateOverwriteRequest {
    pub target_type: String,
    pub allow: i64,
    pub deny: i64,
}
