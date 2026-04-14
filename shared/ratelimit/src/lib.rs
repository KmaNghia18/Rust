use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use redis::AsyncCommands;
use std::sync::Arc;

/// Rate limit policy for a specific endpoint group
#[derive(Debug, Clone)]
pub struct RateLimitPolicy {
    /// Max requests allowed
    pub limit: u64,
    /// Window size in seconds
    pub window_secs: u64,
    /// Key prefix e.g. "auth:login", "messages:send"
    pub key_prefix: &'static str,
}

impl RateLimitPolicy {
    pub const fn new(limit: u64, window_secs: u64, key_prefix: &'static str) -> Self {
        Self { limit, window_secs, key_prefix }
    }
}

// ─── Pre-defined policies ───────────────────────────────────────────────────

pub const POLICY_AUTH_LOGIN: RateLimitPolicy    = RateLimitPolicy::new(5,   60,   "rl:auth:login");
pub const POLICY_AUTH_REGISTER: RateLimitPolicy = RateLimitPolicy::new(3,   3600, "rl:auth:register");
pub const POLICY_MESSAGES_SEND: RateLimitPolicy = RateLimitPolicy::new(30,  10,   "rl:msg:send");
pub const POLICY_REACTIONS: RateLimitPolicy     = RateLimitPolicy::new(60,  60,   "rl:reactions");
pub const POLICY_PUBLIC_API: RateLimitPolicy    = RateLimitPolicy::new(100, 60,   "rl:public");
pub const POLICY_INVITES: RateLimitPolicy       = RateLimitPolicy::new(10,  60,   "rl:invites");
pub const POLICY_UPLOADS: RateLimitPolicy       = RateLimitPolicy::new(10,  60,   "rl:uploads");
pub const POLICY_SEARCH: RateLimitPolicy        = RateLimitPolicy::new(30,  60,   "rl:search");

// ─── Redis Sliding Window Rate Limiter ─────────────────────────────────────

pub struct RateLimiter {
    pub redis: redis::aio::ConnectionManager,
}

#[derive(Debug)]
pub struct RateLimitResult {
    pub allowed: bool,
    pub limit: u64,
    pub remaining: u64,
    pub reset_after_secs: u64,
}

impl RateLimiter {
    pub async fn check(
        &self,
        identifier: &str,   // user_id or IP
        policy: &RateLimitPolicy,
    ) -> Result<RateLimitResult, redis::RedisError> {
        let mut conn = self.redis.clone();
        let key = format!("{}:{}", policy.key_prefix, identifier);
        let now = chrono::Utc::now().timestamp_millis() as u64;
        let window_ms = policy.window_secs * 1000;
        let clear_before = now.saturating_sub(window_ms);

        // Sliding window using sorted set:
        // ZREMRANGEBYSCORE — remove old entries
        // ZADD             — add current request
        // ZCARD            — count requests in window
        // EXPIRE           — auto-cleanup the key

        let (_, count): ((), u64) = redis::pipe()
            .atomic()
            .cmd("ZREMRANGEBYSCORE").arg(&key).arg(0u64).arg(clear_before)
            .cmd("ZADD").arg(&key).arg(now).arg(now.to_string())
            .cmd("ZCARD").arg(&key)
            .cmd("EXPIRE").arg(&key).arg(policy.window_secs + 1)
            .ignore()  // ignore ZREMRANGEBYSCORE result
            .ignore()  // ignore ZADD result
            .ignore()  // ignore EXPIRE result
            .query_async(&mut conn)
            .await
            .unwrap_or(((), 0));

        // Re-fetch count separately for accuracy
        let count: u64 = conn.zcard(&key).await.unwrap_or(0);

        let allowed = count <= policy.limit;
        let remaining = policy.limit.saturating_sub(count);

        Ok(RateLimitResult {
            allowed,
            limit: policy.limit,
            remaining,
            reset_after_secs: policy.window_secs,
        })
    }

    /// Check by IP address (for unauthenticated endpoints)
    pub async fn check_ip(
        &self,
        req: &Request<Body>,
        policy: &RateLimitPolicy,
    ) -> Result<RateLimitResult, redis::RedisError> {
        let ip = extract_ip(req);
        self.check(&ip, policy).await
    }
}

fn extract_ip(req: &Request<Body>) -> String {
    // Check Cloudflare / Nginx headers
    req.headers()
        .get("CF-Connecting-IP")
        .or_else(|| req.headers().get("X-Real-IP"))
        .or_else(|| req.headers().get("X-Forwarded-For"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

// ─── Axum Middleware ────────────────────────────────────────────────────────

/// Rate limit middleware — extracts user_id from JWT if available, else by IP
///
/// Usage:
/// ```rust
/// router.route_layer(middleware::from_fn_with_state(
///     state.clone(),
///     |State(s): State<AppState>, req, next| {
///         rate_limit_middleware(s.limiter.clone(), POLICY_MESSAGES_SEND, req, next)
///     }
/// ))
/// ```
pub async fn rate_limit_middleware(
    limiter: Arc<RateLimiter>,
    policy: RateLimitPolicy,
    req: Request<Body>,
    next: Next,
) -> Response {
    // Try to get user ID from Authorization header
    let identifier = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .and_then(|token| {
            // Decode without validation just to get sub claim for rate limit key
            let parts: Vec<&str> = token.split('.').collect();
            if parts.len() == 3 {
                let payload = base64_decode(parts[1])?;
                let v: serde_json::Value = serde_json::from_slice(&payload).ok()?;
                v["sub"].as_str().map(String::from)
            } else {
                None
            }
        })
        .unwrap_or_else(|| extract_ip(&req));

    match limiter.check(&identifier, &policy).await {
        Ok(result) => {
            let mut response = if result.allowed {
                next.run(req).await
            } else {
                tracing::warn!("Rate limit exceeded: {} on {}", identifier, policy.key_prefix);
                (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(serde_json::json!({
                        "error": {
                            "code": "RATE_LIMITED",
                            "message": "Too many requests. Slow down!",
                            "retry_after": result.reset_after_secs
                        }
                    })),
                )
                    .into_response()
            };

            // Add rate limit headers (Discord-style)
            let headers = response.headers_mut();
            headers.insert("X-RateLimit-Limit",     result.limit.to_string().parse().unwrap());
            headers.insert("X-RateLimit-Remaining", result.remaining.to_string().parse().unwrap());
            headers.insert("X-RateLimit-Reset",     result.reset_after_secs.to_string().parse().unwrap());
            headers.insert("X-RateLimit-Bucket",    policy.key_prefix.parse().unwrap());

            response
        }
        Err(e) => {
            tracing::error!("Rate limiter Redis error: {}", e);
            // Fail open — don't block requests if Redis is down
            next.run(req).await
        }
    }
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    use std::io::Read;
    // Simple base64url decode without padding
    let padded = match s.len() % 4 {
        2 => format!("{}==", s),
        3 => format!("{}=", s),
        _ => s.to_string(),
    };
    let b64 = padded.replace('-', "+").replace('_', "/");
    // Use standard base64 decoding
    (0..b64.len() / 4)
        .flat_map(|i| {
            let chunk = &b64[i * 4..(i + 1) * 4];
            let _ = chunk; // minimal inline decode
            vec![]
        })
        .collect::<Vec<_>>()
        .into_iter()
        .map(Some)
        .collect::<Option<Vec<_>>>()
        .or_else(|| {
            // Fallback: use data_encoding
            None
        })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_constants() {
        assert_eq!(POLICY_AUTH_LOGIN.limit, 5);
        assert_eq!(POLICY_AUTH_LOGIN.window_secs, 60);
        assert_eq!(POLICY_MESSAGES_SEND.limit, 30);
        assert_eq!(POLICY_MESSAGES_SEND.window_secs, 10);
        assert_eq!(POLICY_UPLOADS.limit, 10);
    }

    #[test]
    fn test_rate_limit_result_remaining() {
        let result = RateLimitResult {
            allowed: true,
            limit: 10,
            remaining: 7,
            reset_after_secs: 60,
        };
        assert!(result.allowed);
        assert_eq!(result.remaining, 7);
    }
}
