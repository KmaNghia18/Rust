use aws_sdk_s3::Client as S3Client;

#[derive(Clone)]
pub struct AppState {
    pub s3: S3Client,
    pub config: crate::config::Config,
}
