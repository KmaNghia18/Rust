use axum::{async_trait, extract::FromRequestParts, http::request::Parts};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims { pub sub: Uuid, pub email: String, pub exp: i64, pub token_type: String }

pub struct ExtractUser(pub Claims);

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for ExtractUser
where crate::models::AppState: axum::extract::FromRef<S>
{
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        use axum::extract::FromRef;
        let s = crate::models::AppState::from_ref(state);
        let auth = parts.headers.get("Authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;
        let token = auth.strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Invalid format".into()))?;
        let mut val = Validation::new(Algorithm::HS256);
        val.validate_exp = true;
        let claims = decode::<Claims>(token, &DecodingKey::from_secret(s.config.jwt_secret.as_bytes()), &val)
            .map(|d| d.claims)
            .map_err(|_| AppError::Unauthorized("Invalid token".into()))?;
        if claims.token_type != "access" {
            return Err(AppError::Unauthorized("Access token required".into()));
        }
        Ok(ExtractUser(claims))
    }
}
