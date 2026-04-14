use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

/// Emitted to the frontend via Tauri events
#[derive(Clone, Serialize)]
pub struct GatewayEvent {
    pub op: u8,
    pub t: Option<String>,
    pub d: serde_json::Value,
}

/// Start the WebSocket gateway connection in a background task
pub async fn run_gateway(app: AppHandle, ws_url: String, access_token: String) {
    let mut attempts = 0u32;

    loop {
        match connect_and_run(&app, &ws_url, &access_token).await {
            Ok(_) => {
                tracing::info!("Gateway connection closed normally");
                break;
            }
            Err(e) => {
                attempts += 1;
                let delay = std::time::Duration::from_millis(
                    (1000 * 2u64.pow(attempts.min(6))).min(30_000),
                );
                tracing::warn!("Gateway error (attempt {}): {} — retrying in {:?}", attempts, e, delay);

                // Notify frontend of reconnecting state
                let _ = app.emit("gateway:reconnecting", attempts);
                tokio::time::sleep(delay).await;
            }
        }
    }
}

async fn connect_and_run(
    app: &AppHandle,
    ws_url: &str,
    access_token: &str,
) -> anyhow::Result<()> {
    let url = Url::parse(ws_url)?;
    let (ws_stream, _) = connect_async(url).await?;
    let (mut write, mut read) = ws_stream.split();

    tracing::info!("Gateway WebSocket connected");
    let _ = app.emit("gateway:connected", ());

    // Heartbeat state
    let mut heartbeat_interval: Option<tokio::time::Interval> = None;
    let mut identified = false;
    let token = access_token.to_string();

    loop {
        let next_msg = read.next();
        let heartbeat_tick = async {
            if let Some(ref mut i) = heartbeat_interval {
                i.tick().await;
                true
            } else {
                std::future::pending::<bool>().await
            }
        };

        tokio::select! {
            // Incoming gateway message
            Some(msg_result) = next_msg => {
                match msg_result? {
                    Message::Text(text) => {
                        let val: serde_json::Value = serde_json::from_str(&text)?;
                        let op = val["op"].as_u64().unwrap_or(0) as u8;

                        match op {
                            // HELLO
                            10 => {
                                let interval_ms = val["d"]["heartbeat_interval"]
                                    .as_u64()
                                    .unwrap_or(41_250);

                                heartbeat_interval = Some(tokio::time::interval(
                                    std::time::Duration::from_millis(interval_ms + 2_000),
                                ));

                                // Send IDENTIFY
                                let identify = serde_json::json!({
                                    "op": 2,
                                    "d": {
                                        "token": token,
                                        "properties": {
                                            "os": std::env::consts::OS,
                                            "browser": "discord-clone-desktop",
                                            "device": "desktop"
                                        }
                                    }
                                });
                                write.send(Message::Text(identify.to_string())).await?;
                            }
                            // HEARTBEAT_ACK
                            11 => {}
                            // INVALID_SESSION
                            9 => {
                                let _ = app.emit("gateway:session_invalid", ());
                                return Err(anyhow::anyhow!("Session invalidated"));
                            }
                            // DISPATCH (op=0)
                            0 => {
                                let event_name = val["t"].as_str().unwrap_or("").to_string();
                                let event_data = val["d"].clone();

                                // Emit to frontend React
                                let _ = app.emit(
                                    &format!("gateway:{}", event_name.to_lowercase()),
                                    event_data.clone(),
                                );

                                // Desktop notification for mentions
                                if event_name == "MESSAGE_CREATE" {
                                    handle_message_notification(app, &event_data).await;
                                }
                            }
                            _ => {}
                        }
                    }
                    Message::Close(_) => {
                        tracing::info!("Gateway sent close frame");
                        return Ok(());
                    }
                    Message::Ping(data) => {
                        write.send(Message::Pong(data)).await?;
                    }
                    _ => {}
                }
            }

            // Heartbeat tick
            true = heartbeat_tick => {
                let hb = serde_json::json!({ "op": 1, "d": null });
                write.send(Message::Text(hb.to_string())).await?;
            }

            else => break,
        }
    }

    Ok(())
}

async fn handle_message_notification(app: &AppHandle, message: &serde_json::Value) {
    use tauri_plugin_notification::NotificationExt;

    let mentions_everyone = message["mention_everyone"].as_bool().unwrap_or(false);
    let has_mentions = !message["mentions"].as_array().map(|a| a.is_empty()).unwrap_or(true);

    if mentions_everyone || has_mentions {
        let author = message["author"]["username"]
            .as_str()
            .unwrap_or("Someone");
        let content = message["content"]
            .as_str()
            .unwrap_or("sent a message")
            .chars()
            .take(80)
            .collect::<String>();

        let _ = app
            .notification()
            .builder()
            .title(&format!("@{}", author))
            .body(&content)
            .show();
    }
}
