use axum::{extract::State, Json};
use serde::Serialize;

use crate::models::AppState;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub db: bool,
    pub redis: bool,
}

pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    // Check DB connectivity
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_ok();

    // Check Redis connectivity
    let redis_ok = state
        .redis
        .get_connection()
        .map(|mut conn| {
            redis::cmd("PING")
                .query::<String>(&mut conn)
                .is_ok()
        })
        .unwrap_or(false);

    Json(HealthResponse {
        status: if db_ok && redis_ok { "healthy" } else { "degraded" },
        service: "auth",
        version: env!("CARGO_PKG_VERSION"),
        db: db_ok,
        redis: redis_ok,
    })
}
