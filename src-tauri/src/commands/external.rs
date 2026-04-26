use std::process::Command;

use crate::error::{AppError, AppResult};

#[tauri::command]
pub fn open_external_url(url: String) -> AppResult<()> {
    let url = validate_external_url(&url)?.to_string();

    #[cfg(target_os = "macos")]
    Command::new("open").arg(url).spawn()?;

    #[cfg(target_os = "windows")]
    Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()?;

    #[cfg(all(unix, not(target_os = "macos")))]
    Command::new("xdg-open").arg(url).spawn()?;

    Ok(())
}

pub fn validate_external_url(url: &str) -> AppResult<&str> {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Ok(trimmed)
    } else {
        Err(AppError::InvalidExternalUrl)
    }
}
