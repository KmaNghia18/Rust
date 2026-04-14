use std::sync::Arc;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use scylla::IntoTypedRows;
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::*,
    publisher::publish_event,
};

// ─── Send Message ──────────────────────────────────────────────────────────

pub async fn send_message(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> AppResult<(StatusCode, Json<Message>)> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    // Must have content or attachments
    if payload.content.as_deref().unwrap_or("").is_empty()
        && payload.attachments.as_deref().unwrap_or(&[]).is_empty()
    {
        return Err(AppError::BadRequest(
            "Message must have content or attachments".to_string(),
        ));
    }

    let content = payload.content.unwrap_or_default();
    let message_id = uuid::Uuid::new_v4(); // In production: use TIMEUUID from ScyllaDB

    // Serialize lists to JSON strings for ScyllaDB
    let attachments_json: Vec<String> = payload
        .attachments
        .unwrap_or_default()
        .iter()
        .map(|a| serde_json::json!({ "id": a.id }).to_string())
        .collect();

    let embeds_json: Vec<String> = payload
        .embeds
        .unwrap_or_default()
        .iter()
        .map(|e| serde_json::to_string(e).unwrap_or_default())
        .collect();

    // Extract @mentions from content
    let mentions = extract_mentions(&content);
    let mention_everyone = content.contains("@everyone") || content.contains("@here");

    // Insert into ScyllaDB
    state.scylla.query(
        r#"INSERT INTO messages (
            channel_id, message_id, author_id, content,
            type, attachments, embeds, mentions, mention_everyone,
            deleted, reply_to_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)"#,
        (
            channel_id,
            message_id,
            claims.sub,
            &content,
            0i8, // type = default
            &attachments_json,
            &embeds_json,
            &mentions,
            mention_everyone,
            payload.reply_to_id.as_deref().and_then(|s| s.parse::<Uuid>().ok()),
        ),
    )
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("ScyllaDB error: {}", e)))?;

    let message = Message {
        id: message_id.to_string(),
        channel_id,
        guild_id: None, // TODO: look up from channel
        author_id: claims.sub,
        content: content.clone(),
        r#type: 0,
        attachments: vec![],
        embeds: vec![],
        mentions: mentions.clone(),
        mention_roles: vec![],
        mention_everyone,
        reactions: vec![],
        edited_at: None,
        deleted: false,
        reply_to: None,
        thread_id: None,
        timestamp: chrono::Utc::now().timestamp_millis(),
    };

    // Publish MESSAGE_CREATE to Kafka → Gateway will forward to WebSocket clients
    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_CREATE",
            "d": &message,
        }),
    )
    .await;

    tracing::info!("Message {} sent in channel {}", message_id, channel_id);
    Ok((StatusCode::CREATED, Json(message)))
}

// ─── Get Messages ──────────────────────────────────────────────────────────

pub async fn get_messages(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    Query(params): Query<GetMessagesQuery>,
) -> AppResult<Json<Vec<Message>>> {
    let limit = params.limit.unwrap_or(50).min(100) as i32;

    // Build CQL query with cursor-based pagination
    let (query, values_desc) = if let Some(before_id) = &params.before {
        (
            format!(
                "SELECT channel_id, message_id, author_id, content, type, \
                 attachments, embeds, mentions, mention_everyone, reactions, \
                 edited_at, deleted, reply_to_id, thread_id \
                 FROM messages WHERE channel_id = ? AND message_id < ? LIMIT {}",
                limit
            ),
            Some(before_id.clone()),
        )
    } else {
        (
            format!(
                "SELECT channel_id, message_id, author_id, content, type, \
                 attachments, embeds, mentions, mention_everyone, reactions, \
                 edited_at, deleted, reply_to_id, thread_id \
                 FROM messages WHERE channel_id = ? LIMIT {}",
                limit
            ),
            None,
        )
    };

    let rows = if let Some(before_str) = values_desc {
        let before_uuid = before_str.parse::<Uuid>()
            .map_err(|_| AppError::BadRequest("Invalid cursor".to_string()))?;
        state.scylla
            .query(query, (channel_id, before_uuid))
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("ScyllaDB error: {}", e)))?
            .rows
            .unwrap_or_default()
    } else {
        state.scylla
            .query(query, (channel_id,))
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("ScyllaDB error: {}", e)))?
            .rows
            .unwrap_or_default()
    };

    // Map rows to Message structs (simplified)
    let messages: Vec<Message> = rows
        .into_iter()
        .filter_map(|row| {
            let (channel_id, message_id, author_id, content, msg_type,
                 _attachments, _embeds, _mentions, mention_everyone,
                 _reactions, _edited_at, deleted, _reply_to, _thread_id)
                : (Uuid, Uuid, Uuid, Option<String>, Option<i8>,
                   Option<Vec<String>>, Option<Vec<String>>, Option<Vec<Uuid>>,
                   Option<bool>, Option<std::collections::HashMap<String, i32>>,
                   Option<i64>, Option<bool>, Option<Uuid>, Option<Uuid>)
                = row.into_typed().ok()?;

            if deleted.unwrap_or(false) {
                return None;
            }

            Some(Message {
                id: message_id.to_string(),
                channel_id,
                guild_id: None,
                author_id,
                content: content.unwrap_or_default(),
                r#type: msg_type.unwrap_or(0),
                attachments: vec![],
                embeds: vec![],
                mentions: _mentions.unwrap_or_default(),
                mention_roles: vec![],
                mention_everyone: mention_everyone.unwrap_or(false),
                reactions: vec![],
                edited_at: _edited_at,
                deleted: false,
                reply_to: None,
                thread_id: _thread_id,
                timestamp: 0,
            })
        })
        .collect();

    Ok(Json(messages))
}

// ─── Edit Message ──────────────────────────────────────────────────────────

pub async fn edit_message(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<EditMessageRequest>,
) -> AppResult<Json<serde_json::Value>> {
    payload.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let now = chrono::Utc::now().timestamp_millis();

    // Verify author (can only edit own messages)
    let rows = state.scylla
        .query(
            "SELECT author_id FROM messages WHERE channel_id = ? AND message_id = ?",
            (channel_id, message_id),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?
        .rows
        .unwrap_or_default();

    if rows.is_empty() {
        return Err(AppError::NotFound("Message not found".to_string()));
    }

    let (author_id,): (Uuid,) = rows[0].clone().into_typed()
        .map_err(|_| AppError::Internal(anyhow::anyhow!("Row parse error")))?;

    if author_id != claims.sub {
        return Err(AppError::Forbidden("You can only edit your own messages".to_string()));
    }

    if let Some(content) = &payload.content {
        state.scylla
            .query(
                "UPDATE messages SET content = ?, edited_at = ? WHERE channel_id = ? AND message_id = ?",
                (content, now, channel_id, message_id),
            )
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;
    }

    // Publish MESSAGE_UPDATE event
    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_UPDATE",
            "d": {
                "id": message_id,
                "channel_id": channel_id,
                "content": payload.content,
                "edited_at": now,
            },
        }),
    )
    .await;

    Ok(Json(serde_json::json!({ "id": message_id, "edited_at": now })))
}

// ─── Delete Message ────────────────────────────────────────────────────────

pub async fn delete_message(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    // Soft-delete (set deleted = true)
    state.scylla
        .query(
            "UPDATE messages SET deleted = true WHERE channel_id = ? AND message_id = ?",
            (channel_id, message_id),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;

    // Publish MESSAGE_DELETE event to Redis
    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_DELETE",
            "d": {
                "id": message_id,
                "channel_id": channel_id,
            },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Bulk Delete ───────────────────────────────────────────────────────────

pub async fn bulk_delete(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    Json(payload): Json<BulkDeleteRequest>,
) -> AppResult<StatusCode> {
    if payload.ids.len() > 100 {
        return Err(AppError::BadRequest("Max 100 messages per bulk delete".to_string()));
    }

    for id in &payload.ids {
        state.scylla
            .query(
                "UPDATE messages SET deleted = true WHERE channel_id = ? AND message_id = ?",
                (channel_id, *id),
            )
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;
    }

    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_DELETE_BULK",
            "d": { "ids": payload.ids, "channel_id": channel_id },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Reactions ─────────────────────────────────────────────────────────────

pub async fn add_reaction(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id, emoji)): Path<(Uuid, Uuid, String)>,
) -> AppResult<StatusCode> {
    let now = chrono::Utc::now().timestamp_millis();

    state.scylla
        .query(
            "INSERT INTO message_reactions (channel_id, message_id, emoji, user_id, reacted_at) VALUES (?, ?, ?, ?, ?)",
            (channel_id, message_id, &emoji, claims.sub, now),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;

    // Update reaction counter on the message
    state.scylla
        .query(
            "UPDATE messages SET reactions[?] = reactions[?] + 1 WHERE channel_id = ? AND message_id = ?",
            (&emoji, &emoji, channel_id, message_id),
        )
        .await
        .ok(); // non-critical

    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_REACTION_ADD",
            "d": {
                "user_id": claims.sub,
                "channel_id": channel_id,
                "message_id": message_id,
                "emoji": emoji,
            },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn remove_reaction(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id, emoji)): Path<(Uuid, Uuid, String)>,
) -> AppResult<StatusCode> {
    state.scylla
        .query(
            "DELETE FROM message_reactions WHERE channel_id = ? AND message_id = ? AND emoji = ? AND user_id = ?",
            (channel_id, message_id, &emoji, claims.sub),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;

    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "MESSAGE_REACTION_REMOVE",
            "d": {
                "user_id": claims.sub,
                "channel_id": channel_id,
                "message_id": message_id,
                "emoji": emoji,
            },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Typing Indicator ──────────────────────────────────────────────────────

pub async fn trigger_typing(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "TYPING_START",
            "d": {
                "user_id": claims.sub,
                "channel_id": channel_id,
                "timestamp": chrono::Utc::now().timestamp(),
            },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Pinned Messages ───────────────────────────────────────────────────────

pub async fn pin_message(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    let now = chrono::Utc::now().timestamp_millis();

    state.scylla
        .query(
            "INSERT INTO pinned_messages (channel_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)",
            (channel_id, message_id, claims.sub, now),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;

    publish_event(
        &state.redis,
        &format!("channel:{}", channel_id),
        &serde_json::json!({
            "op": 0,
            "t": "CHANNEL_PINS_UPDATE",
            "d": { "channel_id": channel_id },
        }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_pinned_messages(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<Vec<serde_json::Value>>> {
    // Return pin metadata (full messages would need a secondary lookup)
    let rows = state.scylla
        .query(
            "SELECT message_id, pinned_by, pinned_at FROM pinned_messages WHERE channel_id = ? LIMIT 50",
            (channel_id,),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?
        .rows
        .unwrap_or_default();

    let pins: Vec<serde_json::Value> = rows
        .into_iter()
        .filter_map(|row| {
            let (message_id, pinned_by, pinned_at): (Uuid, Uuid, i64) =
                row.into_typed().ok()?;
            Some(serde_json::json!({
                "message_id": message_id,
                "pinned_by": pinned_by,
                "pinned_at": pinned_at,
            }))
        })
        .collect();

    Ok(Json(pins))
}

// ─── Read State ────────────────────────────────────────────────────────────

pub async fn ack_message(
    State(state): State<crate::models::AppState>,
    ExtractUser(claims): ExtractUser,
    Path((channel_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    state.scylla
        .query(
            "INSERT INTO read_states (user_id, channel_id, last_read_message_id) VALUES (?, ?, ?)",
            (claims.sub, channel_id, message_id),
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn extract_mentions(content: &str) -> Vec<Uuid> {
    // Parse <@USER_ID> patterns
    let re = regex::Regex::new(r"<@!?([0-9a-f-]{36})>").unwrap_or_else(|_| unreachable!());
    re.captures_iter(content)
        .filter_map(|cap| cap[1].parse::<Uuid>().ok())
        .collect()
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct BulkDeleteRequest {
    pub ids: Vec<Uuid>,
}
