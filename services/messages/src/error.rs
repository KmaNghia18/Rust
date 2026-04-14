use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Database error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::NotFound(m)    => (StatusCode::NOT_FOUND, "NOT_FOUND", m.clone()),
            AppError::Unauthorized(m)=> (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", m.clone()),
            AppError::Forbidden(m)   => (StatusCode::FORBIDDEN, "FORBIDDEN", m.clone()),
            AppError::BadRequest(m)  => (StatusCode::BAD_REQUEST, "BAD_REQUEST", m.clone()),
            AppError::Conflict(m)    => (StatusCode::CONFLICT, "CONFLICT", m.clone()),
            AppError::Validation(m)  => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", m.clone()),
            AppError::Internal(e)    => {
                tracing::error!("Internal: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal error".to_string())
            }
        };
        (status, Json(json!({ "error": { "code": code, "message": message } }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
