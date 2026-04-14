use axum::serve;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod error;
mod handlers;
mod middleware;
mod models;
mod permissions;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "guilds=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🦀 Guilds Service starting...");

    let db = db::connect(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    info!("✅ Database migrations applied");

    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    let app = routes::create_router(db, redis, config.clone());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Guilds Service listening on {}", addr);

    serve(listener, app).await?;
    Ok(())
}
