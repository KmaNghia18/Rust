use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Register all global keyboard shortcuts
pub fn register_shortcuts(app: &AppHandle) -> anyhow::Result<()> {
    // Push-to-Talk: hold Ctrl+Space to unmute while speaking
    let ptt_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);

    // Toggle mute: Ctrl+Shift+M
    let mute_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyM);

    // Toggle deafen: Ctrl+Shift+D
    let deaf_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyD);

    // Toggle window: Ctrl+Shift+W
    let window_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyW);

    // Quit: Ctrl+Q
    let quit_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyQ);

    app.global_shortcut().on_shortcuts(
        [ptt_shortcut, mute_shortcut, deaf_shortcut, window_shortcut, quit_shortcut],
        move |app, shortcut, event| {
            match event.state {
                ShortcutState::Pressed => {
                    if shortcut.id == ptt_shortcut.id {
                        // PTT pressed — unmute
                        let _ = app.emit("shortcut:ptt_start", ());
                    } else if shortcut.id == mute_shortcut.id {
                        let _ = app.emit("shortcut:toggle_mute", ());
                    } else if shortcut.id == deaf_shortcut.id {
                        let _ = app.emit("shortcut:toggle_deafen", ());
                    } else if shortcut.id == window_shortcut.id {
                        toggle_main_window(app);
                    } else if shortcut.id == quit_shortcut.id {
                        app.exit(0);
                    }
                }
                ShortcutState::Released => {
                    if shortcut.id == ptt_shortcut.id {
                        // PTT released — re-mute
                        let _ = app.emit("shortcut:ptt_end", ());
                    }
                }
            }
        },
    )?;

    tracing::info!("Global shortcuts registered");
    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
