use tauri::AppHandle;

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{UploadImageInput, UploadImageOutput};
use crate::storage::s3::{build_image_object_key, build_public_url, put_object};

#[tauri::command]
pub async fn upload_image(app: AppHandle, input: UploadImageInput) -> AppResult<UploadImageOutput> {
    let settings = load_oss_settings(&app)?.ok_or_else(|| {
        AppError::InvalidOssSettings("请先配置 OSS 上传信息".to_string())
    })?;
    validate_oss_settings(&settings)?;

    let key = build_image_object_key(&settings.image_prefix, &input.filename);
    let content_type = input
        .mime_type
        .clone()
        .unwrap_or_else(|| mime_guess::from_path(&input.filename).first_or_octet_stream().to_string());

    put_object(&settings, &key, input.bytes.clone(), &content_type).await?;

    Ok(UploadImageOutput {
        url: build_public_url(&settings.public_base_url, &key),
        size: input.bytes.len(),
        filename: input.filename,
    })
}
