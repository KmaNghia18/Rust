use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use crate::handlers::{self, AppState};

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // ─── In-App Inbox ──────────────────────────────────────────
        .route("/api/notifications",                    get(handlers::get_notifications))
        .route("/api/notifications/:id/read",           patch(handlers::mark_read))
        .route("/api/notifications/read-all",           post(handlers::mark_all_read))
        .route("/api/notifications/:id",                delete(handlers::delete_notification))
        // ─── Web Push ──────────────────────────────────────────────
        .route("/api/notifications/push/subscribe",     post(handlers::subscribe_push))
        .route("/api/notifications/push/unsubscribe",   post(handlers::unsubscribe_push))
        // ─── Settings ──────────────────────────────────────────────
        .route("/api/notifications/settings",           get(handlers::get_settings)
                                                            .put(handlers::update_settings))
        // ─── Internal (service-to-service) ────────────────────────
        .route("/internal/notifications/send",          post(handlers::send_notification))
        // ─── Health ────────────────────────────────────────────────
        .route("/health", get(|| async {
            axum::Json(serde_json::json!({"status":"healthy","service":"notifications"}))
        }))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
