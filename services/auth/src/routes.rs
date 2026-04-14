use axum::{
    routing::{delete, get, patch, post},
    Router,
};
use sqlx::PgPool;

use crate::{config::Config, handlers};

pub fn create_router(db: PgPool, redis: redis::Client, config: Config) -> Router {
    // Shared state
    let state = crate::models::AppState { db, redis, config };

    Router::new()
        // ─── Auth ──────────────────────────────────────────────────
        .route("/api/auth/register", post(handlers::auth::register))
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/logout", post(handlers::auth::logout))
        .route("/api/auth/refresh", post(handlers::auth::refresh_token))
        // ─── 2FA ───────────────────────────────────────────────────
        .route("/api/auth/2fa/setup", post(handlers::mfa::setup_2fa))
        .route("/api/auth/2fa/enable", post(handlers::mfa::enable_2fa))
        .route("/api/auth/2fa/disable", post(handlers::mfa::disable_2fa))
        .route("/api/auth/2fa/verify", post(handlers::mfa::verify_2fa))
        // ─── OAuth ─────────────────────────────────────────────────
        .route("/api/auth/oauth/google", get(handlers::oauth::google_redirect))
        .route("/api/auth/oauth/google/callback", get(handlers::oauth::google_callback))
        // ─── User Profile ──────────────────────────────────────────
        .route("/api/users/@me", get(handlers::users::get_me))
        .route("/api/users/@me", patch(handlers::users::update_me))
        .route("/api/users/@me/avatar", post(handlers::users::upload_avatar))
        .route("/api/users/:id", get(handlers::users::get_user))
        // ─── Friends ───────────────────────────────────────────────
        .route("/api/friends", get(handlers::friends::list_friends))
        .route("/api/friends/request", post(handlers::friends::send_request))
        .route("/api/friends/:user_id/accept", post(handlers::friends::accept_request))
        .route("/api/friends/:user_id/decline", post(handlers::friends::decline_request))
        .route("/api/friends/:user_id", delete(handlers::friends::remove_friend))
        // ─── Block ─────────────────────────────────────────────────
        .route("/api/users/block/:user_id", post(handlers::users::block_user))
        .route("/api/users/block/:user_id", delete(handlers::users::unblock_user))
        // ─── Health ────────────────────────────────────────────────
        .route("/health", get(handlers::health::health_check))
        .with_state(state)
}
