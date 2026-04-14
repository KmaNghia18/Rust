use axum::{
    extract::{Multipart, Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::{AppState, UserResponse},
};

// ─── Get My Profile ────────────────────────────────────────────────────────

pub async fn get_me(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<UserResponse>> {
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT * FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    Ok(Json(UserResponse::from(user)))
}

// ─── Get User by ID ────────────────────────────────────────────────────────

pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> AppResult<Json<PublicUserResponse>> {
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT * FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(PublicUserResponse {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        bio: user.bio,
        status: user.status,
        custom_status: user.custom_status,
        created_at: user.created_at,
    }))
}

// ─── Update My Profile ─────────────────────────────────────────────────────

pub async fn update_me(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<UpdateProfileRequest>,
) -> AppResult<Json<UserResponse>> {
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Build dynamic update query
    let user = sqlx::query_as!(
        crate::models::User,
        r#"
        UPDATE users SET
            username     = COALESCE($1, username),
            bio          = COALESCE($2, bio),
            status       = COALESCE($3, status),
            custom_status = $4,
            updated_at   = NOW()
        WHERE id = $5
        RETURNING *
        "#,
        payload.username,
        payload.bio,
        payload.status,
        payload.custom_status,
        claims.sub,
    )
    .fetch_one(&state.db)
    .await?;

    Ok(Json(UserResponse::from(user)))
}

// ─── Upload Avatar ─────────────────────────────────────────────────────────

pub async fn upload_avatar(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("Multipart error: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "avatar" {
            let content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            // Validate image type
            if !["image/jpeg", "image/png", "image/gif", "image/webp"]
                .contains(&content_type.as_str())
            {
                return Err(AppError::BadRequest(
                    "Avatar must be JPEG, PNG, GIF, or WebP".to_string(),
                ));
            }

            let data = field.bytes().await.map_err(|e| {
                AppError::BadRequest(format!("Failed to read file: {}", e))
            })?;

            // Max 8MB
            if data.len() > 8 * 1024 * 1024 {
                return Err(AppError::BadRequest(
                    "Avatar must be smaller than 8MB".to_string(),
                ));
            }

            // TODO: Upload to MinIO via media service
            // For now, return a placeholder URL
            let avatar_url = format!(
                "{}/avatars/{}.webp",
                std::env::var("CDN_BASE_URL").unwrap_or_default(),
                claims.sub
            );

            sqlx::query!(
                "UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
                avatar_url,
                claims.sub,
            )
            .execute(&state.db)
            .await?;

            return Ok(Json(serde_json::json!({ "avatar_url": avatar_url })));
        }
    }

    Err(AppError::BadRequest("No avatar field found".to_string()))
}

// ─── Block / Unblock User ──────────────────────────────────────────────────

pub async fn block_user(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(target_id): Path<Uuid>,
) -> AppResult<axum::http::StatusCode> {
    if claims.sub == target_id {
        return Err(AppError::BadRequest("Cannot block yourself".to_string()));
    }

    // Upsert block relationship
    sqlx::query!(
        r#"
        INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES ($1, $2, 'blocked')
        ON CONFLICT (requester_id, addressee_id)
        DO UPDATE SET status = 'blocked'
        "#,
        claims.sub,
        target_id,
    )
    .execute(&state.db)
    .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn unblock_user(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(target_id): Path<Uuid>,
) -> AppResult<axum::http::StatusCode> {
    sqlx::query!(
        "DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'",
        claims.sub,
        target_id,
    )
    .execute(&state.db)
    .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProfileRequest {
    #[validate(length(min = 2, max = 32))]
    pub username: Option<String>,
    #[validate(length(max = 190))]
    pub bio: Option<String>,
    pub status: Option<String>,
    #[validate(length(max = 128))]
    pub custom_status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PublicUserResponse {
    pub id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub bio: Option<String>,
    pub status: String,
    pub custom_status: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
