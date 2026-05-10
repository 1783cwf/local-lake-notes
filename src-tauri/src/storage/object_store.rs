use crate::error::{AppError, AppResult};
use crate::models::{OssSettings, StorageProviderKind};
use crate::storage::{local_store, s3, webdav};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectStoreTarget {
    pub provider: StorageProviderKind,
    pub storage_id: String,
}

impl ObjectStoreTarget {
    pub fn active(settings: &OssSettings) -> Self {
        Self {
            provider: settings.active_provider.clone(),
            storage_id: settings.active_storage_id(),
        }
    }
}

pub async fn put_active_object(
    settings: &OssSettings,
    key: &str,
    bytes: Vec<u8>,
    content_type: &str,
) -> AppResult<()> {
    put_object(
        settings,
        &ObjectStoreTarget::active(settings),
        key,
        bytes,
        content_type,
    )
    .await
}

pub async fn get_active_object_bytes(settings: &OssSettings, key: &str) -> AppResult<Vec<u8>> {
    get_object_bytes(settings, &ObjectStoreTarget::active(settings), key).await
}

pub async fn delete_active_object(settings: &OssSettings, key: &str) -> AppResult<()> {
    delete_object(settings, &ObjectStoreTarget::active(settings), key).await
}

pub async fn list_active_object_keys(
    settings: &OssSettings,
    prefix: &str,
) -> AppResult<Vec<String>> {
    list_object_keys(settings, &ObjectStoreTarget::active(settings), prefix).await
}

pub async fn put_object(
    settings: &OssSettings,
    target: &ObjectStoreTarget,
    key: &str,
    bytes: Vec<u8>,
    content_type: &str,
) -> AppResult<()> {
    validate_target(settings, target)?;
    match target.provider {
        StorageProviderKind::S3 => s3::put_object(settings, key, bytes, content_type).await,
        StorageProviderKind::Local => {
            local_store::put_object(&settings.local, key, bytes)?;
            Ok(())
        }
        StorageProviderKind::Webdav => {
            webdav::put_object(&settings.webdav, key, bytes, content_type).await
        }
    }
}

pub async fn get_object_bytes(
    settings: &OssSettings,
    target: &ObjectStoreTarget,
    key: &str,
) -> AppResult<Vec<u8>> {
    validate_target(settings, target)?;
    match target.provider {
        StorageProviderKind::S3 => s3::get_object_bytes(settings, key).await,
        StorageProviderKind::Local => local_store::get_object_bytes(&settings.local, key),
        StorageProviderKind::Webdav => webdav::get_object_bytes(&settings.webdav, key).await,
    }
}

pub async fn delete_object(
    settings: &OssSettings,
    target: &ObjectStoreTarget,
    key: &str,
) -> AppResult<()> {
    validate_target(settings, target)?;
    match target.provider {
        StorageProviderKind::S3 => s3::delete_object(settings, key).await,
        StorageProviderKind::Local => local_store::delete_object(&settings.local, key),
        StorageProviderKind::Webdav => webdav::delete_object(&settings.webdav, key).await,
    }
}

pub async fn list_object_keys(
    settings: &OssSettings,
    target: &ObjectStoreTarget,
    prefix: &str,
) -> AppResult<Vec<String>> {
    validate_target(settings, target)?;
    match target.provider {
        StorageProviderKind::S3 => s3::list_object_keys(settings, prefix).await,
        StorageProviderKind::Local => local_store::list_object_keys(&settings.local, prefix),
        StorageProviderKind::Webdav => webdav::list_object_keys(&settings.webdav, prefix).await,
    }
}

pub async fn presign_get_object_url(
    settings: &OssSettings,
    target: &ObjectStoreTarget,
    key: &str,
    ttl_seconds: u64,
    filename: Option<&str>,
) -> AppResult<String> {
    validate_target(settings, target)?;
    match target.provider {
        StorageProviderKind::S3 => {
            s3::presign_get_object_url(settings, key, ttl_seconds, filename).await
        }
        StorageProviderKind::Local | StorageProviderKind::Webdav => Err(
            AppError::InvalidOssSettings("本地和 WebDAV 存储暂不支持短时签名链接导出".to_string()),
        ),
    }
}

pub fn target_from_resource_ref(resource: &s3::ResourceRef) -> ObjectStoreTarget {
    ObjectStoreTarget {
        provider: resource.provider.clone(),
        storage_id: resource.storage_id.clone(),
    }
}

pub fn validate_resource_ref(settings: &OssSettings, resource: &s3::ResourceRef) -> AppResult<()> {
    validate_target(settings, &target_from_resource_ref(resource))?;
    validate_allowed_key(settings, &resource.key)
}

fn validate_target(settings: &OssSettings, target: &ObjectStoreTarget) -> AppResult<()> {
    let expected = match target.provider {
        StorageProviderKind::S3 => settings.bucket.trim(),
        StorageProviderKind::Local => settings.local.storage_id.trim(),
        StorageProviderKind::Webdav => settings.webdav.storage_id.trim(),
    };
    let fallback = match target.provider {
        StorageProviderKind::S3 => "",
        StorageProviderKind::Local => "local",
        StorageProviderKind::Webdav => "webdav",
    };
    let expected = if expected.is_empty() {
        fallback
    } else {
        expected
    };
    if expected != target.storage_id {
        return Err(AppError::InvalidExternalUrl);
    }
    Ok(())
}

fn validate_allowed_key(settings: &OssSettings, key: &str) -> AppResult<()> {
    let allowed_prefixes = [
        settings.image_prefix.trim_matches('/'),
        settings.file_prefix.trim_matches('/'),
        settings.backup_prefix.trim_matches('/'),
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
