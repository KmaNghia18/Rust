// Tauri v2 requires lib.rs for the mobile entry point
use tauri::Manager;

mod commands;
mod gateway;
mod shortcuts;
mod tray;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ── Plugins ────────────────────────────────────────────────
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // If another instance starts, focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        // ── State ──────────────────────────────────────────────────
        .manage(AppState::default())
        // ── Setup ──────────────────────────────────────────────────
        .setup(|app| {
            let handle = app.handle().clone();

            // Load tokens from OS keychain
            let state = app.state::<AppState>();
            tauri::async_runtime::block_on(commands::load_tokens_from_keychain(&state));

            // System tray
            tray::setup_tray(&handle)?;

            // Global shortcuts
            shortcuts::register_shortcuts(&handle)?;

            // Start gateway in background if token available
            let handle2 = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = handle2.state::<AppState>();
                let token = state.access_token.lock().await.clone();
                let ws_url = state.ws_url.clone();
                drop(state);

                if let Some(tok) = token {
                    gateway::run_gateway(handle2, ws_url, tok).await;
                }
            });

            // Listen for login event from frontend to start gateway
            let handle3 = handle.clone();
            app.listen("app:login", move |event| {
                if let Some(payload) = event.payload() {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(payload) {
                        let token = data["access_token"]
                            .as_str()
                            .unwrap_or("")
                            .to_string();
                        let ws_url = {
                            let state = handle3.state::<AppState>();
                            state.ws_url.clone()
                        };
                        if !token.is_empty() {
                            let h = handle3.clone();
                            tauri::async_runtime::spawn(async move {
                                gateway::run_gateway(h, ws_url, token).await;
                            });
                        }
                    }
                }
            });

            tracing::info!("✅ Discord Clone Desktop started");
            Ok(())
        })
        // ── Commands ───────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            commands::set_tokens,
            commands::get_tokens,
            commands::clear_tokens,
            commands::http_request,
            commands::show_notification,
            commands::minimize_window,
            commands::maximize_window,
            commands::close_window,
            commands::set_always_on_top,
            commands::get_audio_devices,
            commands::get_file_metadata,
        ])
        // ── Window close = hide to tray ────────────────────────────
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Discord Clone desktop");
}
