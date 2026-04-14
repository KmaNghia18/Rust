//! Discord Clone — WebSocket Gateway
//!
//! # Protocol Flow
//!
//! ```
//! Client                          Gateway
//!   |                                |
//!   |──── TCP connect ──────────────►|
//!   |◄─── HELLO {heartbeat: 41250} ─|   op=10
//!   |                                |
//!   |──── IDENTIFY {token} ─────────►|   op=2
//!   |◄─── READY {user, guilds} ──────|   op=0, t=READY
//!   |                                |
//!   |──── HEARTBEAT ────────────────►|   op=1  (every 41.25s)
//!   |◄─── HEARTBEAT_ACK ─────────────|   op=11
//!   |                                |
//!   |◄─── MESSAGE_CREATE ────────────|   op=0, t=MESSAGE_CREATE
//!   |◄─── TYPING_START ──────────────|   op=0, t=TYPING_START
//!   |◄─── PRESENCE_UPDATE ───────────|   op=0, t=PRESENCE_UPDATE
//! ```

use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

mod config;
mod events;
mod gateway;
mod session;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "gateway=debug,info".into()),
        )
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🌐 WebSocket Gateway starting...");
    info!("   Heartbeat interval: {}ms", config.heartbeat_interval_ms);

    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    let gateway = Arc::new(gateway::Gateway::new(redis, config.clone()));

    // Also start a simple HTTP health endpoint
    let health_gateway = Arc::clone(&gateway);
    tokio::spawn(async move {
        use axum::{routing::get, Router};
        let app = Router::new()
            .route("/health", get(|| async { "healthy" }))
            .route("/stats", get(move || {
                let g = Arc::clone(&health_gateway);
                async move {
                    axum::Json(serde_json::json!({
                        "connections": g.connections.len(),
                        "sessions": g.sessions.len(),
                    }))
                }
            }));
        let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
        info!("📊 Health/stats endpoint on :8080");
        axum::serve(listener, app).await.unwrap();
    });

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Gateway listening on ws://{}", addr);
    info!("   Connect: ws://localhost:{}/", config.port);

    // Accept connections in a loop
    while let Ok((stream, addr)) = listener.accept().await {
        let gateway = Arc::clone(&gateway);
        tokio::spawn(async move {
            if let Err(e) = gateway.handle_connection(stream, addr).await {
                tracing::error!("Connection error from {}: {}", addr, e);
            }
        });
    }

    Ok(())
}
