use axum::serve;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

mod config;
mod error;
mod extra_handlers;
mod handlers;
mod message_handlers;
mod middleware;
mod models;
mod publisher;
mod routes;
mod scylla_db;

// Re-export all handlers from one module so routes can use `handlers::`
mod handler_facade {
    pub use crate::message_handlers::*;
    pub use crate::extra_handlers::*;
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "messages=debug".into()),
        )
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("💬 Messages Service starting...");

    // Connect to ScyllaDB
    let scylla = Arc::new(
        scylla_db::connect(&config.scylla_nodes, &config.scylla_keyspace).await?,
    );
    info!("✅ Connected to ScyllaDB");

    // Connect to Redis (for pub/sub publishing)
    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    let app = routes::create_router(scylla, redis, config.clone());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Messages Service listening on {}", addr);

    serve(listener, app).await?;
    Ok(())
}
