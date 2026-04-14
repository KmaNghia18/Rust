use tokio::net::TcpListener;
use tracing::info;

mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod processor;
mod routes;
mod storage;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("RUST_LOG").unwrap_or_else(|_| "media=debug".into()))
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;

    info!("🖼️  Media Service starting...");

    let s3 = storage::build_s3_client(&config).await?;
    info!("✅ S3/MinIO client ready → {}", config.minio_endpoint);

    // Ensure all buckets exist
    for bucket in [
        &config.bucket_avatars,
        &config.bucket_attachments,
        &config.bucket_banners,
        "emojis",
    ] {
        storage::ensure_bucket(&s3, bucket).await?;
    }
    info!("✅ Buckets ready");

    let state = models::AppState { s3, config: config.clone() };
    let app   = routes::create_router(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    info!("🚀 Media Service listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
