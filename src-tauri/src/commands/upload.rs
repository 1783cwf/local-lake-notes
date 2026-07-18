use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{UploadImageInput, UploadImageOutput};
use crate::storage::image_optimization::optimize_image_bytes;
use crate::storage::object_store::put_active_object;
use crate::storage::resource_crypto::{encrypt_resource_bytes, RESOURCE_CIPHERTEXT_CONTENT_TYPE};
use crate::storage::resource_key::{active_resource_fingerprint, current_resource_secret};
use crate::storage::s3::{
    build_file_object_key, build_image_object_key, build_resource_ref_with_encryption,
};

#[tauri::command]
pub async fn upload_image(app: AppHandle, input: UploadImageInput) -> AppResult<UploadImageOutput> {
    upload_object(app, input, true, |settings, filename| {
        build_image_object_key(&settings.image_prefix, filename)
    })
    .await
}

#[tauri::command]
pub async fn upload_file(app: AppHandle, input: UploadImageInput) -> AppResult<UploadImageOutput> {
    upload_object(app, input, false, |settings, filename| {
        build_file_object_key(&settings.file_prefix, filename)
    })
    .await
}

async fn upload_object(
    app: AppHandle,
    input: UploadImageInput,
    optimize_image: bool,
    build_key: impl FnOnce(&crate::models::OssSettings, &str) -> String,
) -> AppResult<UploadImageOutput> {
    let settings = load_oss_settings(&app)?
        .ok_or_else(|| AppError::InvalidOssSettings("请先配置 OSS 上传信息".to_string()))?;
    validate_oss_settings(&settings)?;

    let key = build_key(&settings, &input.filename);
    let content_type = input.mime_type.clone().unwrap_or_else(|| {
        mime_guess::from_path(&input.filename)
            .first_or_octet_stream()
            .to_string()
    });
    let source_bytes = if optimize_image {
        optimize_image_bytes(&input.bytes, &content_type, &settings.image_optimization)
            .filter(|optimized| optimized.len() < input.bytes.len())
            .unwrap_or_else(|| input.bytes.clone())
    } else {
        input.bytes.clone()
    };
    let key_fingerprint = if settings.active_provider == crate::models::StorageProviderKind::Local {
        None
    } else {
        Some(active_resource_fingerprint(&app)?)
    };
    let (stored_bytes, stored_content_type) = if let Some(fingerprint) = key_fingerprint.as_deref()
    {
        let secret = current_resource_secret(&app, Some(fingerprint))?;
        (
            encrypt_resource_bytes(&source_bytes, &secret)?,
            RESOURCE_CIPHERTEXT_CONTENT_TYPE,
        )
    } else {
        // 本地存储只落在用户指定目录，本机访问不需要再做资源级加密，避免上传和预览都被密钥链路拖慢。
        (source_bytes.clone(), content_type.as_str())
    };

    put_active_object(&settings, &key, stored_bytes, stored_content_type).await?;
    let kind = if key.starts_with(settings.file_prefix.trim_matches('/')) {
        "file"
    } else {
        "image"
    };
    let resource_ref = build_resource_ref_with_encryption(
        &settings,
        &key,
        kind,
        &input.filename,
        source_bytes.len(),
        &content_type,
        key_fingerprint.as_deref(),
    );
    // 上传后的编辑器回显不能依赖公共访问 URL。桶保持私有时，预览走本地缓存；
    // 文档保存仍写入 resource_ref，后续打开时可从 S3 重新生成缓存。
    let preview_path = write_upload_preview_cache(&app, &key, &source_bytes)?;
    let preview_url = preview_path.to_string_lossy().to_string();

    Ok(UploadImageOutput {
        url: resource_ref.clone(),
        size: source_bytes.len(),
        extname: file_extension(&input.filename),
        filename: input.filename,
        resource_ref: Some(resource_ref),
        preview_url: Some(preview_url),
    })
}

fn file_extension(filename: &str) -> Option<String> {
    filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.trim().to_string())
        .filter(|extension| !extension.is_empty())
}

fn write_upload_preview_cache(app: &AppHandle, key: &str, bytes: &[u8]) -> AppResult<PathBuf> {
    let path = resource_cache_path(app, key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, bytes)?;
    Ok(path)
}

fn resource_cache_path(app: &AppHandle, key: &str) -> AppResult<PathBuf> {
    let base_dir = app.path().app_cache_dir()?;
    Ok(key
        .split('/')
        .filter(|part| !part.trim().is_empty())
        .map(safe_segment)
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
