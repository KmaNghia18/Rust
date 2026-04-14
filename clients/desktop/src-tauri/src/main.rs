fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "discord_desktop=debug,warn".into()),
        )
        .init();

    discord_desktop_lib::run()
}
