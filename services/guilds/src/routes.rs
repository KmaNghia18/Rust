use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::{config::Config, handlers};

pub fn create_router(db: PgPool, redis: redis::Client, config: Config) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    let state = crate::models::AppState { db, redis, config };

    Router::new()
        // ─── Guilds ────────────────────────────────────────────────
        .route("/api/guilds",                             post(handlers::guilds::create_guild))
        .route("/api/guilds/@me",                         get(handlers::guilds::list_my_guilds))
        .route("/api/guilds/:guild_id",                   get(handlers::guilds::get_guild))
        .route("/api/guilds/:guild_id",                   patch(handlers::guilds::update_guild))
        .route("/api/guilds/:guild_id",                   delete(handlers::guilds::delete_guild))
        .route("/api/guilds/:guild_id/leave",             post(handlers::guilds::leave_guild))
        .route("/api/guilds/:guild_id/transfer",          post(handlers::guilds::transfer_ownership))
        // ─── Channels ──────────────────────────────────────────────
        .route("/api/guilds/:guild_id/channels",          get(handlers::channels::list_channels))
        .route("/api/guilds/:guild_id/channels",          post(handlers::channels::create_channel))
        .route("/api/guilds/:guild_id/channels",          patch(handlers::channels::reorder_channels))
        .route("/api/channels/:channel_id",               get(handlers::channels::get_channel))
        .route("/api/channels/:channel_id",               patch(handlers::channels::update_channel))
        .route("/api/channels/:channel_id",               delete(handlers::channels::delete_channel))
        .route("/api/channels/:channel_id/permissions/:target_id", put(handlers::channels::update_overwrite))
        .route("/api/channels/:channel_id/permissions/:target_id", delete(handlers::channels::delete_overwrite))
        // ─── Roles ─────────────────────────────────────────────────
        .route("/api/guilds/:guild_id/roles",             get(handlers::roles::list_roles))
        .route("/api/guilds/:guild_id/roles",             post(handlers::roles::create_role))
        .route("/api/guilds/:guild_id/roles/:role_id",    patch(handlers::roles::update_role))
        .route("/api/guilds/:guild_id/roles/:role_id",    delete(handlers::roles::delete_role))
        .route("/api/guilds/:guild_id/members/:user_id/roles/:role_id", put(handlers::roles::add_member_role))
        .route("/api/guilds/:guild_id/members/:user_id/roles/:role_id", delete(handlers::roles::remove_member_role))
        // ─── Members ───────────────────────────────────────────────
        .route("/api/guilds/:guild_id/members",           get(handlers::members::list_members))
        .route("/api/guilds/:guild_id/members/:user_id",  patch(handlers::members::update_member))
        .route("/api/guilds/:guild_id/members/:user_id",  delete(handlers::members::kick_member))
        .route("/api/guilds/:guild_id/bans",              get(handlers::members::list_bans))
        .route("/api/guilds/:guild_id/bans/:user_id",     put(handlers::members::ban_member))
        .route("/api/guilds/:guild_id/bans/:user_id",     delete(handlers::members::unban_member))
        // ─── Invites ───────────────────────────────────────────────
        .route("/api/channels/:channel_id/invites",       post(handlers::invites::create_invite))
        .route("/api/guilds/:guild_id/invites",           get(handlers::invites::list_guild_invites))
        .route("/api/invites/:code",                      get(handlers::invites::get_invite))
        .route("/api/invites/:code",                      post(handlers::invites::use_invite))
        .route("/api/invites/:code",                      delete(handlers::invites::delete_invite))
        // ─── Health ────────────────────────────────────────────────
        .route("/health",                                 get(handlers::health::health_check))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
