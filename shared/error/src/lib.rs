use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use thiserror::Error;

/// Standard API error — used by ALL services
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Unauthorized(String),

    #[error("{0}")]
    Forbidden(String),

    #[error("{0}")]
    BadRequest(String),

    #[error("{0}")]
    Conflict(String),

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    TooManyRequests(String),

    #[error("internal error")]
    Internal(#[from] anyhow::Error),

    #[error("database error")]
    Database(String),
}

impl ApiError {
    pub fn not_found(msg: impl Into<String>) -> Self { Self::NotFound(msg.into()) }
    pub fn unauthorized() -> Self { Self::Unauthorized("Unauthorized".into()) }
    pub fn forbidden(msg: impl Into<String>) -> Self { Self::Forbidden(msg.into()) }
    pub fn bad_request(msg: impl Into<String>) -> Self { Self::BadRequest(msg.into()) }
    pub fn conflict(msg: impl Into<String>) -> Self { Self::Conflict(msg.into()) }
    pub fn too_many_requests(msg: impl Into<String>) -> Self { Self::TooManyRequests(msg.into()) }
    pub fn internal(msg: impl Into<String>) -> Self { Self::Internal(anyhow::anyhow!(msg.into())) }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            ApiError::NotFound(m)        => (StatusCode::NOT_FOUND,                  "NOT_FOUND",            m.clone()),
            ApiError::Unauthorized(m)    => (StatusCode::UNAUTHORIZED,               "UNAUTHORIZED",         m.clone()),
            ApiError::Forbidden(m)       => (StatusCode::FORBIDDEN,                  "FORBIDDEN",            m.clone()),
            ApiError::BadRequest(m)      => (StatusCode::BAD_REQUEST,                "BAD_REQUEST",          m.clone()),
            ApiError::Conflict(m)        => (StatusCode::CONFLICT,                   "CONFLICT",             m.clone()),
            ApiError::Validation(m)      => (StatusCode::UNPROCESSABLE_ENTITY,       "VALIDATION_ERROR",     m.clone()),
            ApiError::TooManyRequests(m) => (StatusCode::TOO_MANY_REQUESTS,          "RATE_LIMITED",         m.clone()),
            ApiError::Database(m)        => { tracing::error!("DB error: {}", m); (StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR", "Database error".into()) }
            ApiError::Internal(e)        => { tracing::error!("Internal: {:?}", e); (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error".into()) }
        };

        (status, Json(serde_json::json!({
            "error": { "code": code, "message": message }
        }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

// ─── From implementations for common error types ──────────────────────────────

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => ApiError::NotFound("Resource not found".into()),
            e => ApiError::Database(e.to_string()),
        }
    }
}
