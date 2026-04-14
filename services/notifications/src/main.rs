use tokio::net::TcpListener;
use sqlx::postgres::PgPoolOptions;
use tracing::info;

mod config;
mod email;
mod error;
mod handlers;
mod middleware;
mod push;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "notifications=debug".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🔔 Notifications Service starting...");

    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    info!("✅ Database migrations applied");

    let redis = redis::Client::open(config.redis_url.as_str())?;
    info!("✅ Connected to Redis");

    let state = handlers::AppState { db, redis, config: config.clone() };
    let app   = routes::create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Notifications Service listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
