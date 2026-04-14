use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::*,
    handlers::guilds::{ensure_member, log_audit},
};

// ─── Create Invite ─────────────────────────────────────────────────────────

pub async fn create_invite(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<CreateInviteRequest>,
) -> AppResult<(StatusCode, Json<InviteResponse>)> {
    // Verify channel exists and user is in guild
    let channel = sqlx::query!("SELECT guild_id FROM channels WHERE id = $1", channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".to_string()))?;

    let guild_id = channel.guild_id.ok_or_else(|| {
        AppError::BadRequest("Cannot create invite for DM channel".to_string())
    })?;
    ensure_member(&state.db, guild_id, claims.sub).await?;

    // Generate unique invite code (6 chars like Discord)
    let code = nanoid::nanoid!(8, &nanoid::alphabet::SAFE);

    let max_age = payload.max_age.unwrap_or(86400); // default 24 hours
    let expires_at = if max_age > 0 {
        Some(chrono::Utc::now() + chrono::Duration::seconds(max_age as i64))
    } else {
        None
    };

    let invite = sqlx::query_as!(
        Invite,
        r#"
        INSERT INTO invites (code, guild_id, channel_id, creator_id, max_uses, temporary, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
        code,
        guild_id,
        channel_id,
        claims.sub,
        payload.max_uses,
        payload.temporary.unwrap_or(false),
        expires_at,
    )
    .fetch_one(&state.db)
    .await?;

    // Fetch guild name for response
    let guild = sqlx::query!("SELECT name, icon_url FROM guilds WHERE id = $1", guild_id)
        .fetch_one(&state.db)
        .await?;

    log_audit(&state.db, guild_id, claims.sub, None, 40, None, None).await?;

    Ok((StatusCode::CREATED, Json(InviteResponse {
        code: invite.code,
        guild_id,
        guild_name: guild.name,
        guild_icon_url: guild.icon_url,
        channel_id,
        uses: invite.uses,
        max_uses: invite.max_uses,
        temporary: invite.temporary,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
    })))
}

// ─── Get Invite ────────────────────────────────────────────────────────────

pub async fn get_invite(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> AppResult<Json<InviteResponse>> {
    let invite = sqlx::query_as!(
        Invite,
        "SELECT * FROM invites WHERE code = $1",
        code
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Invite not found or expired".to_string()))?;

    // Check expiry
    if let Some(exp) = invite.expires_at {
        if exp < chrono::Utc::now() {
            sqlx::query!("DELETE FROM invites WHERE code = $1", code)
                .execute(&state.db)
                .await?;
            return Err(AppError::NotFound("Invite has expired".to_string()));
        }
    }

    let guild = sqlx::query!(
        "SELECT name, icon_url FROM guilds WHERE id = $1",
        invite.guild_id
    )
    .fetch_one(&state.db)
    .await?;

    Ok(Json(InviteResponse {
        code: invite.code,
        guild_id: invite.guild_id,
        guild_name: guild.name,
        guild_icon_url: guild.icon_url,
        channel_id: invite.channel_id.unwrap_or(Uuid::nil()),
        uses: invite.uses,
        max_uses: invite.max_uses,
        temporary: invite.temporary,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
    }))
}

// ─── Use Invite (Join Server) ──────────────────────────────────────────────

pub async fn use_invite(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(code): Path<String>,
) -> AppResult<Json<JoinResponse>> {
    let invite = sqlx::query_as!(
        Invite,
        "SELECT * FROM invites WHERE code = $1",
        code
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Invite not found".to_string()))?;

    // Check expiry
    if let Some(exp) = invite.expires_at {
        if exp < chrono::Utc::now() {
            return Err(AppError::BadRequest("Invite has expired".to_string()));
        }
    }

    // Check max_uses
    if let Some(max) = invite.max_uses {
        if invite.uses >= max {
            return Err(AppError::BadRequest("Invite has reached its maximum uses".to_string()));
        }
    }

    // Check if already a member
    let already_member = sqlx::query_scalar!(
        "SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2",
        invite.guild_id,
        claims.sub,
    )
    .fetch_optional(&state.db)
    .await?;

    if already_member.is_some() {
        return Err(AppError::Conflict("Already a member of this server".to_string()));
    }

    // Check ban
    let is_banned = sqlx::query_scalar!(
        "SELECT 1 FROM guild_bans WHERE guild_id = $1 AND user_id = $2",
        invite.guild_id,
        claims.sub,
    )
    .fetch_optional(&state.db)
    .await?;

    if is_banned.is_some() {
        return Err(AppError::Forbidden("You are banned from this server".to_string()));
    }

    // Add member + increment uses
    let mut tx = state.db.begin().await?;
    sqlx::query!(
        "INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2)",
        invite.guild_id,
        claims.sub,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        "UPDATE invites SET uses = uses + 1 WHERE code = $1",
        code
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let guild = sqlx::query_as!(
        crate::models::Guild,
        "SELECT * FROM guilds WHERE id = $1",
        invite.guild_id
    )
    .fetch_one(&state.db)
    .await?;

    tracing::info!("User {} joined guild {} via invite {}", claims.sub, invite.guild_id, code);

    Ok(Json(JoinResponse { guild }))
}

// ─── Delete Invite ─────────────────────────────────────────────────────────

pub async fn delete_invite(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(code): Path<String>,
) -> AppResult<StatusCode> {
    let invite = sqlx::query!("SELECT guild_id, creator_id FROM invites WHERE code = $1", code)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Invite not found".to_string()))?;

    // Must be creator or have MANAGE_GUILD
    if invite.creator_id != claims.sub {
        crate::handlers::guilds::require_permission(
            &state, invite.guild_id, claims.sub, crate::permissions::Permissions::MANAGE_GUILD
        ).await?;
    }

    sqlx::query!("DELETE FROM invites WHERE code = $1", code)
        .execute(&state.db)
        .await?;

    log_audit(&state.db, invite.guild_id, claims.sub, None, 42, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── List Guild Invites ────────────────────────────────────────────────────

pub async fn list_guild_invites(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<Vec<Invite>>> {
    crate::handlers::guilds::require_permission(
        &state, guild_id, claims.sub, crate::permissions::Permissions::MANAGE_GUILD
    ).await?;

    let invites = sqlx::query_as!(
        Invite,
        "SELECT * FROM invites WHERE guild_id = $1 ORDER BY created_at DESC",
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(invites))
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct InviteResponse {
    pub code: String,
    pub guild_id: Uuid,
    pub guild_name: String,
    pub guild_icon_url: Option<String>,
    pub channel_id: Uuid,
    pub uses: i32,
    pub max_uses: Option<i32>,
    pub temporary: bool,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, serde::Serialize)]
pub struct JoinResponse {
    pub guild: Guild,
}
