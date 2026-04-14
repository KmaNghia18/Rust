use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::{config::Config, handlers};

pub fn create_router(
    scylla: Arc<scylla::Session>,
    redis: redis::Client,
    config: Config,
) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let state = crate::models::AppState { scylla, redis, config };

    Router::new()
        // ─── Messages ──────────────────────────────────────────────
        .route(
            "/api/channels/:channel_id/messages",
            post(handlers::send_message).get(handlers::get_messages),
        )
        .route(
            "/api/channels/:channel_id/messages/:message_id",
            get(handlers::get_single_message)
            .patch(handlers::edit_message)
            .delete(handlers::delete_message),
        )
        // ─── Bulk Delete ───────────────────────────────────────────
        .route(
            "/api/channels/:channel_id/messages/bulk-delete",
            post(handlers::bulk_delete),
        )
        // ─── Reactions ─────────────────────────────────────────────
        .route(
            "/api/channels/:channel_id/messages/:message_id/reactions/:emoji/@me",
            put(handlers::add_reaction).delete(handlers::remove_reaction),
        )
        .route(
            "/api/channels/:channel_id/messages/:message_id/reactions/:emoji",
            get(handlers::get_reactors).delete(handlers::remove_all_reactions_for_emoji),
        )
        .route(
            "/api/channels/:channel_id/messages/:message_id/reactions",
            delete(handlers::remove_all_reactions),
        )
        // ─── Typing ────────────────────────────────────────────────
        .route(
            "/api/channels/:channel_id/typing",
            post(handlers::trigger_typing),
        )
        // ─── Pins ──────────────────────────────────────────────────
        .route(
            "/api/channels/:channel_id/pins",
            get(handlers::get_pinned_messages),
        )
        .route(
            "/api/channels/:channel_id/pins/:message_id",
            put(handlers::pin_message).delete(handlers::unpin_message),
        )
        // ─── Read State (ACK) ──────────────────────────────────────
        .route(
            "/api/channels/:channel_id/messages/:message_id/ack",
            post(handlers::ack_message),
        )
        // ─── Health ────────────────────────────────────────────────
        .route("/health", get(health_check))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health_check() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "status": "healthy", "service": "messages" }))
}
