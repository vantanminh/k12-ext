use k12_ai_server::{AppState, router};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let railway_port = std::env::var("PORT").ok();
    let port: u16 = railway_port
        .clone()
        .or_else(|| std::env::var("K12_SERVER_PORT").ok())
        .unwrap_or_else(|| "3210".into())
        .parse()?;
    let bind_address =
        if railway_port.is_some() || std::env::var("K12_SERVER_PUBLIC").as_deref() == Ok("1") {
            std::net::Ipv4Addr::UNSPECIFIED
        } else {
            std::net::Ipv4Addr::LOCALHOST
        };
    let state = AppState::new(
        std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4.1-mini".into()),
        std::env::var("K12_SERVER_TOKEN").unwrap_or_default(),
        "https://api.openai.com/v1/responses".into(),
    );
    let listener = tokio::net::TcpListener::bind((bind_address, port)).await?;
    println!("K12 AI server listening on {bind_address}:{port}");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c().await.ok();
    }
}
