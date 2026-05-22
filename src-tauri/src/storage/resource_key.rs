use std::collections::BTreeMap;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::ResourceKeyStatus;
use crate::storage::app_database::{load_resource_key_metadata, save_resource_key_metadata};

const MIN_RESOURCE_KEY_LEN: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceKeyMetadata {
    pub active_fingerprint: String,
    pub created_at: String,
    #[serde(default)]
    pub known_fingerprints: Vec<String>,
    // 按用户要求，资源密钥直接随本地 SQLite 元数据保存。
    #[serde(default)]
    pub secrets: BTreeMap<String, String>,
}

pub fn resource_key_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    resource_key_metadata_status(app)
}

pub fn verified_resource_key_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    resource_key_metadata_status(app)
}

pub fn set_resource_secret(app: &AppHandle, secret: &str) -> AppResult<ResourceKeyStatus> {
    validate_resource_secret(secret)?;
    let metadata = next_resource_key_metadata(load_metadata(app)?, secret);
    save_resource_key_metadata(app, &serde_json::to_string(&metadata)?)?;
    resource_key_metadata_status(app)
}

pub fn current_resource_secret(app: &AppHandle, fingerprint: Option<&str>) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置资源加密密钥".to_string()))?;
    let fingerprint = fingerprint.unwrap_or(&metadata.active_fingerprint);
    metadata
        .secrets
        .get(fingerprint)
        .cloned()
        .ok_or_else(|| AppError::Backup(format!("缺少资源密钥：{fingerprint}")))
}

pub fn active_resource_fingerprint(app: &AppHandle) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置资源加密密钥".to_string()))?;
    Ok(metadata.active_fingerprint)
}

pub fn resource_key_metadata_status(app: &AppHandle) -> AppResult<ResourceKeyStatus> {
    let metadata = load_metadata(app)?;
    Ok(resource_key_status_from_metadata(metadata.as_ref()))
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
    // fingerprint 用于标识资源引用里的密钥版本，避免把明文写入每个资源 URL。
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

fn next_resource_key_metadata(
    current: Option<ResourceKeyMetadata>,
    secret: &str,
) -> ResourceKeyMetadata {
    let fingerprint = resource_key_fingerprint(secret);
    let mut metadata = current.unwrap_or_else(|| ResourceKeyMetadata {
        active_fingerprint: fingerprint.clone(),
        created_at: Utc::now().to_rfc3339(),
        known_fingerprints: Vec::new(),
        secrets: BTreeMap::new(),
    });

    metadata.active_fingerprint = fingerprint.clone();
    metadata.created_at = Utc::now().to_rfc3339();
    if !metadata.known_fingerprints.contains(&fingerprint) {
        metadata.known_fingerprints.push(fingerprint.clone());
    }
    // 资源密钥按 fingerprint 保存在 SQLite，避免打包版依赖系统凭据存储导致无法写入。
    metadata.secrets.insert(fingerprint, secret.to_string());
    metadata
}

fn resource_key_status_from_metadata(metadata: Option<&ResourceKeyMetadata>) -> ResourceKeyStatus {
    let secret_present = metadata
        .map(|value| value.secrets.contains_key(&value.active_fingerprint))
        .unwrap_or(false);

    ResourceKeyStatus {
        configured: metadata.is_some() && secret_present,
        needs_key: metadata.is_some() && !secret_present,
        fingerprint: metadata.map(|value| value.active_fingerprint.clone()),
        created_at: metadata.map(|value| value.created_at.clone()),
        known_fingerprints: metadata
            .map(|value| value.known_fingerprints.clone())
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        next_resource_key_metadata, resource_key_fingerprint, resource_key_status_from_metadata,
        ResourceKeyMetadata,
    };

    #[test]
    fn fingerprint_is_stable_without_exposing_secret() {
        let fingerprint = resource_key_fingerprint("very-secret-resource-key");

        assert_eq!(
            fingerprint,
            resource_key_fingerprint("very-secret-resource-key")
        );
        assert!(!fingerprint.contains("very-secret-resource-key"));
    }

    #[test]
    fn resource_secret_is_stored_in_metadata_by_fingerprint() {
        let metadata = next_resource_key_metadata(None, "very-secret-resource-key");
        let fingerprint = resource_key_fingerprint("very-secret-resource-key");
        let status = resource_key_status_from_metadata(Some(&metadata));

        assert_eq!(metadata.active_fingerprint, fingerprint);
        assert_eq!(
            metadata.secrets.get(&fingerprint).map(String::as_str),
            Some("very-secret-resource-key")
        );
        assert!(status.configured);
        assert!(!status.needs_key);
    }

    #[test]
    fn legacy_metadata_without_database_secret_requires_reset() {
        let metadata = ResourceKeyMetadata {
            active_fingerprint: "old-key".to_string(),
            created_at: "2026-05-21T00:00:00Z".to_string(),
            known_fingerprints: vec!["old-key".to_string()],
            secrets: Default::default(),
        };
        let status = resource_key_status_from_metadata(Some(&metadata));

        assert!(!status.configured);
        assert!(status.needs_key);
    }
}
