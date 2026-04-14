use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, AppResult},
    jwt,
    middleware::ExtractUser,
    models::{AppState, AuthResponse, LoginRequest, RegisterRequest, UserResponse},
};

// ─── Register ──────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> AppResult<(StatusCode, Json<AuthResponse>)> {
    // Validate input
    payload
        .validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    // Check if email already exists
    let existing = sqlx::query_scalar!("SELECT id FROM users WHERE email = $1", payload.email)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    // Check if username already exists
    let existing_username =
        sqlx::query_scalar!("SELECT id FROM users WHERE username = $1", payload.username)
            .fetch_optional(&state.db)
            .await?;

    if existing_username.is_some() {
        return Err(AppError::Conflict("Username already taken".to_string()));
    }

    // Hash password with Argon2
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hashing failed: {}", e)))?
        .to_string();

    // Generate unique 4-digit discriminator
    let discriminator = format!("{:04}", rand::random::<u16>() % 10000);

    // Create user in DB
    let user = sqlx::query_as!(
        crate::models::User,
        r#"
        INSERT INTO users (username, email, password_hash, discriminator)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
        payload.username,
        payload.email.to_lowercase(),
        password_hash,
        discriminator,
    )
    .fetch_one(&state.db)
    .await?;

    // Generate tokens
    let access_token = jwt::generate_access_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;

    let refresh_token = jwt::generate_refresh_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_refresh_expiry_secs,
    )?;

    // Store refresh token hash in DB
    let expires_at =
        Utc::now() + chrono::Duration::seconds(state.config.jwt_refresh_expiry_secs);
    sqlx::query!(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user.id,
        jwt::hash_token(&refresh_token),
        expires_at,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("New user registered: {} ({})", user.username, user.id);

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            user: UserResponse::from(user),
            access_token,
            refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: state.config.jwt_access_expiry_secs,
        }),
    ))
}

// ─── Login ─────────────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    // Find user by email
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT * FROM users WHERE email = $1",
        payload.email.to_lowercase(),
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("Invalid email or password".to_string()))?;

    // Check 2FA if enabled
    if user.mfa_enabled {
        let totp_code = payload
            .totp_code
            .as_deref()
            .ok_or_else(|| AppError::Unauthorized("2FA code required".to_string()))?;

        let secret = user
            .mfa_secret
            .as_deref()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("MFA secret missing")))?;

        let totp = totp_rs::TOTP::new(
            totp_rs::Algorithm::SHA1,
            6,
            1,
            30,
            secret.as_bytes().to_vec(),
            None,
            user.email.clone(),
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("TOTP error: {}", e)))?;

        if !totp.check_current(totp_code).unwrap_or(false) {
            return Err(AppError::Unauthorized("Invalid 2FA code".to_string()));
        }
    }

    // Generate tokens
    let access_token = jwt::generate_access_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;

    let refresh_token = jwt::generate_refresh_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_refresh_expiry_secs,
    )?;

    // Store refresh token
    let expires_at =
        Utc::now() + chrono::Duration::seconds(state.config.jwt_refresh_expiry_secs);
    sqlx::query!(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user.id,
        jwt::hash_token(&refresh_token),
        expires_at,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("User logged in: {} ({})", user.username, user.id);

    Ok(Json(AuthResponse {
        user: UserResponse::from(user),
        access_token,
        refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: state.config.jwt_access_expiry_secs,
    }))
}

// ─── Logout ────────────────────────────────────────────────────────────────

pub async fn logout(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
    headers: HeaderMap,
) -> AppResult<StatusCode> {
    // Extract refresh token from body or header and blacklist it
    if let Some(refresh_header) = headers.get("X-Refresh-Token") {
        if let Ok(token) = refresh_header.to_str() {
            let token_hash = jwt::hash_token(token);
            sqlx::query!(
                "DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2",
                claims.sub,
                token_hash,
            )
            .execute(&state.db)
            .await?;
        }
    }

    tracing::info!("User logged out: {}", claims.sub);
    Ok(StatusCode::NO_CONTENT)
}

// ─── Logout All Devices ────────────────────────────────────────────────────

pub async fn logout_all(
    State(state): State<AppState>,
    ExtractUser(claims): ExtractUser,
) -> AppResult<StatusCode> {
    sqlx::query!(
        "DELETE FROM refresh_tokens WHERE user_id = $1",
        claims.sub,
    )
    .execute(&state.db)
    .await?;

    tracing::info!("User logged out from all devices: {}", claims.sub);
    Ok(StatusCode::NO_CONTENT)
}

// ─── Refresh Token ─────────────────────────────────────────────────────────

pub async fn refresh_token(
    State(state): State<AppState>,
    Json(payload): Json<RefreshRequest>,
) -> AppResult<Json<TokenResponse>> {
    // Verify the refresh token
    let claims = jwt::verify_token(&payload.refresh_token, &state.config.jwt_secret)?;

    if claims.token_type != "refresh" {
        return Err(AppError::Unauthorized("Invalid token type".to_string()));
    }

    // Check it exists in DB (not revoked)
    let token_hash = jwt::hash_token(&payload.refresh_token);
    let stored = sqlx::query!(
        "SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()",
        claims.sub,
        token_hash,
    )
    .fetch_optional(&state.db)
    .await?;

    if stored.is_none() {
        return Err(AppError::Unauthorized(
            "Refresh token is invalid or expired".to_string(),
        ));
    }

    // Issue new access token
    let new_access_token = jwt::generate_access_token(
        claims.sub,
        &claims.email,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;

    // Rotate refresh token (delete old, issue new)
    sqlx::query!(
        "DELETE FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2",
        claims.sub,
        token_hash,
    )
    .execute(&state.db)
    .await?;

    let new_refresh_token = jwt::generate_refresh_token(
        claims.sub,
        &claims.email,
        &state.config.jwt_secret,
        state.config.jwt_refresh_expiry_secs,
    )?;

    let expires_at =
        Utc::now() + chrono::Duration::seconds(state.config.jwt_refresh_expiry_secs);
    sqlx::query!(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        claims.sub,
        jwt::hash_token(&new_refresh_token),
        expires_at,
    )
    .execute(&state.db)
    .await?;

    Ok(Json(TokenResponse {
        access_token: new_access_token,
        refresh_token: new_refresh_token,
        token_type: "Bearer".to_string(),
        expires_in: state.config.jwt_access_expiry_secs,
    }))
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, serde::Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
}
