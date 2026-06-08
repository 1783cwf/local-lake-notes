use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::{
    default_typography_font_family, default_typography_font_size, DatabaseLocationSettings,
    GlobalTypographySettings, OssSettings, SaveDatabaseLocationInput, StorageConnectionTestOutput,
    StorageProviderKind,
};
use crate::storage::app_database::{
    database_location_settings, load_oss_settings as load_database_oss_settings,
    load_typography_settings as load_database_typography_settings, save_database_location,
    save_oss_settings as save_database_oss_settings,
    save_typography_settings as save_database_typography_settings,
};
use crate::storage::{local_store, s3, webdav};

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

#[tauri::command]
pub fn get_typography_settings(app: AppHandle) -> AppResult<GlobalTypographySettings> {
    let settings = load_database_typography_settings(&app)?;
    Ok(normalize_typography_settings(settings).unwrap_or_else(|_| default_typography_settings()))
}

#[tauri::command]
pub fn save_typography_settings(
    app: AppHandle,
    settings: GlobalTypographySettings,
) -> AppResult<GlobalTypographySettings> {
    let normalized = normalize_typography_settings(settings)?;
    save_database_typography_settings(&app, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn test_storage_connection(
    settings: OssSettings,
) -> AppResult<StorageConnectionTestOutput> {
    validate_oss_settings(&settings)?;
    match settings.active_provider {
        StorageProviderKind::S3 => s3::test_connection(&settings).await?,
        StorageProviderKind::Local => local_store::test_connection(&settings.local)?,
        StorageProviderKind::Webdav => webdav::test_connection(&settings.webdav).await?,
    }
    let storage_id = settings.active_storage_id();

    Ok(StorageConnectionTestOutput {
        provider: settings.active_provider,
        storage_id,
        ok: true,
        message: "连接测试成功".to_string(),
    })
}

#[tauri::command]
pub fn get_database_location(app: AppHandle) -> AppResult<DatabaseLocationSettings> {
    database_location_settings(&app)
}

#[tauri::command]
pub fn save_database_location_settings(
    app: AppHandle,
    input: SaveDatabaseLocationInput,
) -> AppResult<DatabaseLocationSettings> {
    save_database_location(&app, std::path::Path::new(input.directory.trim()))
}

pub fn load_oss_settings(app: &AppHandle) -> AppResult<Option<OssSettings>> {
    load_database_oss_settings(app)
}

pub fn normalize_typography_settings(
    settings: GlobalTypographySettings,
) -> AppResult<GlobalTypographySettings> {
    let font_family = normalize_font_family(&settings.font_family)
        .unwrap_or_else(default_typography_font_family);
    if !supported_default_font_size(settings.default_font_size) {
        return Err(AppError::InvalidTypographySettings(
            "默认字号必须是 12、13、14、15、16、19、22 或 24".to_string(),
        ));
    }

    Ok(GlobalTypographySettings {
        font_family,
        default_font_size: settings.default_font_size,
    })
}

pub fn create_global_typography_settings(
    font_family: &str,
    default_font_size: u8,
) -> AppResult<GlobalTypographySettings> {
    normalize_typography_settings(GlobalTypographySettings {
        font_family: font_family.to_string(),
        default_font_size,
    })
}

pub fn validate_oss_settings(settings: &OssSettings) -> AppResult<()> {
    if !(4..=8).contains(&settings.resource_preview_concurrency) {
        return Err(AppError::InvalidOssSettings(
            "资源预览并发数必须在 4 到 8 之间".to_string(),
        ));
    }

    match settings.active_provider {
        StorageProviderKind::S3 => {
            let missing = [
                ("endpoint", settings.endpoint.trim()),
                ("bucket", settings.bucket.trim()),
                ("region", settings.region.trim()),
                ("access key", settings.access_key_id.trim()),
                ("secret key", settings.secret_access_key.trim()),
            ]
            .into_iter()
            .find_map(|(name, value)| if value.is_empty() { Some(name) } else { None });

            if let Some(name) = missing {
                return Err(AppError::InvalidOssSettings(name.to_string()));
            }
        }
        StorageProviderKind::Local => {
            if settings.local.root_directory.trim().is_empty() {
                return Err(AppError::InvalidOssSettings("本地存储目录".to_string()));
            }
        }
        StorageProviderKind::Webdav => {
            let missing = [
                ("WebDAV 地址", settings.webdav.endpoint.trim()),
                ("WebDAV 用户名", settings.webdav.username.trim()),
                ("WebDAV 密码", settings.webdav.password.trim()),
            ]
            .into_iter()
            .find_map(|(name, value)| if value.is_empty() { Some(name) } else { None });

            if let Some(name) = missing {
                return Err(AppError::InvalidOssSettings(name.to_string()));
            }
        }
    }
    if settings.image_prefix.trim().is_empty() {
        return Err(AppError::InvalidOssSettings("图片目录".to_string()));
    }
    if settings.file_prefix.trim().is_empty() {
        return Err(AppError::InvalidOssSettings("附件目录".to_string()));
    }
    if settings.backup_prefix.trim().is_empty() {
        return Err(AppError::InvalidOssSettings("备份目录".to_string()));
    }
    if settings.default_signed_url_ttl_seconds == 0
        || settings.default_signed_url_ttl_seconds > settings.max_signed_url_ttl_seconds
    {
        return Err(AppError::InvalidOssSettings(
            "签名链接默认有效期".to_string(),
        ));
    }
    if settings.active_provider != StorageProviderKind::S3
        && settings.default_export_resource_strategy == "signed-url"
    {
        return Err(AppError::InvalidOssSettings(
            "本地和 WebDAV 存储暂不支持短时签名链接导出".to_string(),
        ));
    }

    Ok(())
}

pub fn supported_default_font_size(value: u8) -> bool {
    matches!(value, 12 | 13 | 14 | 15 | 16 | 19 | 22 | 24)
}

pub fn normalize_font_family(value: &str) -> Option<String> {
    let parts = value
        .split(',')
        .filter_map(normalize_font_family_part)
        .collect::<Vec<_>>();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

fn normalize_font_family_part(value: &str) -> Option<String> {
    let trimmed = value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim();
    if trimmed.is_empty()
        || trimmed
            .chars()
            .any(|ch| matches!(ch, ';' | ':' | '{' | '}' | '(' | ')' | '\n' | '\r' | '\\'))
    {
        return None;
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_alphanumeric() || ch.is_whitespace() || matches!(ch, '-' | '_' | '.'))
    {
        return None;
    }
    if trimmed.chars().any(char::is_whitespace) {
        Some(format!("\"{}\"", trimmed.replace('"', "")))
    } else {
        Some(trimmed.to_string())
    }
}

pub fn default_typography_settings() -> GlobalTypographySettings {
    GlobalTypographySettings {
        font_family: default_typography_font_family(),
        default_font_size: default_typography_font_size(),
    }
}
