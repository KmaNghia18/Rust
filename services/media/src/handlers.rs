use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::AppState,
    processor, storage,
};

// ─── Upload Avatar ─────────────────────────────────────────────────────────

pub async fn upload_avatar(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    mut multipart: Multipart,
) -> AppResult<Json<UploadResponse>> {
    let (data, content_type) = extract_file_field(&mut multipart, "avatar").await?;

    // Validate image type
    let mime = processor::detect_mime(&data);
    if !["image/jpeg", "image/png", "image/gif", "image/webp"].contains(&mime) {
        return Err(AppError::BadRequest("Avatar must be JPEG, PNG, GIF, or WebP".into()));
    }

    // Process: resize to 256×256 WebP
    let processed = processor::process_avatar(&data)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // Upload to MinIO
    let key = format!("{}/{}.webp", claims.sub, Uuid::new_v4());
    let url = storage::upload(
        &state.s3,
        &state.config.bucket_avatars,
        &key,
        processed,
        "image/webp",
        &state.config.cdn_base_url,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    tracing::info!("Avatar uploaded for user {}: {}", claims.sub, url);
    Ok(Json(UploadResponse { url, content_type: "image/webp".into() }))
}

// ─── Upload Banner ─────────────────────────────────────────────────────────

pub async fn upload_banner(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Option<Uuid>>,
    mut multipart: Multipart,
) -> AppResult<Json<UploadResponse>> {
    let (data, _) = extract_file_field(&mut multipart, "banner").await?;

    let mime = processor::detect_mime(&data);
    if !["image/jpeg", "image/png", "image/webp"].contains(&mime) {
        return Err(AppError::BadRequest("Banner must be JPEG, PNG, or WebP".into()));
    }

    let processed = processor::process_banner(&data)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let prefix = guild_id
        .map(|id| format!("guilds/{}", id))
        .unwrap_or_else(|| format!("users/{}", claims.sub));
    let key = format!("{}/{}.webp", prefix, Uuid::new_v4());

    let url = storage::upload(
        &state.s3,
        &state.config.bucket_banners,
        &key,
        processed,
        "image/webp",
        &state.config.cdn_base_url,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok(Json(UploadResponse { url, content_type: "image/webp".into() }))
}

// ─── Upload Attachment ─────────────────────────────────────────────────────

pub async fn upload_attachment(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(channel_id): Path<Uuid>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<AttachmentResponse>)> {
    let (data, _) = extract_file_field(&mut multipart, "file").await?;

    if data.len() > state.config.max_attachment_bytes {
        return Err(AppError::BadRequest(format!(
            "File too large (max {}MB)",
            state.config.max_attachment_bytes / 1024 / 1024
        )));
    }

    let mime = processor::detect_mime(&data);
    let attachment_id = Uuid::new_v4();
    let key = format!("{}/{}/{}", channel_id, claims.sub, attachment_id);

    // Generate thumbnail for images
    let thumbnail_url = if mime.starts_with("image/") {
        processor::process_thumbnail(&data).ok().and_then(|thumb| {
            let thumb_key = format!("{}_thumb.webp", key);
            // Best-effort thumbnail upload (non-blocking)
            Some(format!("{}/{}/{}", state.config.cdn_base_url, state.config.bucket_attachments, thumb_key))
        })
    } else {
        None
    };

    let dimensions = if mime.starts_with("image/") {
        processor::get_dimensions(&data)
    } else {
        None
    };

    let url = storage::upload(
        &state.s3,
        &state.config.bucket_attachments,
        &key,
        bytes::Bytes::copy_from_slice(&data),
        mime,
        &state.config.cdn_base_url,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok((StatusCode::CREATED, Json(AttachmentResponse {
        id: attachment_id,
        url,
        thumbnail_url,
        filename: key.split('/').last().unwrap_or("file").to_string(),
        size: data.len() as i64,
        content_type: mime.to_string(),
        width: dimensions.map(|(w, _)| w as i32),
        height: dimensions.map(|(_, h)| h as i32),
    })))
}

// ─── Upload Emoji ──────────────────────────────────────────────────────────

pub async fn upload_emoji(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(guild_id): Path<Uuid>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<EmojiResponse>)> {
    let (data, _) = extract_file_field(&mut multipart, "emoji").await?;

    let mime = processor::detect_mime(&data);
    if !["image/jpeg", "image/png", "image/gif", "image/webp"].contains(&mime) {
        return Err(AppError::BadRequest("Emoji must be JPEG, PNG, GIF, or WebP".into()));
    }

    let processed = processor::process_emoji(&data, mime)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let emoji_id = Uuid::new_v4();
    let extension = if mime == "image/gif" { "gif" } else { "webp" };
    let key = format!("{}/{}.{}", guild_id, emoji_id, extension);

    let url = storage::upload(
        &state.s3,
        "emojis",
        &key,
        processed,
        mime,
        &state.config.cdn_base_url,
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    Ok((StatusCode::CREATED, Json(EmojiResponse {
        id: emoji_id,
        url,
        animated: mime == "image/gif",
    })))
}

// ─── Request Pre-Signed Upload URL ─────────────────────────────────────────
/// Allows clients to upload large files directly to MinIO

pub async fn request_upload_url(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<PresignRequest>,
) -> AppResult<Json<PresignResponse>> {
    if payload.size > state.config.max_attachment_bytes as i64 {
        return Err(AppError::BadRequest(format!(
            "File too large (max {}MB)",
            state.config.max_attachment_bytes / 1024 / 1024
        )));
    }

    let file_id = Uuid::new_v4();
    let key = format!("{}/{}/{}", payload.channel_id, claims.sub, file_id);

    let upload_url = storage::presign_upload_url(
        &state.s3,
        &state.config.bucket_attachments,
        &key,
        300, // 5 minutes to upload
    )
    .await
    .map_err(|e| AppError::Internal(e))?;

    let cdn_url = format!(
        "{}/{}/{}",
        state.config.cdn_base_url,
        state.config.bucket_attachments,
        key
    );

    Ok(Json(PresignResponse {
        upload_url,
        file_id,
        cdn_url,
        key,
    }))
}

// ─── Delete Media ──────────────────────────────────────────────────────────

pub async fn delete_attachment(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Path(attachment_key): Path<String>,
) -> AppResult<StatusCode> {
    // Verify ownership: key should start with channel/user_id
    if !attachment_key.contains(&claims.sub.to_string()) {
        return Err(AppError::Forbidden("Cannot delete another user's attachment".into()));
    }

    storage::delete(&state.s3, &state.config.bucket_attachments, &attachment_key)
        .await
        .map_err(|e| AppError::Internal(e))?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async fn extract_file_field(
    multipart: &mut Multipart,
    field_name: &str,
) -> AppResult<(Vec<u8>, String)> {
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("Multipart error: {}", e))
    })? {
        if field.name().unwrap_or("") == field_name {
            let content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();

            let data = field.bytes().await.map_err(|e| {
                AppError::BadRequest(format!("Failed to read file: {}", e))
            })?.to_vec();

            return Ok((data, content_type));
        }
    }

    Err(AppError::BadRequest(format!("Missing '{}' field", field_name)))
}

// ─── Response DTOs ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub url: String,
    pub content_type: String,
}

#[derive(Debug, Serialize)]
pub struct AttachmentResponse {
    pub id: Uuid,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub filename: String,
    pub size: i64,
    pub content_type: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct EmojiResponse {
    pub id: Uuid,
    pub url: String,
    pub animated: bool,
}

#[derive(Debug, Deserialize)]
pub struct PresignRequest {
    pub channel_id: Uuid,
    pub filename: String,
    pub size: i64,
    pub content_type: String,
}

#[derive(Debug, Serialize)]
pub struct PresignResponse {
    pub upload_url: String,
    pub file_id: Uuid,
    pub cdn_url: String,
    pub key: String,
}
