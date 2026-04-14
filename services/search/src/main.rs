use tokio::net::TcpListener;
use axum::{routing::{delete, get, post, put}, Router};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;

mod config;
mod error;
mod es_client;
mod handlers;
mod indices;
mod middleware;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "search=debug".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🔍 Search Service starting...");

    let es = es_client::build_client(&config.elasticsearch_url).await?;
    info!("✅ Connected to Elasticsearch → {}", config.elasticsearch_url);

    // Create indices with correct mappings if they don't exist
    indices::ensure_indices(&es).await?;
    info!("✅ Elasticsearch indices ready");

    let state = handlers::AppState { es, config: config.clone() };

    let app = Router::new()
        // ─── Search ────────────────────────────────────────────────
        .route("/api/guilds/:guild_id/messages/search", get(handlers::search_messages))
        .route("/api/guilds/discover",                  get(handlers::discover_guilds))
        .route("/api/users/search",                     get(handlers::search_users))
        // ─── Internal Index Ops (service-to-service) ───────────────
        .route("/internal/messages",        post(handlers::index_message))
        .route("/internal/messages/:id",    delete(handlers::delete_message_index))
        .route("/internal/users",           post(handlers::index_user))
        .route("/internal/guilds",          post(handlers::index_guild))
        // ─── Health ────────────────────────────────────────────────
        .route("/health", get(|| async {
            axum::Json(serde_json::json!({"status":"healthy","service":"search"}))
        }))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Search Service listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
