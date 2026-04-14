use axum::{extract::State, Json};
use serde::Serialize;
use crate::models::AppState;

#[derive(Serialize)]
pub struct HealthResponse { pub status: &`'static str, pub service: &`'static str }

pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();
    Json(HealthResponse {
        status: if ok { "healthy" } else { "degraded" },
        service: "guilds",
    })
}
