use anyhow::Result;
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub vapid_public_key: String,
    pub vapid_private_key: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_password: String,
    pub email_from: String,
    pub app_base_url: String,
}
impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("NOTIFICATIONS_SERVICE_PORT").unwrap_or_else(|_| "8007".into()).parse()?,
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into()),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            vapid_public_key: std::env::var("VAPID_PUBLIC_KEY").unwrap_or_default(),
            vapid_private_key: std::env::var("VAPID_PRIVATE_KEY").unwrap_or_default(),
            smtp_host: std::env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".into()),
            smtp_port: std::env::var("SMTP_PORT").unwrap_or_else(|_| "587".into()).parse()?,
            smtp_user: std::env::var("SMTP_USER").unwrap_or_default(),
            smtp_password: std::env::var("SMTP_PASSWORD").unwrap_or_default(),
            email_from: std::env::var("EMAIL_FROM").unwrap_or_else(|_| "noreply@discord.dev".into()),
            app_base_url: std::env::var("APP_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".into()),
        })
    }
}
