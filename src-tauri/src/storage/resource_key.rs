use chrono::Utc;
use keyring_core::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::ResourceKeyStatus;
use crate::storage::app_database::{load_resource_key_metadata, save_resource_key_metadata};

const RESOURCE_KEY_ACCOUNT_PREFIX: &str = "resource-encryption-key";
const MIN_RESOURCE_KEY_LEN: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceKeyMetadata {
    pub active_fingerprint: String,
    pub created_at: String,
    #[serde(default)]
    pub known_fingerprints: Vec<String>,
}

pub trait ResourceKeyStore {
    fn get_secret(&self, fingerprint: &str) -> AppResult<Option<String>>;
    fn set_secret(&self, fingerprint: &str, secret: &str) -> AppResult<()>;
}

pub struct SystemResourceKeyStore {
    service: String,
}

impl SystemResourceKeyStore {
    pub fn new(app: &AppHandle) -> Self {
        Self {
            service: app.config().identifier.clone(),
        }
    }

    fn entry(&self, fingerprint: &str) -> AppResult<Entry> {
        let _ = keyring::use_native_store(false);
        Entry::new(
            &self.service,
            &format!("{RESOURCE_KEY_ACCOUNT_PREFIX}:{fingerprint}"),
        )
        .map_err(|error| AppError::Backup(format!("本地资源密钥存储不可用：{error}")))
    }
}

impl ResourceKeyStore for SystemResourceKeyStore {
    fn get_secret(&self, fingerprint: &str) -> AppResult<Option<String>> {
        match self.entry(fingerprint)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(error) if is_missing_keyring_entry(&error) => Ok(None),
            Err(error) => Err(AppError::Backup(format!("读取本地资源密钥失败：{error}"))),
        }
    }

    fn set_secret(&self, fingerprint: &str, secret: &str) -> AppResult<()> {
        self.entry(fingerprint)?
            .set_password(secret)
            .map_err(|error| AppError::Backup(format!("保存本地资源密钥失败：{error}")))
    }
}

pub fn resource_key_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    resource_key_metadata_status(app)
}

pub fn verified_resource_key_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    resource_key_status_with_store(app, &SystemResourceKeyStore::new(app))
}

pub fn set_resource_secret(app: &AppHandle, secret: &str) -> AppResult<ResourceKeyStatus> {
    set_resource_secret_with_store(app, &SystemResourceKeyStore::new(app), secret)
}

pub fn current_resource_secret(app: &AppHandle, fingerprint: Option<&str>) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置资源加密密钥".to_string()))?;
    let fingerprint = fingerprint.unwrap_or(&metadata.active_fingerprint);
    let store = SystemResourceKeyStore::new(app);
    store
        .get_secret(fingerprint)?
        .ok_or_else(|| AppError::Backup(format!("缺少资源密钥：{fingerprint}")))
}

pub fn active_resource_fingerprint(app: &AppHandle) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置资源加密密钥".to_string()))?;
    Ok(metadata.active_fingerprint)
}

pub fn resource_key_metadata_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    let metadata = load_metadata(app)?;
    // 启动阶段只读 SQLite 元数据，避免桌面端启动时访问系统钥匙串。
    Ok(ResourceKeyStatus {
        configured: metadata.is_some(),
        needs_key: false,
        fingerprint: metadata
            .as_ref()
            .map(|value| value.active_fingerprint.clone()),
        created_at: metadata.as_ref().map(|value| value.created_at.clone()),
        known_fingerprints: metadata
            .map(|value| value.known_fingerprints)
            .unwrap_or_default(),
    })
}

pub fn resource_key_status_with_store(
    app: &AppHandle,
    store: &impl ResourceKeyStore,
) -> AppResult<ResourceKeyStatus> {
    let metadata = load_metadata(app)?;
    let secret_present = match metadata.as_ref() {
        Some(metadata) => store.get_secret(&metadata.active_fingerprint)?.is_some(),
        None => false,
    };
    Ok(ResourceKeyStatus {
        configured: metadata.is_some() && secret_present,
        needs_key: metadata.is_some() && !secret_present,
        fingerprint: metadata
            .as_ref()
            .map(|value| value.active_fingerprint.clone()),
        created_at: metadata.as_ref().map(|value| value.created_at.clone()),
        known_fingerprints: metadata
            .map(|value| value.known_fingerprints)
            .unwrap_or_default(),
    })
}

pub fn set_resource_secret_with_store(
    app: &AppHandle,
    store: &impl ResourceKeyStore,
    secret: &str,
) -> AppResult<ResourceKeyStatus> {
    validate_resource_secret(secret)?;
    let fingerprint = resource_key_fingerprint(secret);
    store.set_secret(&fingerprint, secret)?;

    let mut known_fingerprints = load_metadata(app)?
        .map(|metadata| metadata.known_fingerprints)
        .unwrap_or_default();
    if !known_fingerprints.contains(&fingerprint) {
        known_fingerprints.push(fingerprint.clone());
    }

    let metadata = ResourceKeyMetadata {
        active_fingerprint: fingerprint,
        created_at: Utc::now().to_rfc3339(),
        known_fingerprints,
    };
    save_resource_key_metadata(app, &serde_json::to_string(&metadata)?)?;
    resource_key_status_with_store(app, store)
}

pub fn validate_resource_secret(secret: &str) -> AppResult<()> {
    if secret.chars().count() < MIN_RESOURCE_KEY_LEN {
        return Err(AppError::Backup(format!(
            "资源密钥长度不能少于 {MIN_RESOURCE_KEY_LEN} 个字符"
        )));
    }
    Ok(())
}

pub fn resource_key_fingerprint(secret: &str) -> String {
    // fingerprint 只用于定位本地资源密钥版本，不保存或泄露密钥明文。
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"local-lake-notes-resource-key-v1:");
    hasher.update(secret.as_bytes());
    hasher.finalize().to_hex()[..16].to_string()
}

fn load_metadata(app: &AppHandle) -> AppResult<Option<ResourceKeyMetadata>> {
    load_resource_key_metadata(app)?
        .map(|content| serde_json::from_str(&content))
        .transpose()
        .map_err(Into::into)
}

fn is_missing_keyring_entry(error: &KeyringError) -> bool {
    // macOS 钥匙串后端在条目缺失或授权记录异常时，可能返回底层 UNIX no such file。
    // 这里按“本机缺少该密钥”处理，让用户可以在设置页重新读取或重新设置密钥。
    matches!(error, KeyringError::NoEntry)
        || error.to_string().contains("No such file or directory")
}

#[cfg(test)]
#[derive(Default)]
pub struct MemoryResourceKeyStore {
    secrets: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(test)]
impl ResourceKeyStore for MemoryResourceKeyStore {
    fn get_secret(&self, fingerprint: &str) -> AppResult<Option<String>> {
        Ok(self.secrets.lock().unwrap().get(fingerprint).cloned())
    }

    fn set_secret(&self, fingerprint: &str, secret: &str) -> AppResult<()> {
        self.secrets
            .lock()
            .unwrap()
            .insert(fingerprint.to_string(), secret.to_string());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::resource_key_fingerprint;

    #[test]
    fn fingerprint_is_stable_without_exposing_secret() {
        let fingerprint = resource_key_fingerprint("very-secret-resource-key");

        assert_eq!(
            fingerprint,
            resource_key_fingerprint("very-secret-resource-key")
        );
        assert!(!fingerprint.contains("very-secret-resource-key"));
    }
}
