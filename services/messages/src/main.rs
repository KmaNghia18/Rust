use tracing::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();
    dotenvy::dotenv().ok();
    info!("?? messages service starting...");
    // TODO: implement
    Ok(())
}
