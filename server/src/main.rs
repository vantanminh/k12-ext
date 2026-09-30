use k12_ai_server::{AppState, Auth, Mailer, Store, router};

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
    let env = |name: &str| {
        std::env::var(name)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    };
    let store = match env("DATABASE_URL") {
        Some(url) => Store::postgres(&url).await?,
        None => {
            println!("DATABASE_URL not set: login sessions are kept in memory only.");
            Store::memory()
        }
    };
    let mailer = match (env("RESEND_API_KEY"), env("K12_EMAIL_FROM")) {
        (Some(api_key), Some(from)) => Mailer::Resend {
            api_key,
            from,
            url: "https://api.resend.com/emails".into(),
        },
        // Printing codes is only allowed for a server bound to this machine.
        _ if env("K12_DEV_LOG_OTP").as_deref() == Some("1") && bind_address.is_loopback() => {
            println!("K12_DEV_LOG_OTP=1: login codes are printed here instead of emailed.");
            Mailer::Log
        }
        _ => {
            println!("RESEND_API_KEY/K12_EMAIL_FROM not set: email login is disabled.");
            Mailer::Disabled
        }
    };
    let daily_limit = env("K12_DAILY_SOLVE_LIMIT")
        .map(|v| v.parse::<i64>())
        .transpose()?
        .unwrap_or(30);
    let concurrency = env("K12_MAX_CONCURRENT")
        .map(|v| v.parse::<usize>())
        .transpose()?
        .unwrap_or(2);
    let auth = Auth::new(store, mailer, daily_limit, railway_port.is_some());
    let state = AppState::new(
        std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4.1-mini".into()),
        std::env::var("K12_SERVER_TOKEN").unwrap_or_default(),
        "https://api.openai.com/v1/responses".into(),
    )
    .with_auth(auth)
    .with_concurrency(concurrency);
    let cleanup = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(e) = cleanup
                .auth()
                .store
                .cleanup(k12_ai_server::auth::now())
                .await
            {
                eprintln!("Cleanup failed: {e}");
            }
        }
    });
    let listener = tokio::net::TcpListener::bind((bind_address, port)).await?;
    println!("K12 AI server listening on {bind_address}:{port}");
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
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
