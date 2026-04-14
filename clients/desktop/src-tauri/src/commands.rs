use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

/// Global app state stored in Tauri's managed state
pub struct AppState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
    pub api_base: String,
    pub ws_url: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
            api_base: std::env::var("DISCORD_API_URL")
                .unwrap_or_else(|_| "http://localhost:8001".into()),
            ws_url: std::env::var("DISCORD_WS_URL")
                .unwrap_or_else(|_| "ws://localhost:8000".into()),
        }
    }
}

// ─── Token Commands ────────────────────────────────────────────────────────

/// Store tokens in Tauri's managed state + OS keychain
#[tauri::command]
pub async fn set_tokens(
    access: String,
    refresh: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    *state.access_token.lock().await = Some(access.clone());
    *state.refresh_token.lock().await = Some(refresh.clone());

    // Persist in OS keychain for security
    store_keychain("discord_clone", "access_token", &access);
    store_keychain("discord_clone", "refresh_token", &refresh);

    Ok(())
}

#[tauri::command]
pub async fn get_tokens(
    state: State<'_, AppState>,
) -> Result<HashMap<String, Option<String>>, String> {
    let access = state.access_token.lock().await.clone();
    let refresh = state.refresh_token.lock().await.clone();
    let mut map = HashMap::new();
    map.insert("access_token".into(), access);
    map.insert("refresh_token".into(), refresh);
    Ok(map)
}

#[tauri::command]
pub async fn clear_tokens(state: State<'_, AppState>) -> Result<(), String> {
    *state.access_token.lock().await = None;
    *state.refresh_token.lock().await = None;
    delete_keychain("discord_clone", "access_token");
    delete_keychain("discord_clone", "refresh_token");
    Ok(())
}

// ─── HTTP Proxy Commands ────────────────────────────────────────────────────

/// Make authenticated HTTP request from Rust backend (avoids CORS issues)
#[tauri::command]
pub async fn http_request(
    method: String,
    url: String,
    body: Option<serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let token = state.access_token.lock().await.clone();

    let mut req = match method.to_uppercase().as_str() {
        "GET"    => client.get(&url),
        "POST"   => client.post(&url),
        "PUT"    => client.put(&url),
        "PATCH"  => client.patch(&url),
        "DELETE" => client.delete(&url),
        m        => return Err(format!("Unsupported method: {}", m)),
    };

    if let Some(tok) = token {
        req = req.bearer_auth(tok);
    }

    if let Some(b) = body {
        req = req.json(&b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let json: serde_json::Value = res.json().await.unwrap_or(serde_json::Value::Null);

    if status >= 400 {
        return Err(serde_json::to_string(&json).unwrap_or(status.to_string()));
    }

    Ok(json)
}

// ─── Notification Commands ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopNotification {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
}

#[tauri::command]
pub fn show_notification(
    app: tauri::AppHandle,
    notif: DesktopNotification,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&notif.title)
        .body(&notif.body)
        .show()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Window Control Commands ───────────────────────────────────────────────

#[tauri::command]
pub fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn maximize_window(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// Toggle always-on-top (useful for push-to-talk)
#[tauri::command]
pub fn set_always_on_top(window: tauri::Window, always_on_top: bool) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

// ─── Audio Device Commands ─────────────────────────────────────────────────

/// List available audio input/output devices (native API)
#[tauri::command]
pub fn get_audio_devices() -> Result<serde_json::Value, String> {
    // In production: use cpal crate for cross-platform audio device enumeration
    Ok(serde_json::json!({
        "inputs": [
            { "id": "default", "name": "Default Microphone", "is_default": true }
        ],
        "outputs": [
            { "id": "default", "name": "Default Speakers", "is_default": true }
        ]
    }))
}

// ─── Drag-and-Drop ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_file_metadata(path: String) -> Result<serde_json::Value, String> {
    use std::fs;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({
        "name": name,
        "size": meta.len(),
        "path": path,
    }))
}

// ─── Keychain Helpers ──────────────────────────────────────────────────────

fn store_keychain(service: &str, key: &str, value: &str) {
    if let Ok(entry) = keyring::Entry::new(service, key) {
        let _ = entry.set_password(value);
    }
}

fn delete_keychain(service: &str, key: &str) {
    if let Ok(entry) = keyring::Entry::new(service, key) {
        let _ = entry.delete_credential();
    }
}

/// Load tokens from OS keychain on startup
pub async fn load_tokens_from_keychain(state: &AppState) {
    if let Ok(entry) = keyring::Entry::new("discord_clone", "access_token") {
        if let Ok(token) = entry.get_password() {
            *state.access_token.lock().await = Some(token);
        }
    }
    if let Ok(entry) = keyring::Entry::new("discord_clone", "refresh_token") {
        if let Ok(token) = entry.get_password() {
            *state.refresh_token.lock().await = Some(token);
        }
    }
}
