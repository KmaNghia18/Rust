use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub signaling_port: u16,
    pub redis_url: String,
    pub jwt_secret: String,
    pub domain: String,
    pub stun_servers: Vec<String>,
    pub turn_server: Option<String>,
    pub turn_username: Option<String>,
    pub turn_password: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("VOICE_SERVICE_PORT")
                .unwrap_or_else(|_| "8004".into()).parse()?,
            signaling_port: std::env::var("VOICE_SIGNALING_PORT")
                .unwrap_or_else(|_| "8005".into()).parse()?,
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            domain: std::env::var("DOMAIN").unwrap_or_else(|_| "localhost".into()),
            stun_servers: std::env::var("STUN_SERVERS")
                .unwrap_or_else(|_| "stun:stun.l.google.com:19302".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            turn_server: std::env::var("TURN_SERVER").ok(),
            turn_username: std::env::var("TURN_USERNAME").ok(),
            turn_password: std::env::var("TURN_PASSWORD").ok(),
        })
    }
}
