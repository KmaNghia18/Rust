use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub jwt_secret: String,
    pub minio_endpoint: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub minio_region: String,
    pub bucket_avatars: String,
    pub bucket_attachments: String,
    pub bucket_banners: String,
    pub cdn_base_url: String,
    pub max_avatar_bytes: usize,
    pub max_attachment_bytes: usize,
    pub max_emoji_bytes: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("MEDIA_SERVICE_PORT")
                .unwrap_or_else(|_| "8005".into()).parse()?,
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            minio_endpoint: std::env::var("MINIO_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:9000".into()),
            minio_access_key: std::env::var("MINIO_ACCESS_KEY")
                .unwrap_or_else(|_| "minioadmin".into()),
            minio_secret_key: std::env::var("MINIO_SECRET_KEY")
                .unwrap_or_else(|_| "minioadmin123".into()),
            minio_region: std::env::var("MINIO_REGION")
                .unwrap_or_else(|_| "us-east-1".into()),
            bucket_avatars: "avatars".into(),
            bucket_attachments: "attachments".into(),
            bucket_banners: "banners".into(),
            cdn_base_url: std::env::var("CDN_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:9000".into()),
            max_avatar_bytes: 8 * 1024 * 1024,       // 8 MB
            max_attachment_bytes: 25 * 1024 * 1024,   // 25 MB
            max_emoji_bytes: 256 * 1024,              // 256 KB
        })
    }
}
