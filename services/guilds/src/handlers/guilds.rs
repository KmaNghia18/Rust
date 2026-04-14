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
};

// ─── Create Guild ──────────────────────────────────────────────────────────

pub async fn create_guild(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<CreateGuildRequest>,
) -> AppResult<(StatusCode, Json<Guild>)> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Start transaction
    let mut tx = state.db.begin().await?;

    // Create guild
    let guild = sqlx::query_as!(
        Guild,
        r#"
        INSERT INTO guilds (name, description, icon_url, is_public, owner_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
        payload.name,
        payload.description,
        payload.icon_url,
        payload.is_public.unwrap_or(false),
        claims.sub,
    )
    .fetch_one(&mut *tx)
    .await?;

    // Create @everyone role (position 0, default perms)
    let default_perms = Permissions::default_permissions().bits();
    sqlx::query!(
        r#"
        INSERT INTO roles (guild_id, name, position, permissions)
        VALUES ($1, '@everyone', 0, $2)
        "#,
        guild.id,
        default_perms,
    )
    .execute(&mut *tx)
    .await?;

    // Add owner as member
    sqlx::query!(
        "INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2)",
        guild.id,
        claims.sub,
    )
    .execute(&mut *tx)
    .await?;

    // Create default #general text channel
    let _channel = sqlx::query!(
        r#"
        INSERT INTO channels (guild_id, name, type, position)
        VALUES ($1, 'general', 0, 0)
        RETURNING id
        "#,
        guild.id,
    )
    .fetch_one(&mut *tx)
    .await?;

    // Create default General voice channel
    sqlx::query!(
        "INSERT INTO channels (guild_id, name, type, position) VALUES ($1, 'General', 2, 1)",
        guild.id,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    tracing::info!("Guild created: {} by {}", guild.id, claims.sub);
    Ok((StatusCode::CREATED, Json(guild)))
}

// ─── Get Guild ─────────────────────────────────────────────────────────────

pub async fn get_guild(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<GuildDetail>> {
    // Verify membership
    ensure_member(&state.db, guild_id, claims.sub).await?;

    let guild = sqlx::query_as!(Guild, "SELECT * FROM guilds WHERE id = $1", guild_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Server not found".to_string()))?;

    let channels = sqlx::query_as!(
        Channel,
        "SELECT * FROM channels WHERE guild_id = $1 ORDER BY position ASC",
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    let roles = sqlx::query_as!(
        Role,
        "SELECT * FROM roles WHERE guild_id = $1 ORDER BY position DESC",
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    let member_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM guild_members WHERE guild_id = $1",
        guild_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    Ok(Json(GuildDetail {
        guild,
        channels,
        roles,
        member_count,
    }))
}

// ─── List My Guilds ────────────────────────────────────────────────────────

pub async fn list_my_guilds(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<Vec<GuildSummary>>> {
    let guilds = sqlx::query!(
        r#"
        SELECT g.id, g.name, g.icon_url, g.owner_id,
               (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) as member_count
        FROM guilds g
        INNER JOIN guild_members gm ON gm.guild_id = g.id
        WHERE gm.user_id = $1
        ORDER BY g.created_at ASC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        guilds
            .into_iter()
            .map(|r| GuildSummary {
                id: r.id,
                name: r.name,
                icon_url: r.icon_url,
                owner: r.owner_id == claims.sub,
                member_count: r.member_count.unwrap_or(0),
            })
            .collect(),
    ))
}

// ─── Update Guild ──────────────────────────────────────────────────────────

pub async fn update_guild(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Json(payload): Json<UpdateGuildRequest>,
) -> AppResult<Json<Guild>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_GUILD).await?;

    let guild = sqlx::query_as!(
        Guild,
        r#"
        UPDATE guilds SET
            name                = COALESCE($1, name),
            description         = COALESCE($2, description),
            icon_url            = COALESCE($3, icon_url),
            banner_url          = COALESCE($4, banner_url),
            is_public           = COALESCE($5, is_public),
            verification_level  = COALESCE($6, verification_level),
            default_notif_level = COALESCE($7, default_notif_level),
            explicit_filter     = COALESCE($8, explicit_filter),
            preferred_locale    = COALESCE($9, preferred_locale),
            system_channel_id   = COALESCE($10, system_channel_id),
            afk_channel_id      = COALESCE($11, afk_channel_id),
            afk_timeout         = COALESCE($12, afk_timeout),
            updated_at          = NOW()
        WHERE id = $13
        RETURNING *
        "#,
        payload.name,
        payload.description,
        payload.icon_url,
        payload.banner_url,
        payload.is_public,
        payload.verification_level,
        payload.default_notif_level,
        payload.explicit_filter,
        payload.preferred_locale,
        payload.system_channel_id,
        payload.afk_channel_id,
        payload.afk_timeout,
        guild_id,
    )
    .fetch_one(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, None, 1, None, None).await?;
    Ok(Json(guild))
}

// ─── Delete Guild ──────────────────────────────────────────────────────────

pub async fn delete_guild(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    // Only owner can delete
    let guild = sqlx::query!("SELECT owner_id FROM guilds WHERE id = $1", guild_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Server not found".to_string()))?;

    if guild.owner_id != claims.sub {
        return Err(AppError::Forbidden(
            "Only the server owner can delete it".to_string(),
        ));
    }

    sqlx::query!("DELETE FROM guilds WHERE id = $1", guild_id)
        .execute(&state.db)
        .await?;

    tracing::info!("Guild deleted: {} by {}", guild_id, claims.sub);
    Ok(StatusCode::NO_CONTENT)
}

// ─── Leave Guild ───────────────────────────────────────────────────────────

pub async fn leave_guild(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let guild = sqlx::query!("SELECT owner_id FROM guilds WHERE id = $1", guild_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Server not found".to_string()))?;

    if guild.owner_id == claims.sub {
        return Err(AppError::BadRequest(
            "Owner cannot leave; transfer ownership first".to_string(),
        ));
    }

    sqlx::query!(
        "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2",
        guild_id,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Transfer Ownership ────────────────────────────────────────────────────

pub async fn transfer_ownership(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Json(payload): Json<TransferOwnershipRequest>,
) -> AppResult<Json<Guild>> {
    let guild = sqlx::query!("SELECT owner_id FROM guilds WHERE id = $1", guild_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Server not found".to_string()))?;

    if guild.owner_id != claims.sub {
        return Err(AppError::Forbidden("Only the owner can transfer ownership".to_string()));
    }

    ensure_member(&state.db, guild_id, payload.new_owner_id).await?;

    let updated = sqlx::query_as!(
        Guild,
        "UPDATE guilds SET owner_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        payload.new_owner_id,
        guild_id,
    )
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

pub async fn ensure_member(db: &sqlx::PgPool, guild_id: Uuid, user_id: Uuid) -> AppResult<()> {
    let is_member = sqlx::query_scalar!(
        "SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2",
        guild_id,
        user_id
    )
    .fetch_optional(db)
    .await?;

    if is_member.is_none() {
        return Err(AppError::Forbidden("You are not a member of this server".to_string()));
    }
    Ok(())
}

pub async fn require_permission(
    state: &AppState,
    guild_id: Uuid,
    user_id: Uuid,
    required: Permissions,
) -> AppResult<()> {
    // Owner bypasses all
    let guild = sqlx::query!("SELECT owner_id FROM guilds WHERE id = $1", guild_id)
        .fetch_one(&state.db)
        .await?;

    if guild.owner_id == user_id {
        return Ok(());
    }

    ensure_member(&state.db, guild_id, user_id).await?;

    // Get all role permissions for this member
    let perms: i64 = sqlx::query_scalar!(
        r#"
        SELECT COALESCE(bit_or(r.permissions), 0)
        FROM member_roles mr
        JOIN roles r ON r.id = mr.role_id
        WHERE mr.guild_id = $1 AND mr.user_id = $2
        "#,
        guild_id,
        user_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    // Also get @everyone role
    let everyone_perms: i64 = sqlx::query_scalar!(
        "SELECT permissions FROM roles WHERE guild_id = $1 AND name = '@everyone'",
        guild_id
    )
    .fetch_optional(&state.db)
    .await?
    .unwrap_or(0);

    let effective = perms | everyone_perms;

    // ADMINISTRATOR bypasses everything
    if effective & Permissions::ADMINISTRATOR.bits() != 0 {
        return Ok(());
    }

    if effective & required.bits() == 0 {
        return Err(AppError::Forbidden(
            "You don't have permission to do that".to_string(),
        ));
    }

    Ok(())
}

pub async fn log_audit(
    db: &sqlx::PgPool,
    guild_id: Uuid,
    user_id: Uuid,
    target_id: Option<Uuid>,
    action_type: i16,
    changes: Option<serde_json::Value>,
    reason: Option<String>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO audit_logs (guild_id, user_id, target_id, action_type, changes, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
        guild_id,
        user_id,
        target_id,
        action_type,
        changes,
        reason,
    )
    .execute(db)
    .await?;
    Ok(())
}

// ─── Response DTOs ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct GuildDetail {
    #[serde(flatten)]
    pub guild: Guild,
    pub channels: Vec<Channel>,
    pub roles: Vec<Role>,
    pub member_count: i64,
}

#[derive(Debug, serde::Serialize)]
pub struct GuildSummary {
    pub id: Uuid,
    pub name: String,
    pub icon_url: Option<String>,
    pub owner: bool,
    pub member_count: i64,
}

#[derive(Debug, serde::Deserialize)]
pub struct TransferOwnershipRequest {
    pub new_owner_id: Uuid,
}
