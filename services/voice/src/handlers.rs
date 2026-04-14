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
};

// ─── Get Voice State ───────────────────────────────────────────────────────
/// Returns current voice states for all participants in a guild

pub async fn get_guild_voice_states(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
) -> AppResult<Json<Vec<VoiceState>>> {
    // Collect all rooms belonging to this guild
    let states: Vec<VoiceState> = state.rooms
        .iter()
        .filter(|r| r.guild_id == Some(guild_id))
        .flat_map(|r| r.participants.values().map(|p| p.state.clone()).collect::<Vec<_>>())
        .collect();

    Ok(Json(states))
}

// ─── Join Voice Channel ────────────────────────────────────────────────────
/// Returns a voice token + signaling endpoint for the client to connect to the SFU

pub async fn join_voice_channel(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<VoiceServerInfo>> {
    // Issue a short-lived voice token (same JWT but short expiry)
    // In production: use a voice-specific token with SSRC assignment

    Ok(Json(VoiceServerInfo {
        token: "ACCESS_TOKEN_REUSE".to_string(), // client passes their existing JWT
        endpoint: format!("wss://{}:{}/voice", state.config.domain, state.config.signaling_port),
        guild_id: None, // TODO: look up guild for this channel
        channel_id,
    }))
}

// ─── Update Voice State (REST fallback) ───────────────────────────────────
/// REST endpoint to update own voice state (mute/deaf/move channel)

pub async fn update_voice_state(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<VoiceStateUpdateRequest>,
) -> AppResult<StatusCode> {
    // If channel_id = None → disconnect user from voice
    if payload.channel_id.is_none() {
        // Remove user from any room they're in
        let mut to_remove: Option<Uuid> = None;
        for room in state.rooms.iter() {
            if room.participants.contains_key(&claims.sub) {
                to_remove = Some(room.channel_id);
                break;
            }
        }
        if let Some(channel_id) = to_remove {
            if let Some(mut room) = state.rooms.get_mut(&channel_id) {
                room.participants.remove(&claims.sub);
            }
        }
    } else {
        // Update mute/deaf state in current room
        for mut room in state.rooms.iter_mut() {
            if let Some(participant) = room.participants.get_mut(&claims.sub) {
                if let Some(mute) = payload.self_mute {
                    participant.state.self_mute = mute;
                }
                if let Some(deaf) = payload.self_deaf {
                    participant.state.self_deaf = deaf;
                }
                break;
            }
        }
    }

    // Publish VOICE_STATE_UPDATE through Redis to Gateway
    if let Ok(mut conn) = state.redis.get_connection() {
        let event = serde_json::json!({
            "op": 0,
            "t": "VOICE_STATE_UPDATE",
            "d": {
                "user_id": claims.sub,
                "channel_id": payload.channel_id,
                "self_mute": payload.self_mute.unwrap_or(false),
                "self_deaf": payload.self_deaf.unwrap_or(false),
            }
        });
        let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
            .arg("gateway:broadcast")
            .arg(event.to_string())
            .query(&mut conn);
    }

    Ok(StatusCode::NO_CONTENT)
}

// ─── Get Room Info ─────────────────────────────────────────────────────────

pub async fn get_voice_room(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let room = state.rooms.get(&channel_id);

    match room {
        Some(r) => {
            let participants: Vec<serde_json::Value> = r.participants
                .values()
                .map(|p| serde_json::json!({
                    "user_id": p.user_id,
                    "self_mute": p.state.self_mute,
                    "self_deaf": p.state.self_deaf,
                    "self_video": p.state.self_video,
                    "self_stream": p.state.self_stream,
                    "server_mute": p.state.server_mute,
                    "server_deaf": p.state.server_deaf,
                }))
                .collect();

            Ok(Json(serde_json::json!({
                "channel_id": channel_id,
                "participant_count": participants.len(),
                "participants": participants,
            })))
        }
        None => Ok(Json(serde_json::json!({
            "channel_id": channel_id,
            "participant_count": 0,
            "participants": [],
        }))),
    }
}

// ─── Server Mute/Deaf ──────────────────────────────────────────────────────

pub async fn server_mute(
    State(state): State<AppState>,
    ExtractUser(_claims): ExtractUser,
    Path((guild_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ServerMuteRequest>,
) -> AppResult<StatusCode> {
    for mut room in state.rooms.iter_mut() {
        if room.guild_id == Some(guild_id) {
            if let Some(participant) = room.participants.get_mut(&user_id) {
                participant.state.server_mute = payload.mute;
                participant.state.server_deaf = payload.deaf.unwrap_or(false);
            }
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, serde::Deserialize)]
pub struct ServerMuteRequest {
    pub mute: bool,
    pub deaf: Option<bool>,
}
