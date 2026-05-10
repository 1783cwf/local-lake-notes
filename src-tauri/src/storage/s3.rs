use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Builder as S3ConfigBuilder;
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use chrono::Utc;
use std::time::Duration;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{OssSettings, StorageProviderKind};
use crate::storage::resource_crypto::RESOURCE_ENCRYPTION_ALGORITHM;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceRef {
    pub provider: StorageProviderKind,
    pub storage_id: String,
    pub bucket: String,
    pub key: String,
    pub kind: String,
    pub name: Option<String>,
    pub size: Option<usize>,
    pub content_type: Option<String>,
    pub encryption: Option<ResourceEncryptionMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceEncryptionMetadata {
    pub algorithm: String,
    pub key_fingerprint: String,
}

pub fn build_image_object_key(prefix: &str, filename: &str) -> String {
    build_object_key(prefix, filename)
}

pub fn build_file_object_key(prefix: &str, filename: &str) -> String {
    build_object_key(prefix, filename)
}

fn build_object_key(prefix: &str, filename: &str) -> String {
    let safe_prefix = sanitize_path_segment(prefix).unwrap_or_else(|| "images".to_string());
    let safe_filename = sanitize_filename(filename);
    let extension = safe_filename
        .rsplit_once('.')
        .map(|(_, extension)| format!(".{extension}"))
        .unwrap_or_default();
    let now = Utc::now();
    format!(
        "{}/{}/{}/{}{}",
        safe_prefix.trim_matches('/'),
        now.format("%Y"),
        now.format("%m"),
        Uuid::new_v4(),
        extension
    )
}

pub fn build_public_url(base_url: &str, key: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        key.trim_start_matches('/')
    )
}

pub fn build_resource_ref(
    settings: &OssSettings,
    key: &str,
    kind: &str,
    filename: &str,
    size: usize,
    content_type: &str,
) -> String {
    build_resource_ref_with_encryption(settings, key, kind, filename, size, content_type, None)
}

pub fn build_resource_ref_with_encryption(
    settings: &OssSettings,
    key: &str,
    kind: &str,
    filename: &str,
    size: usize,
    content_type: &str,
    key_fingerprint: Option<&str>,
) -> String {
    let encryption = key_fingerprint
        .filter(|fingerprint| !fingerprint.trim().is_empty())
        .map(|fingerprint| ResourceEncryptionMetadata {
            algorithm: RESOURCE_ENCRYPTION_ALGORITHM.to_string(),
            key_fingerprint: fingerprint.to_string(),
        });
    build_resource_ref_for_target(
        &settings.active_provider,
        &settings.active_storage_id(),
        key,
        kind,
        Some(filename),
        Some(size),
        Some(content_type),
        encryption.as_ref(),
    )
}

pub fn build_resource_ref_for_target(
    provider: &StorageProviderKind,
    storage_id: &str,
    key: &str,
    kind: &str,
    filename: Option<&str>,
    size: Option<usize>,
    content_type: Option<&str>,
    encryption: Option<&ResourceEncryptionMetadata>,
) -> String {
    let mut query = vec![
        format!("provider={}", url_encode(storage_provider_query(provider))),
        format!("kind={}", url_encode(kind)),
    ];
    if let Some(filename) = filename.filter(|value| !value.trim().is_empty()) {
        query.push(format!("name={}", url_encode(filename)));
    }
    if let Some(size) = size {
        query.push(format!("size={size}"));
    }
    if let Some(content_type) = content_type.filter(|value| !value.trim().is_empty()) {
        query.push(format!("type={}", url_encode(content_type)));
    }
    if let Some(encryption) = encryption {
        query.push(format!("enc={}", url_encode(&encryption.algorithm)));
        query.push(format!(
            "keyFingerprint={}",
            url_encode(&encryption.key_fingerprint)
        ));
    }
    format!(
        "yuque-resource://{}/{}?{}",
        url_encode(storage_id),
        key.split('/').map(url_encode).collect::<Vec<_>>().join("/"),
        query.join("&")
    )
}

pub fn parse_resource_ref(resource_ref: &str) -> AppResult<(String, String)> {
    let Some(rest) = resource_ref.strip_prefix("yuque-resource://") else {
        return Err(AppError::InvalidExternalUrl);
    };
    let (target, _) = rest.split_once('?').unwrap_or((rest, ""));
    let Some((storage_id, key)) = target.split_once('/') else {
        return Err(AppError::InvalidExternalUrl);
    };
    let storage_id = percent_decode(storage_id);
    let key = key
        .split('/')
        .map(percent_decode)
        .collect::<Vec<_>>()
        .join("/");
    if storage_id.is_empty() || key.is_empty() {
        return Err(AppError::InvalidExternalUrl);
    }
    Ok((storage_id, key))
}

pub fn parse_resource_ref_detail(resource_ref: &str) -> AppResult<ResourceRef> {
    let Some(rest) = resource_ref.strip_prefix("yuque-resource://") else {
        return Err(AppError::InvalidExternalUrl);
    };
    let (target, query) = rest.split_once('?').unwrap_or((rest, ""));
    let Some((storage_id, key)) = target.split_once('/') else {
        return Err(AppError::InvalidExternalUrl);
    };
    let storage_id = percent_decode(storage_id);
    let key = key
        .split('/')
        .map(percent_decode)
        .collect::<Vec<_>>()
        .join("/");
    if storage_id.is_empty() || key.is_empty() {
        return Err(AppError::InvalidExternalUrl);
    }

    let params = parse_query_params(query);
    let provider = match params.get("provider").map(String::as_str) {
        Some("s3") | None => StorageProviderKind::S3,
        Some("local") => StorageProviderKind::Local,
        Some("webdav") => StorageProviderKind::Webdav,
        Some(_) => return Err(AppError::InvalidExternalUrl),
    };
    let encryption = match params.get("enc") {
        Some(algorithm) if algorithm == RESOURCE_ENCRYPTION_ALGORITHM => {
            let fingerprint = params
                .get("keyFingerprint")
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::InvalidExternalUrl)?;
            Some(ResourceEncryptionMetadata {
                algorithm: algorithm.clone(),
                key_fingerprint: fingerprint.clone(),
            })
        }
        Some(_) => return Err(AppError::InvalidExternalUrl),
        None => None,
    };

    Ok(ResourceRef {
        provider,
        storage_id: storage_id.clone(),
        bucket: storage_id,
        key,
        kind: params
            .get("kind")
            .cloned()
            .unwrap_or_else(|| "image".to_string()),
        name: params.get("name").cloned(),
        size: params
            .get("size")
            .and_then(|value| value.parse::<usize>().ok()),
        content_type: params.get("type").cloned(),
        encryption,
    })
}

pub async fn put_object(
    settings: &OssSettings,
    key: &str,
    bytes: Vec<u8>,
    content_type: &str,
) -> AppResult<()> {
    let client = s3_client(settings).await;

    client
        .put_object()
        .bucket(&settings.bucket)
        .key(key)
        .content_type(content_type)
        .body(ByteStream::from(bytes))
        .send()
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;

    Ok(())
}

pub async fn get_object_bytes(settings: &OssSettings, key: &str) -> AppResult<Vec<u8>> {
    let client = s3_client(settings).await;
    let output = client
        .get_object()
        .bucket(&settings.bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;

    output
        .body
        .collect()
        .await
        .map(|bytes| bytes.into_bytes().to_vec())
        .map_err(|error| AppError::S3(error.to_string()))
}

pub async fn delete_object(settings: &OssSettings, key: &str) -> AppResult<()> {
    let client = s3_client(settings).await;
    client
        .delete_object()
        .bucket(&settings.bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;
    Ok(())
}

pub async fn list_object_keys(settings: &OssSettings, prefix: &str) -> AppResult<Vec<String>> {
    let client = s3_client(settings).await;
    let mut token = None;
    let mut keys = Vec::new();
    loop {
        let output = client
            .list_objects_v2()
            .bucket(&settings.bucket)
            .prefix(prefix)
            .set_continuation_token(token)
            .send()
            .await
            .map_err(|error| AppError::S3(error.to_string()))?;

        for object in output.contents() {
            if let Some(key) = object.key() {
                keys.push(key.to_string());
            }
        }

        token = output.next_continuation_token().map(ToString::to_string);
        if token.is_none() {
            break;
        }
    }
    Ok(keys)
}

pub async fn test_connection(settings: &OssSettings) -> AppResult<()> {
    let client = s3_client(settings).await;
    client
        .list_objects_v2()
        .bucket(&settings.bucket)
        .max_keys(1)
        .send()
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;
    Ok(())
}

pub async fn presign_get_object_url(
    settings: &OssSettings,
    key: &str,
    ttl_seconds: u64,
    filename: Option<&str>,
) -> AppResult<String> {
    let client = s3_client(settings).await;
    let config = PresigningConfig::expires_in(Duration::from_secs(ttl_seconds))
        .map_err(|error| AppError::S3(error.to_string()))?;
    let mut request = client.get_object().bucket(&settings.bucket).key(key);
    if let Some(filename) = filename.filter(|name| !name.trim().is_empty()) {
        request = request.response_content_disposition(content_disposition(filename));
    }
    let presigned = request
        .presigned(config)
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;
    Ok(presigned.uri().to_string())
}

pub fn validate_resource_key(settings: &OssSettings, bucket: &str, key: &str) -> AppResult<()> {
    if bucket != settings.bucket {
        return Err(AppError::InvalidExternalUrl);
    }
    let allowed_prefixes = [
        settings.image_prefix.trim_matches('/'),
        settings.file_prefix.trim_matches('/'),
        "tmp/exports",
    ];
    if allowed_prefixes
        .iter()
        .filter(|prefix| !prefix.is_empty())
        .any(|prefix| key == *prefix || key.starts_with(&format!("{prefix}/")))
    {
        Ok(())
    } else {
        Err(AppError::InvalidExternalUrl)
    }
}

fn storage_provider_query(provider: &StorageProviderKind) -> &'static str {
    match provider {
        StorageProviderKind::S3 => "s3",
        StorageProviderKind::Local => "local",
        StorageProviderKind::Webdav => "webdav",
    }
}

pub fn build_temporary_export_object_key(export_id: &str, kind: &str, filename: &str) -> String {
    let safe_export_id = sanitize_filename(export_id);
    let safe_kind = sanitize_filename(kind);
    let safe_name = sanitize_filename(filename);
    format!(
        "tmp/exports/{}/{}/{}",
        if safe_export_id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            safe_export_id
        },
        if safe_kind.is_empty() {
            "resources".to_string()
        } else {
            safe_kind
        },
        if safe_name.is_empty() {
            "resource".to_string()
        } else {
            safe_name
        }
    )
}

async fn s3_client(settings: &OssSettings) -> Client {
    let credentials = Credentials::new(
        settings.access_key_id.clone(),
        settings.secret_access_key.clone(),
        None,
        None,
        "yuque-lake-notes",
    );
    let shared_config = aws_config::defaults(BehaviorVersion::latest())
        .endpoint_url(settings.endpoint.clone())
        .region(Region::new(settings.region.clone()))
        .credentials_provider(credentials)
        .load()
        .await;
    let mut builder = S3ConfigBuilder::from(&shared_config);
    builder.set_force_path_style(Some(settings.force_path_style));
    Client::from_conf(builder.build())
}

fn sanitize_path_segment(value: &str) -> Option<String> {
    let cleaned = value
        .split('/')
        .filter_map(|part| {
            let segment = sanitize_filename(part);
            if segment.is_empty() {
                None
            } else {
                Some(segment)
            }
        })
        .collect::<Vec<_>>()
        .join("/");

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn sanitize_filename(filename: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for character in filename.trim().chars() {
        let invalid = character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            );
        if invalid || character.is_whitespace() {
            if !last_dash && !output.is_empty() {
                output.push('-');
                last_dash = true;
            }
            continue;
        }
        output.push(character);
        last_dash = false;
    }
    output.trim_matches('-').to_string()
}

fn url_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| {
            let allowed = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
            if allowed {
                vec![byte as char]
            } else {
                format!("%{byte:02X}").chars().collect()
            }
        })
        .collect()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                output.push(hex);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn parse_query_params(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            let key = percent_decode(key);
            if key.is_empty() {
                None
            } else {
                Some((key, percent_decode(value)))
            }
        })
        .collect()
}

fn content_disposition(filename: &str) -> String {
    format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        filename.replace('"', "'"),
        url_encode(filename)
    )
}
