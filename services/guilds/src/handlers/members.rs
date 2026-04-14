use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::*,
    permissions::Permissions,
    handlers::guilds::{ensure_member, require_permission, log_audit},
};

// ─── List Members ──────────────────────────────────────────────────────────

pub async fn list_members(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Query(params): Query<ListMembersQuery>,
) -> AppResult<Json<Vec<MemberResponse>>> {
    ensure_member(&state.db, guild_id, claims.sub).await?;

    let limit = params.limit.unwrap_or(50).min(1000);
    let after = params.after.unwrap_or(Uuid::nil());

    let members = sqlx::query!(
        r#"
        SELECT
            gm.guild_id, gm.user_id, gm.nickname, gm.avatar_url,
            gm.joined_at, gm.deaf, gm.mute, gm.timed_out_until,
            ARRAY_AGG(mr.role_id) FILTER (WHERE mr.role_id IS NOT NULL) as role_ids
        FROM guild_members gm
        LEFT JOIN member_roles mr ON mr.guild_id = gm.guild_id AND mr.user_id = gm.user_id
        WHERE gm.guild_id = $1 AND gm.user_id > $2
        GROUP BY gm.guild_id, gm.user_id, gm.nickname, gm.avatar_url,
                 gm.joined_at, gm.deaf, gm.mute, gm.timed_out_until
        ORDER BY gm.joined_at ASC
        LIMIT $3
        "#,
        guild_id,
        after,
        limit as i64,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        members
            .into_iter()
            .map(|m| MemberResponse {
                user_id: m.user_id,
                nickname: m.nickname,
                avatar_url: m.avatar_url,
                joined_at: m.joined_at,
                role_ids: m.role_ids.unwrap_or_default(),
                deaf: m.deaf,
                mute: m.mute,
                timed_out_until: m.timed_out_until,
            })
            .collect(),
    ))
}

// ─── Update Member ─────────────────────────────────────────────────────────

pub async fn update_member(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateMemberRequest>,
) -> AppResult<StatusCode> {
    ensure_member(&state.db, guild_id, user_id).await?;

    // Nickname: user can change own, MANAGE_NICKNAMES for others
    if payload.nickname.is_some() {
        if user_id == claims.sub {
            require_permission(&state, guild_id, claims.sub, Permissions::CHANGE_NICKNAME).await?;
        } else {
            require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_NICKNAMES).await?;
        }
    }

    // Mute/Deaf
    if payload.mute.is_some() || payload.deaf.is_some() {
        require_permission(&state, guild_id, claims.sub, Permissions::MUTE_MEMBERS).await?;
    }

    // Timeout
    if payload.timed_out_until.is_some() {
        require_permission(&state, guild_id, claims.sub, Permissions::MODERATE_MEMBERS).await?;
    }

    sqlx::query!(
        r#"
        UPDATE guild_members SET
            nickname        = COALESCE($1, nickname),
            mute            = COALESCE($2, mute),
            deaf            = COALESCE($3, deaf),
            timed_out_until = $4
        WHERE guild_id = $5 AND user_id = $6
        "#,
        payload.nickname,
        payload.mute,
        payload.deaf,
        payload.timed_out_until,
        guild_id,
        user_id,
    )
    .execute(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(user_id), 24, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Kick Member ───────────────────────────────────────────────────────────

pub async fn kick_member(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    if user_id == claims.sub {
        return Err(AppError::BadRequest("Cannot kick yourself".to_string()));
    }
    require_permission(&state, guild_id, claims.sub, Permissions::KICK_MEMBERS).await?;

    sqlx::query!(
        "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2",
        guild_id,
        user_id,
    )
    .execute(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(user_id), 20, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Ban Member ────────────────────────────────────────────────────────────

pub async fn ban_member(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<BanRequest>,
) -> AppResult<StatusCode> {
    if user_id == claims.sub {
        return Err(AppError::BadRequest("Cannot ban yourself".to_string()));
    }
    require_permission(&state, guild_id, claims.sub, Permissions::BAN_MEMBERS).await?;

    let mut tx = state.db.begin().await?;

    // Remove from members
    sqlx::query!(
        "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2",
        guild_id,
        user_id,
    )
    .execute(&mut *tx)
    .await?;

    // Add to bans
    sqlx::query!(
        r#"
        INSERT INTO guild_bans (guild_id, user_id, reason, banned_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = $3, banned_by = $4
        "#,
        guild_id,
        user_id,
        payload.reason,
        claims.sub,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    log_audit(&state.db, guild_id, claims.sub, Some(user_id), 22, None, payload.reason).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Unban Member ──────────────────────────────────────────────────────────

pub async fn unban_member(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    require_permission(&state, guild_id, claims.sub, Permissions::BAN_MEMBERS).await?;

    sqlx::query!(
        "DELETE FROM guild_bans WHERE guild_id = $1 AND user_id = $2",
        guild_id,
        user_id,
    )
    .execute(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(user_id), 23, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── List Bans ─────────────────────────────────────────────────────────────

pub async fn list_bans(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<Vec<BanEntry>>> {
    require_permission(&state, guild_id, claims.sub, Permissions::BAN_MEMBERS).await?;

    let bans = sqlx::query_as!(
        BanEntry,
        r#"
        SELECT user_id, reason, banned_by, created_at
        FROM guild_bans
        WHERE guild_id = $1
        ORDER BY created_at DESC
        "#,
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(bans))
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ListMembersQuery {
    pub limit: Option<i64>,
    pub after: Option<Uuid>,    // pagination cursor
}

#[derive(Debug, Serialize)]
pub struct MemberResponse {
    pub user_id: Uuid,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub joined_at: chrono::DateTime<chrono::Utc>,
    pub role_ids: Vec<Uuid>,
    pub deaf: bool,
    pub mute: bool,
    pub timed_out_until: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BanEntry {
    pub user_id: Uuid,
    pub reason: Option<String>,
    pub banned_by: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
