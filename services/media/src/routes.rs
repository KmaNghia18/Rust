use axum::{routing::{delete, get, post, put}, Router};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use crate::{config::Config, handlers, models::AppState};

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // ─── Avatar ────────────────────────────────────────────────
        .route("/api/users/@me/avatar",              post(handlers::upload_avatar))
        // ─── Banner ────────────────────────────────────────────────
        .route("/api/users/@me/banner",              post(handlers::upload_banner))
        .route("/api/guilds/:guild_id/banner",       post(handlers::upload_banner))
        // ─── Attachments ───────────────────────────────────────────
        .route("/api/channels/:channel_id/attachments", post(handlers::upload_attachment))
        .route("/api/attachments/presign",           post(handlers::request_upload_url))
        .route("/api/attachments/:key",              delete(handlers::delete_attachment))
        // ─── Emoji ─────────────────────────────────────────────────
        .route("/api/guilds/:guild_id/emojis",       post(handlers::upload_emoji))
        // ─── Health ────────────────────────────────────────────────
        .route("/health", get(|| async {
            axum::Json(serde_json::json!({"status":"healthy","service":"media"}))
        }))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
