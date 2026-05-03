use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{UploadImageInput, UploadImageOutput};
use crate::storage::s3::{
    build_file_object_key, build_image_object_key, build_public_url, build_resource_ref, put_object,
};

#[tauri::command]
pub async fn upload_image(app: AppHandle, input: UploadImageInput) -> AppResult<UploadImageOutput> {
    upload_object(app, input, |settings, filename| {
        build_image_object_key(&settings.image_prefix, filename)
    })
    .await
}

#[tauri::command]
pub async fn upload_file(app: AppHandle, input: UploadImageInput) -> AppResult<UploadImageOutput> {
    upload_object(app, input, |settings, filename| {
        build_file_object_key(&settings.file_prefix, filename)
    })
    .await
}

async fn upload_object(
    app: AppHandle,
    input: UploadImageInput,
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

    put_object(&settings, &key, input.bytes.clone(), &content_type).await?;
    let kind = if key.starts_with(settings.file_prefix.trim_matches('/')) {
        "file"
    } else {
        "image"
    };
    let resource_ref = build_resource_ref(
        &settings,
        &key,
        kind,
        &input.filename,
        input.bytes.len(),
        &content_type,
    );
    let preview_url = if settings.public_base_url.trim().is_empty() {
        let preview_path = write_upload_preview_cache(&app, &key, &input.bytes)?;
        preview_path.to_string_lossy().to_string()
    } else {
        build_public_url(&settings.public_base_url, &key)
    };

    Ok(UploadImageOutput {
        url: resource_ref.clone(),
        size: input.bytes.len(),
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
