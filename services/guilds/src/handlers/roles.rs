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

// ─── List Roles ────────────────────────────────────────────────────────────

pub async fn list_roles(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<Vec<Role>>> {
    ensure_member(&state.db, guild_id, claims.sub).await?;

    let roles = sqlx::query_as!(
        Role,
        "SELECT * FROM roles WHERE guild_id = $1 ORDER BY position DESC",
        guild_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(roles))
}

// ─── Create Role ───────────────────────────────────────────────────────────

pub async fn create_role(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Json(payload): Json<CreateRoleRequest>,
) -> AppResult<(StatusCode, Json<Role>)> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    let max_pos = sqlx::query_scalar!(
        "SELECT COALESCE(MAX(position), 0) FROM roles WHERE guild_id = $1",
        guild_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(0);

    let role = sqlx::query_as!(
        Role,
        r#"
        INSERT INTO roles (guild_id, name, color, hoist, mentionable, permissions, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
        guild_id,
        payload.name,
        payload.color.unwrap_or(0),
        payload.hoist.unwrap_or(false),
        payload.mentionable.unwrap_or(false),
        payload.permissions.unwrap_or(0),
        max_pos + 1,
    )
    .fetch_one(&state.db)
    .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(role.id), 30, None, None).await?;
    Ok((StatusCode::CREATED, Json(role)))
}

// ─── Update Role ───────────────────────────────────────────────────────────

pub async fn update_role(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, role_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateRoleRequest>,
) -> AppResult<Json<Role>> {
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    let role = sqlx::query_as!(
        Role,
        r#"
        UPDATE roles SET
            name        = COALESCE($1, name),
            color       = COALESCE($2, color),
            hoist       = COALESCE($3, hoist),
            mentionable = COALESCE($4, mentionable),
            permissions = COALESCE($5, permissions),
            position    = COALESCE($6, position)
        WHERE id = $7 AND guild_id = $8
        RETURNING *
        "#,
        payload.name,
        payload.color,
        payload.hoist,
        payload.mentionable,
        payload.permissions,
        payload.position,
        role_id,
        guild_id,
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Role not found".to_string()))?;

    log_audit(&state.db, guild_id, claims.sub, Some(role_id), 31, None, None).await?;
    Ok(Json(role))
}

// ─── Delete Role ───────────────────────────────────────────────────────────

pub async fn delete_role(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, role_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    // Cannot delete @everyone
    let role = sqlx::query!("SELECT name FROM roles WHERE id = $1 AND guild_id = $2", role_id, guild_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Role not found".to_string()))?;

    if role.name == "@everyone" {
        return Err(AppError::BadRequest("Cannot delete @everyone role".to_string()));
    }

    sqlx::query!("DELETE FROM roles WHERE id = $1 AND guild_id = $2", role_id, guild_id)
        .execute(&state.db)
        .await?;

    log_audit(&state.db, guild_id, claims.sub, Some(role_id), 32, None, None).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Add Role to Member ────────────────────────────────────────────────────

pub async fn add_member_role(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id, role_id)): Path<(Uuid, Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;
    ensure_member(&state.db, guild_id, user_id).await?;

    sqlx::query!(
        r#"
        INSERT INTO member_roles (guild_id, user_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        "#,
        guild_id,
        user_id,
        role_id,
    )
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db, guild_id, claims.sub, Some(user_id), 25,
        Some(serde_json::json!({ "role_id": role_id, "action": "add" })),
        None,
    ).await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Remove Role from Member ───────────────────────────────────────────────

pub async fn remove_member_role(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((guild_id, user_id, role_id)): Path<(Uuid, Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    require_permission(&state, guild_id, claims.sub, Permissions::MANAGE_ROLES).await?;

    sqlx::query!(
        "DELETE FROM member_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3",
        guild_id,
        user_id,
        role_id,
    )
    .execute(&state.db)
    .await?;

    log_audit(
        &state.db, guild_id, claims.sub, Some(user_id), 25,
        Some(serde_json::json!({ "role_id": role_id, "action": "remove" })),
        None,
    ).await?;

    Ok(StatusCode::NO_CONTENT)
}
