use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    middleware::ExtractUser,
    models::AppState,
};

// ─── Setup 2FA ─────────────────────────────────────────────────────────────
/// Generate a TOTP secret and QR code URL for the user to scan

pub async fn setup_2fa(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<Json<Setup2FAResponse>> {
    // Check if already enabled
    let user = sqlx::query!(
        "SELECT mfa_enabled FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if user.mfa_enabled {
        return Err(AppError::Conflict("2FA is already enabled".to_string()));
    }

    // Generate a secure TOTP secret
    let secret = totp_rs::Secret::generate_secret();
    let secret_b32 = secret.to_encoded().to_string();

    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes().unwrap(),
        Some("Discord Clone".to_string()),
        claims.email.clone(),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("TOTP error: {}", e)))?;

    let otpauth_url = totp.get_url();

    // Store secret temporarily (not yet enabled until verified)
    sqlx::query!(
        "UPDATE users SET mfa_secret = $1 WHERE id = $2",
        secret_b32,
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    // Generate QR code as base64 data URL
    let qr_code = totp
        .get_qr_base64()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("QR error: {}", e)))?;

    Ok(Json(Setup2FAResponse {
        secret: secret_b32,
        otpauth_url,
        qr_code: format!("data:image/png;base64,{}", qr_code),
    }))
}

// ─── Enable 2FA ────────────────────────────────────────────────────────────
/// Verify the TOTP code and mark 2FA as enabled

pub async fn enable_2fa(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<VerifyTOTPRequest>,
) -> AppResult<StatusCode> {
    let user = sqlx::query!(
        "SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if user.mfa_enabled {
        return Err(AppError::Conflict("2FA is already enabled".to_string()));
    }

    let secret = user
        .mfa_secret
        .ok_or_else(|| AppError::BadRequest("Run /2fa/setup first".to_string()))?;

    verify_totp_code(&secret, &payload.code, &claims.email)?;

    // Mark 2FA as enabled
    sqlx::query!(
        "UPDATE users SET mfa_enabled = true WHERE id = $1",
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("2FA enabled for user {}", claims.sub);
    Ok(StatusCode::NO_CONTENT)
}

// ─── Disable 2FA ───────────────────────────────────────────────────────────

pub async fn disable_2fa(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<VerifyTOTPRequest>,
) -> AppResult<StatusCode> {
    let user = sqlx::query!(
        "SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if !user.mfa_enabled {
        return Err(AppError::BadRequest("2FA is not enabled".to_string()));
    }

    let secret = user.mfa_secret.ok_or_else(|| AppError::Internal(
        anyhow::anyhow!("MFA secret missing but enabled flag is true"),
    ))?;

    verify_totp_code(&secret, &payload.code, &claims.email)?;

    sqlx::query!(
        "UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1",
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("2FA disabled for user {}", claims.sub);
    Ok(StatusCode::NO_CONTENT)
}

// ─── Verify 2FA ────────────────────────────────────────────────────────────
/// Standalone verify endpoint (used during login flow)

pub async fn verify_2fa(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    Json(payload): Json<VerifyTOTPRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user = sqlx::query!(
        "SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1",
        claims.sub
    )
    .fetch_one(&state.db)
    .await?;

    if !user.mfa_enabled {
        return Err(AppError::BadRequest("2FA is not enabled".to_string()));
    }

    let secret = user.mfa_secret.unwrap();
    verify_totp_code(&secret, &payload.code, &claims.email)?;

    Ok(Json(serde_json::json!({ "verified": true })))
}

// ─── Helper ────────────────────────────────────────────────────────────────

fn verify_totp_code(secret_b32: &str, code: &str, email: &str) -> AppResult<()> {
    let secret = totp_rs::Secret::Encoded(secret_b32.to_string());
    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes().map_err(|e| AppError::Internal(anyhow::anyhow!("{}", e)))?,
        Some("Discord Clone".to_string()),
        email.to_string(),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("TOTP error: {}", e)))?;

    if !totp.check_current(code).unwrap_or(false) {
        return Err(AppError::Unauthorized("Invalid 2FA code".to_string()));
    }

    Ok(())
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Setup2FAResponse {
    pub secret: String,
    pub otpauth_url: String,
    pub qr_code: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyTOTPRequest {
    pub code: String,
}
