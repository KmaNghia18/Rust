use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

/// Build the system tray with context menu
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> anyhow::Result<()> {
    let show   = MenuItem::with_id(app, "show",      "Show Discord Clone",   true, None::<&str>)?;
    let sep    = PredefinedMenuItem::separator(app)?;
    let mute   = MenuItem::with_id(app, "mute",      "Mute Microphone",      true, None::<&str>)?;
    let deafen = MenuItem::with_id(app, "deafen",    "Deafen",               true, None::<&str>)?;
    let sep2   = PredefinedMenuItem::separator(app)?;
    let quit   = MenuItem::with_id(app, "quit",      "Quit",                 true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &sep, &mute, &deafen, &sep2, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Discord Clone")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show"   => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
            "mute"   => { let _ = app.emit("tray:toggle_mute", ()); }
            "deafen" => { let _ = app.emit("tray:toggle_deafen", ()); }
            "quit"   => { app.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
