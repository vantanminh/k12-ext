//! Email one-time-code login, sessions and per-user daily solve quota.
//!
//! Codes and session tokens are stored only as SHA-256 hashes. Postgres is used
//! when DATABASE_URL is set (Railway); otherwise state lives in memory, which is
//! enough for a local single-user server but is lost on restart.

use axum::{
    Extension, Json,
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::{ApiError, AppState, error};

pub const OTP_TTL_SECS: i64 = 10 * 60;
pub const OTP_RESEND_SECS: i64 = 60;
pub const OTP_MAX_ATTEMPTS: i32 = 5;
pub const OTP_SENDS_PER_HOUR: i32 = 5;
pub const IP_OTP_PER_HOUR: u32 = 10;
pub const IP_VERIFY_PER_HOUR: u32 = 30;
pub const SESSION_TTL_SECS: i64 = 30 * 24 * 60 * 60;
/// Daily quotas reset at midnight Vietnam time (UTC+7).
const DAY_OFFSET_SECS: i64 = 7 * 60 * 60;

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn day(now: i64) -> i64 {
    (now + DAY_OFFSET_SECS).div_euclid(86_400)
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).expect("OS random generator");
    bytes
}

fn random_code() -> String {
    // Rejection sampling keeps all six-digit codes equally likely.
    loop {
        let value = u32::from_le_bytes(random_bytes::<4>());
        if value < 4_294_000_000 {
            return format!("{:06}", value % 1_000_000);
        }
    }
}

fn hash(parts: &[&[u8]]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update((part.len() as u64).to_le_bytes());
        hasher.update(part);
    }
    hasher.finalize().to_vec()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn normalize_email(value: &str) -> Option<String> {
    let email = value.trim().to_ascii_lowercase();
    let (local, domain) = email.split_once('@')?;
    let valid = email.len() <= 254
        && !local.is_empty()
        && local.len() <= 64
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with(['.', '-'])
        && !domain.ends_with(['.', '-'])
        && !domain.contains("..")
        && email.bytes().all(|b| b.is_ascii_graphic());
    valid.then_some(email)
}

pub(crate) fn session_hash(token: &str) -> Vec<u8> {
    hash(&[b"session", token.as_bytes()])
}

// ---------------------------------------------------------------------------
// Storage

pub enum Store {
    Memory(Mutex<MemoryData>),
    Postgres(PgPool),
}

#[derive(Default)]
pub struct MemoryData {
    challenges: HashMap<String, Challenge>,
    users: HashMap<String, (i64, bool)>,
    sessions: HashMap<Vec<u8>, (i64, i64)>,
    usage: HashMap<(i64, i64), i64>,
}

struct Challenge {
    code_hash: Vec<u8>,
    salt: Vec<u8>,
    expires_at: i64,
    attempts: i32,
    sent_at: i64,
    window_start: i64,
    send_count: i32,
}

pub struct SessionUser {
    pub user_id: i64,
    pub email: String,
}

type StoreResult<T> = Result<T, sqlx::Error>;

const SCHEMA: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        disabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    "CREATE TABLE IF NOT EXISTS otp_challenges (
        email TEXT PRIMARY KEY,
        code_hash BYTEA NOT NULL,
        salt BYTEA NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts INT NOT NULL,
        sent_at BIGINT NOT NULL,
        window_start BIGINT NOT NULL,
        send_count INT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sessions (
        token_hash BYTEA PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at)",
    "CREATE TABLE IF NOT EXISTS solve_usage (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day BIGINT NOT NULL,
        count BIGINT NOT NULL,
        PRIMARY KEY (user_id, day))",
];

impl Store {
    pub fn memory() -> Self {
        Store::Memory(Mutex::new(MemoryData::default()))
    }

    pub async fn postgres(url: &str) -> StoreResult<Self> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect(url)
            .await?;
        for statement in SCHEMA {
            sqlx::query(*statement).execute(&pool).await?;
        }
        Ok(Store::Postgres(pool))
    }

    /// Saves a fresh challenge unless the per-email resend or hourly limit applies.
    async fn save_challenge(
        &self,
        email: &str,
        code_hash: &[u8],
        salt: &[u8],
        now: i64,
    ) -> StoreResult<bool> {
        match self {
            Store::Memory(data) => {
                let mut data = data.lock().unwrap();
                let (window_start, send_count) = match data.challenges.get(email) {
                    Some(old) if now - old.sent_at < OTP_RESEND_SECS => return Ok(false),
                    Some(old) if now - old.window_start < 3600 => {
                        if old.send_count >= OTP_SENDS_PER_HOUR {
                            return Ok(false);
                        }
                        (old.window_start, old.send_count + 1)
                    }
                    _ => (now, 1),
                };
                data.challenges.insert(
                    email.into(),
                    Challenge {
                        code_hash: code_hash.into(),
                        salt: salt.into(),
                        expires_at: now + OTP_TTL_SECS,
                        attempts: 0,
                        sent_at: now,
                        window_start,
                        send_count,
                    },
                );
                Ok(true)
            }
            Store::Postgres(pool) => {
                let saved = sqlx::query(
                    "INSERT INTO otp_challenges
                        (email, code_hash, salt, expires_at, attempts, sent_at, window_start, send_count)
                     VALUES ($1, $2, $3, $4, 0, $5, $5, 1)
                     ON CONFLICT (email) DO UPDATE SET
                        code_hash = EXCLUDED.code_hash,
                        salt = EXCLUDED.salt,
                        expires_at = EXCLUDED.expires_at,
                        attempts = 0,
                        sent_at = EXCLUDED.sent_at,
                        window_start = CASE WHEN EXCLUDED.sent_at - otp_challenges.window_start >= 3600
                            THEN EXCLUDED.sent_at ELSE otp_challenges.window_start END,
                        send_count = CASE WHEN EXCLUDED.sent_at - otp_challenges.window_start >= 3600
                            THEN 1 ELSE otp_challenges.send_count + 1 END
                     WHERE EXCLUDED.sent_at - otp_challenges.sent_at >= $6
                        AND (EXCLUDED.sent_at - otp_challenges.window_start >= 3600
                             OR otp_challenges.send_count < $7)
                     RETURNING email",
                )
                .bind(email)
                .bind(code_hash)
                .bind(salt)
                .bind(now + OTP_TTL_SECS)
                .bind(now)
                .bind(OTP_RESEND_SECS)
                .bind(OTP_SENDS_PER_HOUR)
                .fetch_optional(pool)
                .await?;
                Ok(saved.is_some())
            }
        }
    }

    /// Consumes one attempt before comparing, so parallel guesses share the limit.
    async fn check_code(&self, email: &str, code: &str, now: i64) -> StoreResult<bool> {
        match self {
            Store::Memory(data) => {
                let mut data = data.lock().unwrap();
                let Some(challenge) = data.challenges.get_mut(email) else {
                    return Ok(false);
                };
                if challenge.expires_at <= now || challenge.attempts >= OTP_MAX_ATTEMPTS {
                    return Ok(false);
                }
                challenge.attempts += 1;
                let matched = constant_time_eq(
                    &hash(&[&challenge.salt, code.as_bytes()]),
                    &challenge.code_hash,
                );
                if matched {
                    // Keep the row so resend limits still apply, but make it unusable.
                    challenge.attempts = OTP_MAX_ATTEMPTS;
                }
                Ok(matched)
            }
            Store::Postgres(pool) => {
                let Some(row) = sqlx::query(
                    "UPDATE otp_challenges SET attempts = attempts + 1
                     WHERE email = $1 AND expires_at > $2 AND attempts < $3
                     RETURNING code_hash, salt",
                )
                .bind(email)
                .bind(now)
                .bind(OTP_MAX_ATTEMPTS)
                .fetch_optional(pool)
                .await?
                else {
                    return Ok(false);
                };
                let code_hash: Vec<u8> = row.try_get("code_hash")?;
                let salt: Vec<u8> = row.try_get("salt")?;
                if !constant_time_eq(&hash(&[&salt, code.as_bytes()]), &code_hash) {
                    return Ok(false);
                }
                // Only the caller that burns this exact code gets a session. After the
                // increment above attempts is at most the limit; limit + 1 marks it used.
                let used = sqlx::query(
                    "UPDATE otp_challenges SET attempts = $3 + 1
                     WHERE email = $1 AND code_hash = $2 AND attempts <= $3",
                )
                .bind(email)
                .bind(&code_hash)
                .bind(OTP_MAX_ATTEMPTS)
                .execute(pool)
                .await?;
                Ok(used.rows_affected() == 1)
            }
        }
    }

    /// Returns the user id and whether the account is disabled.
    pub(crate) async fn upsert_user(&self, email: &str) -> StoreResult<(i64, bool)> {
        match self {
            Store::Memory(data) => {
                let mut data = data.lock().unwrap();
                let next = data.users.len() as i64 + 1;
                Ok(*data.users.entry(email.into()).or_insert((next, false)))
            }
            Store::Postgres(pool) => {
                let row = sqlx::query(
                    "INSERT INTO users (email) VALUES ($1)
                     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
                     RETURNING id, disabled",
                )
                .bind(email)
                .fetch_one(pool)
                .await?;
                Ok((row.try_get("id")?, row.try_get("disabled")?))
            }
        }
    }

    pub(crate) async fn create_session(
        &self,
        token_hash: &[u8],
        user_id: i64,
        now: i64,
    ) -> StoreResult<()> {
        match self {
            Store::Memory(data) => {
                data.lock()
                    .unwrap()
                    .sessions
                    .insert(token_hash.into(), (user_id, now + SESSION_TTL_SECS));
                Ok(())
            }
            Store::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
                     VALUES ($1, $2, $3, $4)",
                )
                .bind(token_hash)
                .bind(user_id)
                .bind(now + SESSION_TTL_SECS)
                .bind(now)
                .execute(pool)
                .await?;
                Ok(())
            }
        }
    }

    async fn session_user(&self, token_hash: &[u8], now: i64) -> StoreResult<Option<SessionUser>> {
        match self {
            Store::Memory(data) => {
                let data = data.lock().unwrap();
                let Some(&(user_id, expires_at)) = data.sessions.get(token_hash) else {
                    return Ok(None);
                };
                if expires_at <= now {
                    return Ok(None);
                }
                Ok(data
                    .users
                    .iter()
                    .find(|(_, (id, disabled))| *id == user_id && !disabled)
                    .map(|(email, _)| SessionUser {
                        user_id,
                        email: email.clone(),
                    }))
            }
            Store::Postgres(pool) => {
                let row = sqlx::query(
                    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = $1 AND s.expires_at > $2 AND NOT u.disabled",
                )
                .bind(token_hash)
                .bind(now)
                .fetch_optional(pool)
                .await?;
                row.map(|row| {
                    Ok(SessionUser {
                        user_id: row.try_get("id")?,
                        email: row.try_get("email")?,
                    })
                })
                .transpose()
            }
        }
    }

    async fn delete_session(&self, token_hash: &[u8]) -> StoreResult<()> {
        match self {
            Store::Memory(data) => {
                data.lock().unwrap().sessions.remove(token_hash);
                Ok(())
            }
            Store::Postgres(pool) => {
                sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
                    .bind(token_hash)
                    .execute(pool)
                    .await?;
                Ok(())
            }
        }
    }

    async fn usage(&self, user_id: i64, day: i64) -> StoreResult<i64> {
        match self {
            Store::Memory(data) => Ok(*data
                .lock()
                .unwrap()
                .usage
                .get(&(user_id, day))
                .unwrap_or(&0)),
            Store::Postgres(pool) => Ok(sqlx::query(
                "SELECT count FROM solve_usage WHERE user_id = $1 AND day = $2",
            )
            .bind(user_id)
            .bind(day)
            .fetch_optional(pool)
            .await?
            .map(|row| row.try_get("count"))
            .transpose()?
            .unwrap_or(0)),
        }
    }

    /// Atomically reserves one solve; false when the daily limit is reached.
    async fn reserve_solve(&self, user_id: i64, day: i64, limit: i64) -> StoreResult<bool> {
        match self {
            Store::Memory(data) => {
                let mut data = data.lock().unwrap();
                let used = data.usage.entry((user_id, day)).or_insert(0);
                if *used >= limit {
                    return Ok(false);
                }
                *used += 1;
                Ok(true)
            }
            Store::Postgres(pool) => Ok(sqlx::query(
                "INSERT INTO solve_usage (user_id, day, count) VALUES ($1, $2, 1)
                 ON CONFLICT (user_id, day) DO UPDATE SET count = solve_usage.count + 1
                 WHERE solve_usage.count < $3
                 RETURNING count",
            )
            .bind(user_id)
            .bind(day)
            .bind(limit)
            .fetch_optional(pool)
            .await?
            .is_some()),
        }
    }

    async fn refund_solve(&self, user_id: i64, day: i64) -> StoreResult<()> {
        match self {
            Store::Memory(data) => {
                if let Some(used) = data.lock().unwrap().usage.get_mut(&(user_id, day)) {
                    *used = (*used - 1).max(0);
                }
                Ok(())
            }
            Store::Postgres(pool) => {
                sqlx::query(
                    "UPDATE solve_usage SET count = GREATEST(count - 1, 0)
                     WHERE user_id = $1 AND day = $2",
                )
                .bind(user_id)
                .bind(day)
                .execute(pool)
                .await?;
                Ok(())
            }
        }
    }

    /// Drops expired sessions, stale challenges and usage older than a week.
    pub async fn cleanup(&self, now: i64) -> StoreResult<()> {
        match self {
            Store::Memory(data) => {
                let mut data = data.lock().unwrap();
                data.sessions.retain(|_, (_, expires_at)| *expires_at > now);
                data.challenges
                    .retain(|_, c| now - c.window_start < 3600 || c.expires_at > now);
                data.usage.retain(|(_, d), _| *d >= day(now) - 7);
                Ok(())
            }
            Store::Postgres(pool) => {
                sqlx::query("DELETE FROM sessions WHERE expires_at <= $1")
                    .bind(now)
                    .execute(pool)
                    .await?;
                sqlx::query(
                    "DELETE FROM otp_challenges WHERE expires_at <= $1 AND $1 - window_start >= 3600",
                )
                .bind(now)
                .execute(pool)
                .await?;
                sqlx::query("DELETE FROM solve_usage WHERE day < $1")
                    .bind(day(now) - 7)
                    .execute(pool)
                    .await?;
                Ok(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Email

pub enum Mailer {
    /// No email provider: OTP login is unavailable.
    Disabled,
    /// Local development only: prints the code to the server console.
    Log,
    /// Cloudflare Email Service REST API:
    /// POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
    Cloudflare {
        api_token: String,
        from: String,
        url: String,
    },
}

impl Mailer {
    pub fn cloudflare(account_id: &str, api_token: String, from: String) -> Self {
        Mailer::Cloudflare {
            api_token,
            from,
            url: format!(
                "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send"
            ),
        }
    }
}

impl Mailer {
    fn enabled(&self) -> bool {
        !matches!(self, Mailer::Disabled)
    }

    async fn send_code(&self, client: &reqwest::Client, to: &str, code: &str) -> Result<(), ()> {
        let subject = format!("Mã đăng nhập K12 AI: {code}");
        let text = format!(
            "Mã đăng nhập K12 AI của bạn là {code}.\n\nMã có hiệu lực trong 10 phút. \
             Nếu bạn không yêu cầu mã này, hãy bỏ qua email."
        );
        let html = format!(
            "<p>Mã đăng nhập K12 AI của bạn là:</p>\
             <p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>\
             <p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>"
        );
        match self {
            Mailer::Disabled => Err(()),
            Mailer::Log => {
                println!("[dev] OTP for {to}: {code}");
                Ok(())
            }
            Mailer::Cloudflare {
                api_token,
                from,
                url,
            } => {
                let response = client
                    .post(url)
                    .bearer_auth(api_token)
                    .json(&json!({"to": to, "from": from, "subject": subject, "text": text, "html": html}))
                    .send()
                    .await
                    .map_err(|e| eprintln!("Email request failed: {e}"))?;
                let status = response.status();
                let body: Value = response.json().await.unwrap_or(Value::Null);
                // Success also requires the recipient not to have bounced permanently.
                let bounced = body["result"]["permanent_bounces"]
                    .as_array()
                    .is_some_and(|list| !list.is_empty());
                if status.is_success() && body["success"] == true && !bounced {
                    return Ok(());
                }
                eprintln!(
                    "Email provider error: HTTP {status}, errors={}, bounced={bounced}",
                    body["errors"]
                        .to_string()
                        .chars()
                        .take(300)
                        .collect::<String>()
                );
                Err(())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// In-memory per-IP limiter (one Railway instance; resets on restart).

#[derive(Default)]
pub struct IpLimiter(Mutex<HashMap<String, (i64, u32)>>);

impl IpLimiter {
    fn allow(&self, key: String, limit: u32, now: i64) -> bool {
        let mut map = self.0.lock().unwrap();
        if map.len() > 50_000 {
            map.retain(|_, (start, _)| now - *start < 3600);
        }
        let entry = map.entry(key).or_insert((now, 0));
        if now - entry.0 >= 3600 {
            *entry = (now, 0);
        }
        if entry.1 >= limit {
            return false;
        }
        entry.1 += 1;
        true
    }
}

// ---------------------------------------------------------------------------

pub struct Auth {
    pub store: Store,
    pub mailer: Mailer,
    pub daily_limit: i64,
    /// Trust the last X-Forwarded-For hop (set by Railway's edge proxy).
    pub trust_proxy: bool,
    pub limiter: IpLimiter,
}

impl Auth {
    pub fn new(store: Store, mailer: Mailer, daily_limit: i64, trust_proxy: bool) -> Self {
        Self {
            store,
            mailer,
            daily_limit,
            trust_proxy,
            limiter: IpLimiter::default(),
        }
    }

    pub fn email_login(&self) -> bool {
        self.mailer.enabled()
    }
}

impl Default for Auth {
    fn default() -> Self {
        Auth::new(Store::memory(), Mailer::Disabled, 30, false)
    }
}

fn store_error(e: sqlx::Error) -> ApiError {
    eprintln!("Database error: {e}");
    error(
        StatusCode::SERVICE_UNAVAILABLE,
        "DATABASE_ERROR",
        "Server tạm thời không truy cập được dữ liệu đăng nhập. Hãy thử lại sau.",
    )
}

fn client_ip(auth: &Auth, headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    if auth.trust_proxy
        && let Some(ip) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit(',').next())
            .map(str::trim)
            .filter(|v| !v.is_empty())
    {
        return ip.to_string();
    }
    peer.map(|p| p.ip().to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|t| !t.is_empty() && t.len() <= 200)
}

/// Who is calling /v1/solve.
pub enum Caller {
    /// Holder of K12_SERVER_TOKEN: no quota.
    Admin,
    User(i64),
}

/// A reserved quota slot, refunded when the solve fails.
pub struct Reservation {
    user_id: i64,
    day: i64,
}

pub async fn authenticate(s: &AppState, headers: &HeaderMap) -> Result<Caller, ApiError> {
    let admin = s.server_token.trim();
    if !admin.is_empty()
        && headers
            .get("x-k12-token")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| constant_time_eq(v.as_bytes(), admin.as_bytes()))
    {
        return Ok(Caller::Admin);
    }
    let Some(token) = bearer(headers) else {
        return Err(error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Hãy đăng nhập bằng email trong tab AI bài tập.",
        ));
    };
    let user = s
        .auth
        .store
        .session_user(&session_hash(token), now())
        .await
        .map_err(store_error)?
        .ok_or_else(|| {
            error(
                StatusCode::UNAUTHORIZED,
                "SESSION_EXPIRED",
                "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
            )
        })?;
    Ok(Caller::User(user.user_id))
}

pub async fn reserve(s: &AppState, caller: &Caller) -> Result<Option<Reservation>, ApiError> {
    let Caller::User(user_id) = *caller else {
        return Ok(None);
    };
    let today = day(now());
    if !s
        .auth
        .store
        .reserve_solve(user_id, today, s.auth.daily_limit)
        .await
        .map_err(store_error)?
    {
        return Err(error(
            StatusCode::TOO_MANY_REQUESTS,
            "QUOTA_EXCEEDED",
            &format!(
                "Bạn đã dùng hết {} lượt giải hôm nay. Lượt mới có từ 0 giờ.",
                s.auth.daily_limit
            ),
        ));
    }
    Ok(Some(Reservation {
        user_id,
        day: today,
    }))
}

pub async fn refund(s: &AppState, reservation: Option<Reservation>) {
    if let Some(Reservation { user_id, day }) = reservation
        && let Err(e) = s.auth.store.refund_solve(user_id, day).await
    {
        eprintln!("Could not refund solve quota: {e}");
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OtpRequest {
    email: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyRequest {
    email: String,
    code: String,
}

fn invalid_email() -> ApiError {
    error(
        StatusCode::UNPROCESSABLE_ENTITY,
        "INVALID_EMAIL",
        "Email không hợp lệ.",
    )
}

fn bad_body() -> ApiError {
    error(
        StatusCode::BAD_REQUEST,
        "INVALID_PAYLOAD",
        "Dữ liệu đăng nhập không đúng cấu trúc.",
    )
}

pub async fn request_otp(
    State(s): State<AppState>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
    payload: Result<Json<OtpRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) = payload.map_err(|_| bad_body())?;
    let email = normalize_email(&input.email).ok_or_else(invalid_email)?;
    if !s.auth.email_login() {
        return Err(error(
            StatusCode::SERVICE_UNAVAILABLE,
            "EMAIL_NOT_CONFIGURED",
            "Server chưa cấu hình gửi email đăng nhập.",
        ));
    }
    let now = now();
    let ip = client_ip(
        &s.auth,
        &headers,
        peer.map(|Extension(ConnectInfo(addr))| addr),
    );
    let rate_limited = || {
        error(
            StatusCode::TOO_MANY_REQUESTS,
            "OTP_RATE_LIMITED",
            "Bạn yêu cầu mã quá nhiều lần. Hãy đợi ít nhất 1 phút rồi thử lại.",
        )
    };
    if !s
        .auth
        .limiter
        .allow(format!("otp:{ip}"), IP_OTP_PER_HOUR, now)
    {
        return Err(rate_limited());
    }
    let code = random_code();
    let salt = random_bytes::<16>();
    let code_hash = hash(&[&salt, code.as_bytes()]);
    if !s
        .auth
        .store
        .save_challenge(&email, &code_hash, &salt, now)
        .await
        .map_err(store_error)?
    {
        return Err(rate_limited());
    }
    s.auth
        .mailer
        .send_code(&s.client, &email, &code)
        .await
        .map_err(|_| {
            error(
                StatusCode::BAD_GATEWAY,
                "EMAIL_SEND_FAILED",
                "Không gửi được email. Hãy thử lại sau 1 phút.",
            )
        })?;
    Ok(Json(json!({
        "ok": true,
        "expires_in": OTP_TTL_SECS,
        "resend_after": OTP_RESEND_SECS
    })))
}

pub async fn verify_otp(
    State(s): State<AppState>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
    payload: Result<Json<VerifyRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let Json(input) = payload.map_err(|_| bad_body())?;
    let email = normalize_email(&input.email).ok_or_else(invalid_email)?;
    let code = input.code.trim();
    let invalid = || {
        error(
            StatusCode::UNAUTHORIZED,
            "INVALID_OTP",
            "Mã không đúng, đã hết hạn hoặc đã nhập sai quá nhiều lần.",
        )
    };
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }
    let now = now();
    let ip = client_ip(
        &s.auth,
        &headers,
        peer.map(|Extension(ConnectInfo(addr))| addr),
    );
    if !s
        .auth
        .limiter
        .allow(format!("verify:{ip}"), IP_VERIFY_PER_HOUR, now)
    {
        return Err(error(
            StatusCode::TOO_MANY_REQUESTS,
            "OTP_RATE_LIMITED",
            "Bạn thử mã quá nhiều lần. Hãy đợi rồi thử lại.",
        ));
    }
    if !s
        .auth
        .store
        .check_code(&email, code, now)
        .await
        .map_err(store_error)?
    {
        return Err(invalid());
    }
    let (user_id, disabled) = s
        .auth
        .store
        .upsert_user(&email)
        .await
        .map_err(store_error)?;
    if disabled {
        return Err(error(
            StatusCode::FORBIDDEN,
            "ACCOUNT_DISABLED",
            "Tài khoản này đã bị khóa.",
        ));
    }
    let token = format!("k12s_{}", URL_SAFE_NO_PAD.encode(random_bytes::<32>()));
    s.auth
        .store
        .create_session(&session_hash(&token), user_id, now)
        .await
        .map_err(store_error)?;
    Ok(Json(json!({
        "ok": true,
        "token": token,
        "email": email,
        "expires_at": now + SESSION_TTL_SECS
    })))
}

pub async fn me(State(s): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    let unauthorized = || {
        error(
            StatusCode::UNAUTHORIZED,
            "SESSION_EXPIRED",
            "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
        )
    };
    let token = bearer(&headers).ok_or_else(unauthorized)?;
    let now = now();
    let user = s
        .auth
        .store
        .session_user(&session_hash(token), now)
        .await
        .map_err(store_error)?
        .ok_or_else(unauthorized)?;
    let used = s
        .auth
        .store
        .usage(user.user_id, day(now))
        .await
        .map_err(store_error)?;
    Ok(Json(json!({
        "ok": true,
        "email": user.email,
        "daily_limit": s.auth.daily_limit,
        "used_today": used,
        "remaining_today": (s.auth.daily_limit - used).max(0)
    })))
}

pub async fn logout(
    State(s): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if let Some(token) = bearer(&headers) {
        s.auth
            .store
            .delete_session(&session_hash(token))
            .await
            .map_err(store_error)?;
    }
    Ok(Json(json!({"ok": true})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_rejects_emails() {
        assert_eq!(
            normalize_email("  Student@Example.VN ").as_deref(),
            Some("student@example.vn")
        );
        for bad in [
            "", "no-at", "a@b", "a@@b.vn", "a@.b.vn", "a@b..vn", "a b@c.vn", "@c.vn", "é@c.vn",
        ] {
            assert!(normalize_email(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn codes_are_six_digits() {
        for _ in 0..100 {
            let code = random_code();
            assert_eq!(code.len(), 6);
            assert!(code.bytes().all(|b| b.is_ascii_digit()));
        }
    }

    #[test]
    fn quota_day_rolls_over_at_vietnam_midnight() {
        // 2026-09-30 16:59:59 UTC = 23:59:59 in Vietnam; one second later is a new day.
        let before = 1_790_787_599;
        assert_eq!(day(before) + 1, day(before + 1));
    }

    #[tokio::test]
    async fn cloudflare_mailer_fails_on_errors_and_permanent_bounces() {
        use axum::{Router, routing::post};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let mock = Router::new()
            .route("/ok", post(|| async {
                Json(json!({"success": true, "errors": [], "result": {"delivered": ["a@b.vn"], "permanent_bounces": [], "queued": []}}))
            }))
            .route("/bounce", post(|| async {
                Json(json!({"success": true, "errors": [], "result": {"delivered": [], "permanent_bounces": ["a@b.vn"], "queued": []}}))
            }))
            .route("/forbidden", post(|| async {
                (StatusCode::FORBIDDEN, Json(json!({"success": false, "errors": [{"code": 10102, "message": "email.sending.error.authentication.forbidden"}], "result": null})))
            }));
        let task = tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });
        let client = reqwest::Client::new();
        let mailer = |path: &str| Mailer::Cloudflare {
            api_token: "t".into(),
            from: "login@example.vn".into(),
            url: format!("{base}{path}"),
        };
        assert!(
            mailer("/ok")
                .send_code(&client, "a@b.vn", "123456")
                .await
                .is_ok()
        );
        assert!(
            mailer("/bounce")
                .send_code(&client, "a@b.vn", "123456")
                .await
                .is_err()
        );
        assert!(
            mailer("/forbidden")
                .send_code(&client, "a@b.vn", "123456")
                .await
                .is_err()
        );
        assert!(Mailer::cloudflare("acc", "t".into(), "f".into()).enabled());
        task.abort();
    }

    /// Shared contract for both stores; `email` must be unused in `store`.
    async fn exercise_store(store: Store, email: &str) {
        let salt = [1u8; 16];
        let good = hash(&[&salt, b"123456"]);
        let save = |t| store.save_challenge(email, &good, &salt, t);
        assert!(save(1000).await.unwrap());
        assert!(!save(1030).await.unwrap(), "resend cooldown");
        // The last allowed attempt can still succeed.
        for _ in 0..OTP_MAX_ATTEMPTS - 1 {
            assert!(!store.check_code(email, "000000", 1040).await.unwrap());
        }
        assert!(store.check_code(email, "123456", 1040).await.unwrap());
        assert!(
            !store.check_code(email, "123456", 1041).await.unwrap(),
            "replay"
        );
        assert!(save(1100).await.unwrap());
        assert!(
            !store
                .check_code(email, "123456", 1100 + OTP_TTL_SECS)
                .await
                .unwrap(),
            "expired"
        );
        let mut t = 1100;
        for _ in 2..OTP_SENDS_PER_HOUR {
            t += OTP_RESEND_SECS;
            assert!(save(t).await.unwrap());
        }
        assert!(!save(t + OTP_RESEND_SECS).await.unwrap(), "hourly cap");
        assert!(save(1000 + 3600).await.unwrap(), "new hour");

        let (user_id, disabled) = store.upsert_user(email).await.unwrap();
        assert!(!disabled);
        assert_eq!(store.upsert_user(email).await.unwrap().0, user_id);
        let token_hash = session_hash(&format!("k12s_{email}"));
        store
            .create_session(&token_hash, user_id, 5000)
            .await
            .unwrap();
        assert_eq!(
            store
                .session_user(&token_hash, 5001)
                .await
                .unwrap()
                .unwrap()
                .email,
            email
        );
        assert!(
            store
                .session_user(&token_hash, 5000 + SESSION_TTL_SECS)
                .await
                .unwrap()
                .is_none()
        );

        assert!(store.reserve_solve(user_id, 5, 2).await.unwrap());
        assert!(store.reserve_solve(user_id, 5, 2).await.unwrap());
        assert!(!store.reserve_solve(user_id, 5, 2).await.unwrap(), "quota");
        store.refund_solve(user_id, 5).await.unwrap();
        assert_eq!(store.usage(user_id, 5).await.unwrap(), 1);

        store.delete_session(&token_hash).await.unwrap();
        assert!(
            store
                .session_user(&token_hash, 5001)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn memory_store_limits_resends_attempts_and_quota() {
        exercise_store(Store::memory(), "a@b.vn").await;
    }

    /// Runs only when TEST_DATABASE_URL points at a Postgres database.
    #[tokio::test]
    async fn postgres_store_matches_memory_store() {
        let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!("TEST_DATABASE_URL not set; skipping Postgres store test.");
            return;
        };
        let store = Store::postgres(&url).await.unwrap();
        let email = format!("test-{}@example.invalid", random_code());
        exercise_store(store, &email).await;
    }
}
