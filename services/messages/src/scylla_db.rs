use anyhow::Result;
use scylla::{transport::session::Session as ScyllaSession, SessionBuilder};
use tracing::info;

pub async fn connect(nodes: &[String], keyspace: &str) -> Result<ScyllaSession> {
    info!("Connecting to ScyllaDB at {:?}...", nodes);

    let session = SessionBuilder::new()
        .known_nodes(nodes)
        .build()
        .await?;

    // Use our keyspace
    session
        .use_keyspace(keyspace, false)
        .await?;

    info!("✅ Connected to ScyllaDB (keyspace: {})", keyspace);
    Ok(session)
}
