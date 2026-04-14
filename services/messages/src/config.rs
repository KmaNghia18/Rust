use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub redis_url: String,
    pub jwt_secret: String,
    pub scylla_nodes: Vec<String>,
    pub scylla_keyspace: String,
    pub kafka_brokers: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("MESSAGES_SERVICE_PORT")
                .unwrap_or_else(|_| "8003".into())
                .parse()?,
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            scylla_nodes: std::env::var("SCYLLA_NODES")
                .unwrap_or_else(|_| "localhost:9042".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            scylla_keyspace: std::env::var("SCYLLA_KEYSPACE")
                .unwrap_or_else(|_| "discord_messages".into()),
            kafka_brokers: std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "localhost:9092".into()),
        })
    }
}
