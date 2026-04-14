use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims structure — shared across all services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub email: String,
    pub username: String,
    pub exp: i64,
    pub iat: i64,
    pub token_type: String,   // "access" | "refresh"
}

/// Axum extractor — validates JWT and injects Claims
pub struct ExtractUser(pub Claims);

/// Error response for authentication failures
#[derive(Debug)]
pub enum AuthError {
    MissingHeader,
    InvalidFormat,
    InvalidToken(String),
    ExpiredToken,
    WrongType { expected: &'static str },
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AuthError::MissingHeader       => (StatusCode::UNAUTHORIZED, "MISSING_TOKEN", "Authorization header required".to_string()),
            AuthError::InvalidFormat       => (StatusCode::UNAUTHORIZED, "INVALID_FORMAT", "Expected: Bearer <token>".to_string()),
            AuthError::InvalidToken(msg)   => (StatusCode::UNAUTHORIZED, "INVALID_TOKEN", msg.clone()),
            AuthError::ExpiredToken        => (StatusCode::UNAUTHORIZED, "TOKEN_EXPIRED", "Token has expired".to_string()),
            AuthError::WrongType { expected } => (StatusCode::UNAUTHORIZED, "WRONG_TOKEN_TYPE", format!("{} token required", expected)),
        };

        (status, Json(serde_json::json!({
            "error": { "code": code, "message": message }
        }))).into_response()
    }
}

/// State trait — services must expose their JWT secret
pub trait HasJwtSecret {
    fn jwt_secret(&self) -> &str;
}

// ─── Generic extractor for any AppState that exposes JWT secret ────────────────

pub struct ExtractClaims<S>(pub Claims, std::marker::PhantomData<S>);

#[async_trait]
impl<S> FromRequestParts<S> for ExtractClaims<S>
where
    S: Send + Sync + HasJwtSecret,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(AuthError::MissingHeader)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(AuthError::InvalidFormat)?;

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.jwt_secret().as_bytes()),
            &validation,
        )
        .map(|data| data.claims)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::ExpiredToken,
            _ => AuthError::InvalidToken(e.to_string()),
        })?;

        if claims.token_type != "access" {
            return Err(AuthError::WrongType { expected: "access" });
        }

        Ok(ExtractClaims(claims, std::marker::PhantomData))
    }
}

/// Optional auth — returns None if no token (for public endpoints)
pub struct OptionalUser(pub Option<Claims>);

#[async_trait]
impl<S> FromRequestParts<S> for OptionalUser
where
    S: Send + Sync + HasJwtSecret,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Ok(OptionalUser(
            ExtractClaims::from_request_parts(parts, state)
                .await
                .ok()
                .map(|e| e.0),
        ))
    }
}
