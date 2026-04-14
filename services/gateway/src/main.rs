//! Discord Clone — WebSocket Gateway
//!
//! Handles all real-time WebSocket connections from clients.
//! Each connected client maintains one persistent WSS connection.
//!
//! # Gateway Protocol
//!
//! ## Opcodes (Server → Client)
//! - `0` DISPATCH — Event dispatch  
//! - `1` HEARTBEAT — Request heartbeat
//! - `10` HELLO — Initial handshake
//! - `11` HEARTBEAT_ACK — Heartbeat acknowledged
//!
//! ## Opcodes (Client → Server)
//! - `1` HEARTBEAT — Client heartbeat
//! - `2` IDENTIFY — Authentication
//! - `6` RESUME — Resume session

use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

mod config;
mod connection;
mod events;
mod gateway;
mod session;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "gateway=debug".into()),
        )
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🌐 WebSocket Gateway starting...");

    let redis = redis::Client::open(config.redis_url.as_str())?;
    let gateway = Arc::new(gateway::Gateway::new(redis));

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Gateway listening on ws://{}", addr);

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
