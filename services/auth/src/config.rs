use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_access_expiry_secs: i64,
    pub jwt_refresh_expiry_secs: i64,
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub app_env: String,
    pub cors_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("AUTH_SERVICE_PORT")
                .unwrap_or_else(|_| "8001".into())
                .parse()?,
            database_url: std::env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: std::env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
            jwt_access_expiry_secs: std::env::var("JWT_ACCESS_EXPIRY_SECS")
                .unwrap_or_else(|_| "900".into()) // 15 minutes
                .parse()?,
            jwt_refresh_expiry_secs: std::env::var("JWT_REFRESH_EXPIRY_SECS")
                .unwrap_or_else(|_| "2592000".into()) // 30 days
                .parse()?,
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").ok(),
            google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").ok(),
            app_env: std::env::var("APP_ENV")
                .unwrap_or_else(|_| "development".into()),
            cors_origins: std::env::var("CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
        })
    }

    pub fn is_production(&self) -> bool {
        self.app_env == "production"
    }
}
