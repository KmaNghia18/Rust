/// Publish an event to Redis pub/sub channel.
/// The Gateway service subscribes and forwards events to WebSocket clients.
pub async fn publish_event(
    redis: &redis::Client,
    channel: &str,
    event: &serde_json::Value,
) {
    let payload = match serde_json::to_string(event) {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Failed to serialize event: {}", e);
            return;
        }
    };

    match redis.get_connection() {
        Ok(mut conn) => {
            let result: redis::RedisResult<i64> = redis::cmd("PUBLISH")
                .arg(channel)
                .arg(&payload)
                .query(&mut conn);

            if let Err(e) = result {
                tracing::error!("Redis PUBLISH failed on {}: {}", channel, e);
            } else {
                tracing::debug!("Published event to {}", channel);
            }
        }
        Err(e) => {
            tracing::error!("Redis connection error: {}", e);
        }
    }
}
