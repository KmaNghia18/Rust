use anyhow::Result;
use bytes::Bytes;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

const AVATAR_SIZE: u32 = 256;
const THUMBNAIL_SIZE: u32 = 80;
const BANNER_WIDTH: u32 = 960;
const BANNER_HEIGHT: u32 = 540;

/// Decode, validate, resize, and re-encode image as WebP
///
/// Returns the processed bytes + detected mime type
pub fn process_avatar(data: &[u8]) -> Result<Bytes> {
    let img = load_and_validate(data, 8 * 1024 * 1024)?;

    // Resize to square
    let resized = img.resize_to_fill(AVATAR_SIZE, AVATAR_SIZE, image::imageops::FilterType::Lanczos3);
    encode_webp(resized)
}

/// Produce a small square thumbnail (for message embeds)
pub fn process_thumbnail(data: &[u8]) -> Result<Bytes> {
    let img = load_and_validate(data, 25 * 1024 * 1024)?;
    let resized = img.resize_to_fill(THUMBNAIL_SIZE, THUMBNAIL_SIZE, image::imageops::FilterType::Triangle);
    encode_webp(resized)
}

/// Resize banner to 960×540 WebP
pub fn process_banner(data: &[u8]) -> Result<Bytes> {
    let img = load_and_validate(data, 8 * 1024 * 1024)?;
    let resized = img.resize_to_fill(BANNER_WIDTH, BANNER_HEIGHT, image::imageops::FilterType::Lanczos3);
    encode_webp(resized)
}

/// Validate emoji size and encode to WebP (animated GIFs kept as-is)
pub fn process_emoji(data: &[u8], content_type: &str) -> Result<Bytes> {
    if data.len() > 256 * 1024 {
        return Err(anyhow::anyhow!("Emoji must be under 256KB"));
    }

    // Keep animated GIFs as-is
    if content_type == "image/gif" {
        return Ok(Bytes::copy_from_slice(data));
    }

    let img = load_and_validate(data, 256 * 1024)?;
    let resized = img.resize_to_fill(128, 128, image::imageops::FilterType::Lanczos3);
    encode_webp(resized)
}

/// Get image dimensions without full decode
pub fn get_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    let reader = image::io::Reader::new(Cursor::new(data))
        .with_guessed_format()
        .ok()?;
    let (w, h) = reader.into_dimensions().ok()?;
    Some((w, h))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn load_and_validate(data: &[u8], max_bytes: usize) -> Result<DynamicImage> {
    if data.len() > max_bytes {
        return Err(anyhow::anyhow!(
            "File too large: {} bytes (max {})",
            data.len(), max_bytes
        ));
    }

    let img = image::load_from_memory(data)
        .map_err(|e| anyhow::anyhow!("Invalid image: {}", e))?;

    Ok(img)
}

fn encode_webp(img: DynamicImage) -> Result<Bytes> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::WebP)
        .map_err(|e| anyhow::anyhow!("WebP encode failed: {}", e))?;
    Ok(Bytes::from(buf.into_inner()))
}

/// Detect MIME type from raw bytes
pub fn detect_mime(data: &[u8]) -> &'static str {
    let kind = infer::get(data);
    match kind.map(|k| k.mime_type()) {
        Some("image/jpeg") => "image/jpeg",
        Some("image/png") => "image/png",
        Some("image/gif") => "image/gif",
        Some("image/webp") => "image/webp",
        Some("video/mp4") => "video/mp4",
        Some("video/webm") => "video/webm",
        Some("audio/mpeg") => "audio/mpeg",
        Some("audio/ogg") => "audio/ogg",
        Some("application/pdf") => "application/pdf",
        _ => "application/octet-stream",
    }
}
