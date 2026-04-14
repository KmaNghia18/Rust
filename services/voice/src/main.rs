use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod sfu;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "voice=debug".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🎙️  Voice Service starting...");
    info!("   STUN: {:?}", config.stun_servers);

    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    let rooms = Arc::new(dashmap::DashMap::new());

    // ── Signaling WebSocket Server ──────────────────────────────────────
    let sfu_server = Arc::new(sfu::VoiceServer::new(redis.clone(), config.clone()));
    let sfu_clone = Arc::clone(&sfu_server);
    let sig_port = config.signaling_port;

    tokio::spawn(async move {
        let addr = format!("0.0.0.0:{}", sig_port);
        let listener = TcpListener::bind(&addr).await.expect("Failed to bind signaling");
        info!("🔊 Voice Signaling (WS) on ws://{}", addr);

        while let Ok((stream, addr)) = listener.accept().await {
            let sfu = Arc::clone(&sfu_clone);
            tokio::spawn(async move {
                if let Err(e) = sfu.handle_connection(stream, addr).await {
                    tracing::error!("Voice connection error: {}", e);
                }
            });
        }
    });

    // ── REST API (Axum) ────────────────────────────────────────────────
    let state = models::AppState {
        redis,
        config: config.clone(),
        rooms,
    };

    let app = axum::Router::new()
        .route("/api/guilds/:guild_id/voice-states",
            axum::routing::get(handlers::get_guild_voice_states))
        .route("/api/channels/:channel_id/voice/join",
            axum::routing::post(handlers::join_voice_channel))
        .route("/api/voice/state",
            axum::routing::patch(handlers::update_voice_state))
        .route("/api/channels/:channel_id/voice",
            axum::routing::get(handlers::get_voice_room))
        .route("/api/guilds/:guild_id/members/:user_id/voice",
            axum::routing::patch(handlers::server_mute))
        .route("/health", axum::routing::get(|| async {
            axum::Json(serde_json::json!({ "status": "healthy", "service": "voice" }))
        }))
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Voice REST API on http://{}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
