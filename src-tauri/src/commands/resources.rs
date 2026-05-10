use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{
    ResourceDownloadInput, ResourcePreviewInput, ResourcePreviewOutput, SignedResourceUrlInput,
    SignedResourceUrlOutput,
};
use crate::storage::object_store::{
    get_object_bytes, presign_get_object_url, put_active_object, target_from_resource_ref,
    validate_resource_ref,
};
use crate::storage::resource_crypto::decrypt_resource_bytes;
use crate::storage::resource_key::current_resource_secret;
use crate::storage::s3::{build_temporary_export_object_key, parse_resource_ref_detail};

#[tauri::command]
pub async fn prepare_resource_preview(
    app: AppHandle,
    input: ResourcePreviewInput,
) -> AppResult<ResourcePreviewOutput> {
    let settings = load_valid_settings(&app)?;
    let resource = parse_resource_ref_detail(&input.resource_ref)?;
    validate_resource_ref(&settings, &resource)?;
    let bytes = read_resource_plain_bytes(&app, &settings, &resource).await?;
    let local_path = resource_cache_path(&app, &resource.key)?;
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&local_path, &bytes)?;
    let preview_url = local_path.to_string_lossy().to_string();
    Ok(ResourcePreviewOutput {
        resource_ref: input.resource_ref,
        preview_url,
        local_path: local_path.to_string_lossy().to_string(),
        data_url: build_image_data_url(
            resource
                .content_type
                .as_deref()
                .unwrap_or(resource.key.as_str()),
            &bytes,
        ),
    })
}

#[tauri::command]
pub async fn download_resource(app: AppHandle, input: ResourceDownloadInput) -> AppResult<()> {
    let settings = load_valid_settings(&app)?;
    let resource = parse_resource_ref_detail(&input.resource_ref)?;
    validate_resource_ref(&settings, &resource)?;
    let bytes = read_resource_plain_bytes(&app, &settings, &resource).await?;
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
    let resource = parse_resource_ref_detail(&input.resource_ref)?;
    validate_resource_ref(&settings, &resource)?;
    read_resource_plain_bytes(&app, &settings, &resource).await
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
    let resource = parse_resource_ref_detail(&input.resource_ref)?;
    validate_resource_ref(&settings, &resource)?;
    let filename = input
        .filename
        .as_deref()
        .or(resource.name.as_deref())
        .unwrap_or("resource");
    let key = if resource.encryption.is_some() {
        let bytes = read_resource_plain_bytes(&app, &settings, &resource).await?;
        let export_id = Uuid::new_v4().to_string();
        let temporary_key = build_temporary_export_object_key(&export_id, &resource.kind, filename);
        let guessed_content_type = mime_guess::from_path(filename)
            .first_or_octet_stream()
            .essence_str()
            .to_string();
        let content_type = resource
            .content_type
            .as_deref()
            .unwrap_or(guessed_content_type.as_str());
        put_active_object(&settings, &temporary_key, bytes, content_type).await?;
        temporary_key
    } else {
        resource.key.clone()
    };
    let target = if resource.encryption.is_some() {
        crate::storage::object_store::ObjectStoreTarget::active(&settings)
    } else {
        target_from_resource_ref(&resource)
    };
    let url =
        presign_get_object_url(&settings, &target, &key, input.ttl_seconds, Some(filename)).await?;
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

async fn read_resource_plain_bytes(
    app: &AppHandle,
    settings: &crate::models::OssSettings,
    resource: &crate::storage::s3::ResourceRef,
) -> AppResult<Vec<u8>> {
    let bytes =
        get_object_bytes(settings, &target_from_resource_ref(resource), &resource.key).await?;
    let Some(encryption) = resource.encryption.as_ref() else {
        return Ok(bytes);
    };
    let secret = current_resource_secret(app, Some(&encryption.key_fingerprint))?;
    decrypt_resource_bytes(&bytes, &secret)
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

fn build_image_data_url(content_hint: &str, bytes: &[u8]) -> Option<String> {
    // 旧文档和新资源引用都会把原始 MIME 保存在 type=image/png 里；
    // 这里优先识别 MIME 字符串，避免把 "image/png" 当文件路径导致图片回显退回到不稳定的 asset 地址。
    let normalized_hint = content_hint
        .split(';')
        .next()
        .unwrap_or(content_hint)
        .trim();
    let content_type = if is_mime_type_hint(normalized_hint) {
        normalized_hint.to_string()
    } else {
        mime_guess::from_path(content_hint)
            .first_or_octet_stream()
            .essence_str()
            .to_string()
    };
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

fn is_mime_type_hint(value: &str) -> bool {
    let Some((mime_type, subtype)) = value.split_once('/') else {
        return false;
    };
    !subtype.is_empty()
        && matches!(
            mime_type,
            "application"
                | "audio"
                | "font"
                | "image"
                | "message"
                | "model"
                | "multipart"
                | "text"
                | "video"
        )
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
    fn creates_data_url_from_image_content_type() {
        assert_eq!(
            build_image_data_url("image/png", &[1, 2, 3]),
            Some("data:image/png;base64,AQID".to_string())
        );
    }

    #[test]
    fn skips_non_image_preview_data_url() {
        assert_eq!(
            build_image_data_url("files/2026/05/a.pdf", &[1, 2, 3]),
            None
        );
    }
}
