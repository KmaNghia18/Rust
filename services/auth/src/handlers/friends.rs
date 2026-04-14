use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::AppState,
};

// ─── List Friends ──────────────────────────────────────────────────────────

pub async fn list_friends(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<Vec<FriendResponse>>> {
    let friends = sqlx::query!(
        r#"
        SELECT
            u.id, u.username, u.discriminator, u.avatar_url,
            u.status, u.custom_status,
            f.status as friendship_status,
            f.created_at as since
        FROM friendships f
        JOIN users u ON (
            CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END = u.id
        )
        WHERE (f.requester_id = $1 OR f.addressee_id = $1)
          AND f.status = 'accepted'
        ORDER BY u.username ASC
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    let result = friends
        .into_iter()
        .map(|r| FriendResponse {
            id: r.id,
            username: r.username,
            discriminator: r.discriminator,
            avatar_url: r.avatar_url,
            status: r.status,
            custom_status: r.custom_status,
            since: r.since,
        })
        .collect();

    Ok(Json(result))
}

// ─── List Pending Requests ─────────────────────────────────────────────────

pub async fn list_pending(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<PendingRequestsResponse>> {
    // Incoming requests (to me)
    let incoming = sqlx::query!(
        r#"
        SELECT u.id, u.username, u.discriminator, u.avatar_url, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = $1 AND f.status = 'pending'
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    // Outgoing requests (from me)
    let outgoing = sqlx::query!(
        r#"
        SELECT u.id, u.username, u.discriminator, u.avatar_url, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = $1 AND f.status = 'pending'
        "#,
        claims.sub
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(PendingRequestsResponse {
        incoming: incoming
            .into_iter()
            .map(|r| FriendRequestUser {
                id: r.id,
                username: r.username,
                discriminator: r.discriminator,
                avatar_url: r.avatar_url,
                since: r.created_at,
            })
            .collect(),
        outgoing: outgoing
            .into_iter()
            .map(|r| FriendRequestUser {
                id: r.id,
                username: r.username,
                discriminator: r.discriminator,
                avatar_url: r.avatar_url,
                since: r.created_at,
            })
            .collect(),
    }))
}

// ─── Send Friend Request ───────────────────────────────────────────────────

pub async fn send_request(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<FriendRequestPayload>,
) -> AppResult<StatusCode> {
    if claims.sub == payload.user_id {
        return Err(AppError::BadRequest(
            "Cannot send friend request to yourself".to_string(),
        ));
    }

    // Target user must exist
    let exists = sqlx::query_scalar!(
        "SELECT id FROM users WHERE id = $1",
        payload.user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("User not found".to_string()));
    }

    // Check for existing relationship
    let existing = sqlx::query!(
        r#"
        SELECT status FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)
        "#,
        claims.sub,
        payload.user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(rel) = existing {
        return match rel.status.as_deref() {
            Some("accepted") => Err(AppError::Conflict("Already friends".to_string())),
            Some("pending")  => Err(AppError::Conflict("Request already sent".to_string())),
            Some("blocked")  => Err(AppError::Forbidden("User is blocked".to_string())),
            _ => Err(AppError::Conflict("Relationship already exists".to_string())),
        };
    }

    sqlx::query!(
        "INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')",
        claims.sub,
        payload.user_id,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Accept Friend Request ─────────────────────────────────────────────────

pub async fn accept_request(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(requester_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let updated = sqlx::query!(
        r#"
        UPDATE friendships SET status = 'accepted'
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        "#,
        requester_id,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("Friend request not found".to_string()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ─── Decline Friend Request ────────────────────────────────────────────────

pub async fn decline_request(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(requester_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        r#"
        DELETE FROM friendships
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        "#,
        requester_id,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Remove Friend ─────────────────────────────────────────────────────────

pub async fn remove_friend(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(friend_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    sqlx::query!(
        r#"
        DELETE FROM friendships
        WHERE ((requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1))
          AND status = 'accepted'
        "#,
        claims.sub,
        friend_id,
    )
    .execute(&state.db)
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct FriendRequestPayload {
    pub user_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct FriendResponse {
    pub id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub avatar_url: Option<String>,
    pub status: String,
    pub custom_status: Option<String>,
    pub since: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct FriendRequestUser {
    pub id: Uuid,
    pub username: String,
    pub discriminator: String,
    pub avatar_url: Option<String>,
    pub since: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct PendingRequestsResponse {
    pub incoming: Vec<FriendRequestUser>,
    pub outgoing: Vec<FriendRequestUser>,
}
