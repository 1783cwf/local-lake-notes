use std::fs;
use std::path::Path;
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

#[tauri::command]
pub async fn download_external_file(url: String, path: String) -> AppResult<()> {
    let url = validate_external_url(&url)?.to_string();
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let response = reqwest::get(&url)
        .await
        .map_err(|error| AppError::Export(format!("附件下载失败：{error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Export(format!(
            "附件下载失败：HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| AppError::Export(format!("附件读取失败：{error}")))?;
    fs::write(path, bytes)?;
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
