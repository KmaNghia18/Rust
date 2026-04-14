use axum::serve;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod error;
mod handlers;
mod jwt;
mod middleware;
mod models;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "auth=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load environment variables
    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🦀 Auth Service starting...");

    // Connect to database
    let db = db::connect(&config.database_url).await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await?;
    info!("✅ Database migrations applied");

    // Connect to Redis
    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    // Build router
    let app = routes::create_router(db, redis, config.clone());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Auth Service listening on {}", addr);

    serve(listener, app).await?;
    Ok(())
}
