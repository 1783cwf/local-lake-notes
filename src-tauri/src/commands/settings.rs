use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::OssSettings;
use crate::storage::app_database::{
    load_oss_settings as load_database_oss_settings,
    save_oss_settings as save_database_oss_settings,
};

#[tauri::command]
pub fn get_oss_settings(app: AppHandle) -> AppResult<Option<OssSettings>> {
    load_oss_settings(&app)
}

#[tauri::command]
pub fn save_oss_settings(app: AppHandle, settings: OssSettings) -> AppResult<OssSettings> {
    validate_oss_settings(&settings)?;
    save_database_oss_settings(&app, &settings)?;
    Ok(settings)
}

pub fn load_oss_settings(app: &AppHandle) -> AppResult<Option<OssSettings>> {
    load_database_oss_settings(app)
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
