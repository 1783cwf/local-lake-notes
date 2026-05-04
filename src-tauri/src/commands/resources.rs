use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{AppHandle, Manager};

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{
    ResourceDownloadInput, ResourcePreviewInput, ResourcePreviewOutput, SignedResourceUrlInput,
    SignedResourceUrlOutput,
};
use crate::storage::s3::{
    get_object_bytes, parse_resource_ref, presign_get_object_url, validate_resource_key,
};

#[tauri::command]
pub async fn prepare_resource_preview(
    app: AppHandle,
    input: ResourcePreviewInput,
) -> AppResult<ResourcePreviewOutput> {
    let settings = load_valid_settings(&app)?;
    let (bucket, key) = parse_resource_ref(&input.resource_ref)?;
    validate_resource_key(&settings, &bucket, &key)?;
    let bytes = get_object_bytes(&settings, &key).await?;
    let local_path = resource_cache_path(&app, &key)?;
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&local_path, &bytes)?;
    let preview_url = local_path.to_string_lossy().to_string();
    Ok(ResourcePreviewOutput {
        resource_ref: input.resource_ref,
        preview_url,
        local_path: local_path.to_string_lossy().to_string(),
        data_url: build_image_data_url(&key, &bytes),
    })
}

#[tauri::command]
pub async fn download_resource(app: AppHandle, input: ResourceDownloadInput) -> AppResult<()> {
    let settings = load_valid_settings(&app)?;
    let (bucket, key) = parse_resource_ref(&input.resource_ref)?;
    validate_resource_key(&settings, &bucket, &key)?;
    let bytes = get_object_bytes(&settings, &key).await?;
    let path = Path::new(&input.path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)?;
    Ok(())
}

#[tauri::command]
pub async fn read_resource_bytes(
    app: AppHandle,
    input: ResourcePreviewInput,
) -> AppResult<Vec<u8>> {
    let settings = load_valid_settings(&app)?;
    let (bucket, key) = parse_resource_ref(&input.resource_ref)?;
    validate_resource_key(&settings, &bucket, &key)?;
    get_object_bytes(&settings, &key).await
}

#[tauri::command]
pub async fn create_temporary_resource_url(
    app: AppHandle,
    input: SignedResourceUrlInput,
) -> AppResult<SignedResourceUrlOutput> {
    let settings = load_valid_settings(&app)?;
    if !settings.allow_signed_url_export {
        return Err(AppError::InvalidOssSettings(
            "未启用短时签名链接导出".to_string(),
        ));
    }
    if input.ttl_seconds == 0 || input.ttl_seconds > settings.max_signed_url_ttl_seconds {
        return Err(AppError::InvalidOssSettings(format!(
            "签名链接有效期必须在 1 到 {} 秒之间",
            settings.max_signed_url_ttl_seconds
        )));
    }
    let (bucket, key) = parse_resource_ref(&input.resource_ref)?;
    validate_resource_key(&settings, &bucket, &key)?;
    let url = presign_get_object_url(
        &settings,
        &key,
        input.ttl_seconds,
        input.filename.as_deref(),
    )
    .await?;
    Ok(SignedResourceUrlOutput {
        url,
        expires_in_seconds: input.ttl_seconds,
    })
}

fn load_valid_settings(app: &AppHandle) -> AppResult<crate::models::OssSettings> {
    let settings = load_oss_settings(app)?
        .ok_or_else(|| AppError::InvalidOssSettings("请先配置 OSS 上传信息".to_string()))?;
    validate_oss_settings(&settings)?;
    Ok(settings)
}

fn resource_cache_path(app: &AppHandle, key: &str) -> AppResult<std::path::PathBuf> {
    let base_dir = app.path().app_cache_dir()?;
    let safe_key = key
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .map(safe_segment)
        .collect::<Vec<_>>();
    Ok(safe_key
        .into_iter()
        .fold(base_dir.join("resource-cache"), |path, part| {
            path.join(part)
        }))
}

fn safe_segment(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '-'
            } else {
                character
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn build_image_data_url(key: &str, bytes: &[u8]) -> Option<String> {
    let content_type = mime_guess::from_path(key)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    if !content_type.starts_with("image/") {
        return None;
    }

    // Lake 编辑器在 Tauri 中对 asset:// 本地图片的渲染不稳定；
    // 这里仅把编辑器内存预览改成 data URL，文档保存仍由前端还原为 yuque-resource:// 私有引用。
    Some(format!(
        "data:{};base64,{}",
        content_type,
        STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::build_image_data_url;

    #[test]
    fn creates_data_url_for_image_preview() {
        assert_eq!(
            build_image_data_url("images/2026/05/a.png", &[1, 2, 3]),
            Some("data:image/png;base64,AQID".to_string())
        );
    }

    #[test]
    fn skips_non_image_preview_data_url() {
        assert_eq!(build_image_data_url("files/2026/05/a.pdf", &[1, 2, 3]), None);
    }
}
