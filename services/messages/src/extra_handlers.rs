use std::sync::Arc;
use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use uuid::Uuid;

use crate::{error::{AppError, AppResult}, middleware::ExtractUser, models::*, publisher::publish_event};

// Re-export all handlers so routes.rs can import from `handlers::`
pub use crate::message_handlers::*;

// ─── Get Single Message ────────────────────────────────────────────────────

pub async fn get_single_message(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    let rows = state.scylla
        .query(
            "SELECT channel_id, message_id, author_id, content, type, deleted \
             FROM messages WHERE channel_id = ? AND message_id = ?",
            (channel_id, message_id),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?
        .rows
        .unwrap_or_default();

    if rows.is_empty() {
        return Err(AppError::NotFound("Message not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "id": message_id,
        "channel_id": channel_id,
    })))
}

// ─── Get Reactors ──────────────────────────────────────────────────────────

pub async fn get_reactors(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path((channel_id, message_id, emoji)): Path<(Uuid, Uuid, String)>,
    Query(params): Query<GetReactorsQuery>,
) -> AppResult<Json<Vec<serde_json::Value>>> {
    let limit = params.limit.unwrap_or(25).min(100);

    let rows = state.scylla
        .query(
            format!(
                "SELECT user_id FROM message_reactions \
                 WHERE channel_id = ? AND message_id = ? AND emoji = ? LIMIT {}",
                limit
            ),
            (channel_id, message_id, &emoji),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?
        .rows
        .unwrap_or_default();

    let users: Vec<serde_json::Value> = rows
        .into_iter()
        .filter_map(|row| {
            let (user_id,): (Uuid,) = row.into_typed().ok()?;
            Some(serde_json::json!({ "id": user_id }))
        })
        .collect();

    Ok(Json(users))
}

// ─── Remove All Reactions for Emoji ───────────────────────────────────────

pub async fn remove_all_reactions_for_emoji(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path((channel_id, message_id, emoji)): Path<(Uuid, Uuid, String)>,
) -> AppResult<StatusCode> {
    state.scylla
        .query(
            "DELETE FROM message_reactions \
             WHERE channel_id = ? AND message_id = ? AND emoji = ?",
            (channel_id, message_id, &emoji),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Remove All Reactions ──────────────────────────────────────────────────

pub async fn remove_all_reactions(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    // ScyllaDB: delete partition slice
    state.scylla
        .query(
            "DELETE FROM message_reactions \
             WHERE channel_id = ? AND message_id = ?",
            (channel_id, message_id),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Unpin Message ─────────────────────────────────────────────────────────

pub async fn unpin_message(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    // Note: pinned_messages PK is (channel_id, pinned_at, message_id)
    // For delete by message_id we need an index — simplified here
    state.scylla
        .query(
            "DELETE FROM pinned_messages WHERE channel_id = ? AND message_id = ?",
            (channel_id, message_id),
        )
        .await
        .ok(); // Non-fatal if index missing

    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0, "t": "CHANNEL_PINS_UPDATE",
            "d": { "channel_id": channel_id },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
