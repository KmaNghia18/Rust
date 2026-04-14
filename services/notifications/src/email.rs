use anyhow::Result;
use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use tracing::{error, info};

use crate::config::Config;

pub async fn build_mailer(config: &Config) -> Result<AsyncSmtpTransport<Tokio1Executor>> {
    let creds = Credentials::new(
        config.smtp_user.clone(),
        config.smtp_password.clone(),
    );

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)?
        .port(config.smtp_port)
        .credentials(creds)
        .build();

    Ok(mailer)
}

/// Send a verification email to a newly registered user
pub async fn send_verification_email(
    mailer: &AsyncSmtpTransport<Tokio1Executor>,
    to_email: &str,
    to_name: &str,
    verification_token: &str,
    app_base_url: &str,
    from: &str,
) -> Result<()> {
    let verify_link = format!("{}/verify?token={}", app_base_url, verification_token);

    let body = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;padding:40px">
  <div style="max-width:520px;margin:auto;background:#181825;border-radius:12px;padding:32px">
    <h1 style="color:#cba6f7;margin-bottom:8px">Verify your email</h1>
    <p>Hi <strong>{}</strong>, welcome to Discord Clone!</p>
    <p>Click the button below to verify your email address:</p>
    <a href="{}"
       style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
      Verify Email
    </a>
    <p style="color:#6c7086;font-size:13px">
      Link expires in 24 hours. If you didn't create an account, you can ignore this email.
    </p>
    <hr style="border-color:#313244">
    <p style="color:#6c7086;font-size:12px">Discord Clone — Not affiliated with Discord Inc.</p>
  </div>
</body>
</html>"#,
        to_name, verify_link
    );

    let email = Message::builder()
        .from(from.parse::<Mailbox>()?)
        .to(format!("{} <{}>", to_name, to_email).parse::<Mailbox>()?)
        .subject("Verify your Discord Clone account")
        .header(ContentType::TEXT_HTML)
        .body(body)?;

    mailer.send(email).await?;
    info!("Verification email sent to {}", to_email);
    Ok(())
}

/// Send password reset email
pub async fn send_password_reset_email(
    mailer: &AsyncSmtpTransport<Tokio1Executor>,
    to_email: &str,
    to_name: &str,
    reset_token: &str,
    app_base_url: &str,
    from: &str,
) -> Result<()> {
    let reset_link = format!("{}/reset-password?token={}", app_base_url, reset_token);

    let body = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;padding:40px">
  <div style="max-width:520px;margin:auto;background:#181825;border-radius:12px;padding:32px">
    <h1 style="color:#f38ba8;margin-bottom:8px">Reset your password</h1>
    <p>Hi <strong>{}</strong>,</p>
    <p>We received a request to reset your password. Click below to continue:</p>
    <a href="{}"
       style="display:inline-block;background:#e64553;color:#fff;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
      Reset Password
    </a>
    <p style="color:#6c7086;font-size:13px">
      This link expires in 1 hour. If you didn't request a reset, ignore this email.
    </p>
  </div>
</body>
</html>"#,
        to_name, reset_link
    );

    let email = Message::builder()
        .from(from.parse::<Mailbox>()?)
        .to(format!("{} <{}>", to_name, to_email).parse::<Mailbox>()?)
        .subject("Reset your Discord Clone password")
        .header(ContentType::TEXT_HTML)
        .body(body)?;

    mailer.send(email).await?;
    info!("Password reset email sent to {}", to_email);
    Ok(())
}

/// Generic notification email
pub async fn send_notification_email(
    mailer: &AsyncSmtpTransport<Tokio1Executor>,
    to_email: &str,
    to_name: &str,
    subject: &str,
    title: &str,
    body_text: &str,
    action_url: Option<&str>,
    from: &str,
) -> Result<()> {
    let action_html = action_url
        .map(|url| format!(
            r#"<a href="{}" style="display:inline-block;background:#7c3aed;color:#fff;
               padding:10px 20px;border-radius:8px;text-decoration:none;margin:12px 0">
               View in App</a>"#, url
        ))
        .unwrap_or_default();

    let body = format!(
        r#"<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;padding:40px">
  <div style="max-width:520px;margin:auto;background:#181825;border-radius:12px;padding:32px">
    <h2 style="color:#cba6f7">{}</h2>
    <p>{}</p>
    {}
  </div>
</body>
</html>"#,
        title, body_text, action_html
    );

    let email = Message::builder()
        .from(from.parse::<Mailbox>()?)
        .to(format!("{} <{}>", to_name, to_email).parse::<Mailbox>()?)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(body)?;

    if let Err(e) = mailer.send(email).await {
        error!("Failed to send email to {}: {}", to_email, e);
    }
    Ok(())
}
