use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use elasticsearch::Elasticsearch;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{error::{AppError, AppResult}, middleware::ExtractUser, indices::*};

#[derive(Clone)]
pub struct AppState {
    pub es: Elasticsearch,
    pub config: crate::config::Config,
}

// ─── Search Messages ───────────────────────────────────────────────────────

pub async fn search_messages(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    Query(params): Query<MessageSearchQuery>,
) -> AppResult<Json<SearchResult<MessageDoc>>> {
    params.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let q = params.q.as_deref().unwrap_or("").trim().to_string();
    if q.is_empty() {
        return Err(AppError::BadRequest("Search query must not be empty".into()));
    }

    let result = crate::indices::search_messages(
        &state.es,
        &q,
        Some(guild_id),
        params.channel_id,
        params.from_user.map(|_| claims.sub), // "from:" filter defaults to self if specified
        params.has_file,
        params.before,
        params.after,
        params.limit.unwrap_or(25).min(100) as i64,
        params.offset.unwrap_or(0) as i64,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok(Json(result))
}

// ─── Search Guilds (Discovery) ─────────────────────────────────────────────

pub async fn discover_guilds(
    State(state): State<AppState>,
    Query(params): Query<BasicSearchQuery>,
) -> AppResult<Json<SearchResult<GuildDoc>>> {
    params.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let result = crate::indices::search_guilds(
        &state.es,
        &params.q,
        params.limit.unwrap_or(20).min(50) as i64,
        params.offset.unwrap_or(0) as i64,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok(Json(result))
}

// ─── Search Users ──────────────────────────────────────────────────────────

pub async fn search_users(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Query(params): Query<BasicSearchQuery>,
) -> AppResult<Json<SearchResult<UserDoc>>> {
    params.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let result = crate::indices::search_users(
        &state.es,
        &params.q,
        params.limit.unwrap_or(10).min(25) as i64,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok(Json(result))
}

// ─── Index Endpoints (internal, called by other services via Kafka) ────────

pub async fn index_message(
    State(state): State<AppState>,
    Json(doc): Json<MessageDoc>,
) -> AppResult<StatusCode> {
    crate::indices::index_message(&state.es, &doc)
        .await
        .map_err(|e| AppError::Internal(e))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_message_index(
    State(state): State<AppState>,
    Path(message_id): Path<String>,
) -> AppResult<StatusCode> {
    crate::indices::delete_message(&state.es, &message_id)
        .await
        .map_err(|e| AppError::Internal(e))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn index_user(
    State(state): State<AppState>,
    Json(doc): Json<UserDoc>,
) -> AppResult<StatusCode> {
    crate::indices::index_user(&state.es, &doc)
        .await
        .map_err(|e| AppError::Internal(e))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn index_guild(
    State(state): State<AppState>,
    Json(doc): Json<GuildDoc>,
) -> AppResult<StatusCode> {
    crate::indices::index_guild(&state.es, &doc)
        .await
        .map_err(|e| AppError::Internal(e))?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Query DTOs ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Validate)]
pub struct MessageSearchQuery {
    #[validate(length(min = 1, max = 100))]
    pub q: Option<String>,
    pub channel_id: Option<Uuid>,
    pub from_user: Option<bool>,    // filter to own messages
    pub has_file: Option<bool>,
    pub before: Option<i64>,        // timestamp ms
    pub after: Option<i64>,         // timestamp ms
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct BasicSearchQuery {
    #[validate(length(min = 1, max = 100))]
    pub q: String,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}
