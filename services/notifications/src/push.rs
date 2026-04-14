use anyhow::Result;
use tracing::{error, info};
use web_push::{
    ContentEncoding, IsahcWebPushClient, SubscriptionInfo, VapidSignatureBuilder,
    WebPushClient, WebPushMessageBuilder,
};

use crate::config::Config;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, sqlx::FromRow)]
pub struct PushSubscription {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// Send a Web Push notification to a subscriber
pub async fn send_push(
    config: &Config,
    sub: &PushSubscription,
    title: &str,
    body: &str,
    icon_url: Option<&str>,
    action_url: Option<&str>,
) -> Result<()> {
    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "icon": icon_url.unwrap_or("/icon-192.png"),
        "badge": "/badge-72.png",
        "data": { "url": action_url.unwrap_or("/") },
        "vibrate": [200, 100, 200],
    })
    .to_string();

    let subscription_info = SubscriptionInfo::new(
        &sub.endpoint,
        &sub.p256dh,
        &sub.auth,
    );

    let sig_builder = VapidSignatureBuilder::from_base64(
        &config.vapid_private_key,
        web_push::URL_SAFE_NO_PAD,
        &subscription_info,
    )?
    .build()?;

    let mut builder = WebPushMessageBuilder::new(&subscription_info);
    builder.set_payload(ContentEncoding::Aes128Gcm, payload.as_bytes());
    builder.set_vapid_signature(sig_builder);
    builder.set_ttl(86400); // 24h TTL

    let msg = builder.build()?;
    let client = IsahcWebPushClient::new()?;

    match client.send(msg).await {
        Ok(_) => {
            info!("Push sent to {}", &sub.endpoint[..40.min(sub.endpoint.len())]);
        }
        Err(web_push::WebPushError::EndpointNotValid | web_push::WebPushError::EndpointNotFound) => {
            // Subscription expired — caller should delete it
            return Err(anyhow::anyhow!("subscription_expired"));
        }
        Err(e) => {
            error!("Push error: {}", e);
            return Err(e.into());
        }
    }

    Ok(())
}
