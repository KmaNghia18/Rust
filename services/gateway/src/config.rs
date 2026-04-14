use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub redis_url: String,
    pub jwt_secret: String,
    pub heartbeat_interval_ms: u64,
    pub domain: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("GATEWAY_PORT")
                .unwrap_or_else(|_| "8000".into())
                .parse()?,
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            heartbeat_interval_ms: std::env::var("HEARTBEAT_INTERVAL_MS")
                .unwrap_or_else(|_| "41250".into())
                .parse()?,
            domain: std::env::var("DOMAIN").unwrap_or_else(|_| "localhost".into()),
        })
    }
}
