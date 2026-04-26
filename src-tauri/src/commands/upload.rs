use tauri::AppHandle;

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{UploadImageInput, UploadImageOutput};
use crate::storage::s3::{
    build_file_object_key, build_image_object_key, build_public_url, put_object,
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
    upload_object(app, input, |_settings, filename| {
        build_file_object_key(filename)
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

    Ok(UploadImageOutput {
        url: build_public_url(&settings.public_base_url, &key),
        size: input.bytes.len(),
        extname: file_extension(&input.filename),
        filename: input.filename,
    })
}

fn file_extension(filename: &str) -> Option<String> {
    filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.trim().to_string())
        .filter(|extension| !extension.is_empty())
}
