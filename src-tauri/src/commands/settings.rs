use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::OssSettings;

#[tauri::command]
pub fn get_oss_settings(app: AppHandle) -> AppResult<Option<OssSettings>> {
    load_oss_settings(&app)
}

#[tauri::command]
pub fn save_oss_settings(app: AppHandle, settings: OssSettings) -> AppResult<OssSettings> {
    validate_oss_settings(&settings)?;
    let path = oss_settings_path(&app)?;
    fs::write(path, serde_json::to_string_pretty(&settings)?)?;
    Ok(settings)
}

pub fn load_oss_settings(app: &AppHandle) -> AppResult<Option<OssSettings>> {
    let path = oss_settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

pub fn validate_oss_settings(settings: &OssSettings) -> AppResult<()> {
    let missing = [
        ("endpoint", settings.endpoint.trim()),
        ("bucket", settings.bucket.trim()),
        ("region", settings.region.trim()),
        ("access key", settings.access_key_id.trim()),
        ("secret key", settings.secret_access_key.trim()),
        ("公开访问 URL", settings.public_base_url.trim()),
    ]
    .into_iter()
    .find_map(|(name, value)| if value.is_empty() { Some(name) } else { None });

    if let Some(name) = missing {
        return Err(AppError::InvalidOssSettings(name.to_string()));
    }

    Ok(())
}

fn oss_settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("oss-settings.json"))
}
