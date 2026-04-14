use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, msg) = match &self {
            AppError::NotFound(m)    => (StatusCode::NOT_FOUND, "NOT_FOUND", m.clone()),
            AppError::Unauthorized(m)=> (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", m.clone()),
            AppError::Forbidden(m)   => (StatusCode::FORBIDDEN, "FORBIDDEN", m.clone()),
            AppError::BadRequest(m)  => (StatusCode::BAD_REQUEST, "BAD_REQUEST", m.clone()),
            AppError::Internal(e)    => {
                tracing::error!("{:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "ERROR", "Internal error".to_string())
            }
        };
        (status, Json(serde_json::json!({"error":{"code":code,"message":msg}}))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
