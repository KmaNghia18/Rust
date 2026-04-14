use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};

use crate::{
    error::{AppError, AppResult},
    jwt::{verify_token, Claims},
};

/// Extractor that reads the Bearer token from Authorization header
/// and returns the decoded JWT Claims.
///
/// Usage in handler:
/// ```rust
/// pub async fn my_handler(ExtractUser(claims): ExtractUser) { ... }
/// ```
pub struct ExtractUser(pub Claims);

#[async_trait]
impl<S> FromRequestParts<S> for ExtractUser
where
    S: Send + Sync,
    crate::models::AppState: axum::extract::FromRef<S>,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        use axum::extract::FromRef;
        let app_state = crate::models::AppState::from_ref(state);

        let token = extract_bearer_token(&parts.headers)?;
        let claims = verify_token(&token, &app_state.config.jwt_secret)?;

        if claims.token_type != "access" {
            return Err(AppError::Unauthorized(
                "Access token required".to_string(),
            ));
        }

        Ok(ExtractUser(claims))
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> AppResult<String> {
    let auth_header = headers
        .get("Authorization")
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".to_string()))?
        .to_str()
        .map_err(|_| AppError::Unauthorized("Invalid Authorization header".to_string()))?;

    if !auth_header.starts_with("Bearer ") {
        return Err(AppError::Unauthorized(
            "Authorization header must start with 'Bearer '".to_string(),
        ));
    }

    Ok(auth_header[7..].to_string())
}
