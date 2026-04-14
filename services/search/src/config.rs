use anyhow::Result;
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub jwt_secret: String,
    pub elasticsearch_url: String,
}
impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("SEARCH_SERVICE_PORT").unwrap_or_else(|_| "8006".into()).parse()?,
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            elasticsearch_url: std::env::var("ELASTICSEARCH_URL")
                .unwrap_or_else(|_| "http://localhost:9200".into()),
        })
    }
}
