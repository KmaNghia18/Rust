use axum::{
    extract::{Query, State},
    response::Redirect,
    Json,
};
use serde::Deserialize;

use crate::{
    error::{AppError, AppResult},
    jwt,
    models::{AppState, AuthResponse, UserResponse},
};

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: String,
    pub state: Option<String>,
}

// ─── Google OAuth ──────────────────────────────────────────────────────────

pub async fn google_redirect(State(state): State<AppState>) -> AppResult<Redirect> {
    let client_id = state
        .config
        .google_client_id
        .as_deref()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Google OAuth not configured")))?;

    let redirect_uri = format!(
        "http://localhost:{}/api/auth/oauth/google/callback",
        state.config.port
    );

    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
        ?client_id={client_id}\
        &redirect_uri={redirect_uri}\
        &response_type=code\
        &scope=openid%20email%20profile\
        &access_type=offline"
    );

    Ok(Redirect::temporary(&url))
}

pub async fn google_callback(
    State(state): State<AppState>,
    Query(params): Query<OAuthCallbackQuery>,
) -> AppResult<Json<AuthResponse>> {
    let client_id = state.config.google_client_id.as_deref().unwrap_or("");
    let client_secret = state.config.google_client_secret.as_deref().unwrap_or("");

    // Exchange code for token
    let client = reqwest::Client::new();
    let token_res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", params.code.as_str()),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", &format!("http://localhost:{}/api/auth/oauth/google/callback", state.config.port)),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("OAuth token exchange failed: {}", e)))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("OAuth response parse failed: {}", e)))?;

    let access_token = token_res["access_token"]
        .as_str()
        .ok_or_else(|| AppError::Unauthorized("Google OAuth failed".to_string()))?;

    // Get user info from Google
    let user_info = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to get user info: {}", e)))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("User info parse failed: {}", e)))?;

    let email = user_info["email"]
        .as_str()
        .ok_or_else(|| AppError::Unauthorized("No email from Google".to_string()))?
        .to_lowercase();

    let google_name = user_info["name"].as_str().unwrap_or("User");
    let avatar_url = user_info["picture"].as_str().map(String::from);

    // Find or create user
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT * FROM users WHERE email = $1",
        email
    )
    .fetch_optional(&state.db)
    .await?;

    let user = if let Some(existing) = user {
        existing
    } else {
        // Create new user from Google info
        let username = google_name.replace(' ', "_").to_lowercase();
        let discriminator = format!("{:04}", rand::random::<u16>() % 10000);

        sqlx::query_as!(
            crate::models::User,
            r#"
            INSERT INTO users (username, email, password_hash, avatar_url, discriminator, verified)
            VALUES ($1, $2, '', $3, $4, true)
            RETURNING *
            "#,
            username,
            email,
            avatar_url,
            discriminator,
        )
        .fetch_one(&state.db)
        .await?
    };

    // Generate tokens
    let access = jwt::generate_access_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_access_expiry_secs,
    )?;
    let refresh = jwt::generate_refresh_token(
        user.id,
        &user.email,
        &state.config.jwt_secret,
        state.config.jwt_refresh_expiry_secs,
    )?;

    let expires_at =
        chrono::Utc::now() + chrono::Duration::seconds(state.config.jwt_refresh_expiry_secs);
    sqlx::query!(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user.id,
        jwt::hash_token(&refresh),
        expires_at,
    )
    .execute(&state.db)
    .await?;

    Ok(Json(AuthResponse {
        user: UserResponse::from(user),
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer".to_string(),
        expires_in: state.config.jwt_access_expiry_secs,
    }))
}
