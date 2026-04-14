use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client,
};
use anyhow::Result;

use crate::config::Config;

/// Build an S3 client pointed at MinIO
pub async fn build_s3_client(config: &Config) -> Result<Client> {
    let creds = Credentials::new(
        &config.minio_access_key,
        &config.minio_secret_key,
        None, None,
        "minio",
    );

    let s3_config = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
        .region(Region::new(config.minio_region.clone()))
        .endpoint_url(&config.minio_endpoint)
        .force_path_style(true)   // required for MinIO
        .build();

    Ok(Client::from_conf(s3_config))
}

/// Ensure a bucket exists (create if missing)
pub async fn ensure_bucket(client: &Client, bucket: &str) -> Result<()> {
    match client.head_bucket().bucket(bucket).send().await {
        Ok(_) => {
            tracing::debug!("Bucket '{}' exists", bucket);
        }
        Err(_) => {
            client.create_bucket().bucket(bucket).send().await?;
            tracing::info!("Created bucket '{}'", bucket);
        }
    }
    Ok(())
}

/// Upload bytes to MinIO, return the public CDN URL
pub async fn upload(
    client: &Client,
    bucket: &str,
    key: &str,
    data: bytes::Bytes,
    content_type: &str,
    cdn_base_url: &str,
) -> Result<String> {
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(ByteStream::from(data))
        .content_type(content_type)
        .send()
        .await?;

    Ok(format!("{}/{}/{}", cdn_base_url, bucket, key))
}

/// Delete an object from MinIO
pub async fn delete(client: &Client, bucket: &str, key: &str) -> Result<()> {
    client.delete_object().bucket(bucket).key(key).send().await?;
    Ok(())
}

/// Generate a pre-signed URL for direct client upload (attachment workflow)
pub async fn presign_upload_url(
    client: &Client,
    bucket: &str,
    key: &str,
    expires_secs: u64,
) -> Result<String> {
    use aws_sdk_s3::presigning::PresigningConfig;
    use std::time::Duration;

    let presigned = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .presigned(PresigningConfig::expires_in(Duration::from_secs(expires_secs))?)
        .await?;

    Ok(presigned.uri().to_string())
}
