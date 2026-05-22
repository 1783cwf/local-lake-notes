use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::BackupKeyStatus;
use crate::storage::app_database::{load_backup_key_metadata, save_backup_key_metadata};

const MIN_BACKUP_KEY_LEN: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupKeyMetadata {
    pub fingerprint: String,
    pub created_at: String,
    #[serde(default)]
    pub secret: Option<String>,
}

pub fn backup_key_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    backup_key_metadata_status(app)
}

pub fn verified_backup_key_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    backup_key_metadata_status(app)
}

pub fn set_backup_secret(app: &AppHandle, secret: &str) -> AppResult<BackupKeyStatus> {
    validate_backup_secret(secret)?;
    let metadata = BackupKeyMetadata {
        fingerprint: backup_key_fingerprint(secret),
        created_at: Utc::now().to_rfc3339(),
        // 备份密钥只存应用数据库，避免系统凭据授权弹窗影响备份和恢复流程。
        secret: Some(secret.to_string()),
    };
    save_backup_key_metadata(app, &serde_json::to_string(&metadata)?)?;
    backup_key_metadata_status(app)
}

pub fn current_backup_secret(app: &AppHandle) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置备份加密密钥".to_string()))?;
    metadata
        .secret
        .filter(|secret| !secret.trim().is_empty())
        .ok_or_else(|| AppError::Backup("请先设置备份加密密钥".to_string()))
}

pub fn current_key_fingerprint(app: &AppHandle) -> AppResult<String> {
    let metadata =
        load_metadata(app)?.ok_or_else(|| AppError::Backup("请先设置备份加密密钥".to_string()))?;
    Ok(metadata.fingerprint)
}

pub fn backup_key_metadata_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    Ok(backup_key_status_from_metadata(
        load_metadata(app)?.as_ref(),
    ))
}

pub fn validate_backup_secret(secret: &str) -> AppResult<()> {
    if secret.chars().count() < MIN_BACKUP_KEY_LEN {
        return Err(AppError::Backup(format!(
            "备份密钥长度不能少于 {MIN_BACKUP_KEY_LEN} 个字符"
        )));
    }
    Ok(())
}

pub fn backup_key_fingerprint(secret: &str) -> String {
    // fingerprint 只用于判断“当前本地密钥是否可能匹配备份”，不保存到备份对象明文中。
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"yuque-lake-notes-backup-key-v1:");
    hasher.update(secret.as_bytes());
    hasher.finalize().to_hex()[..16].to_string()
}

fn load_metadata(app: &AppHandle) -> AppResult<Option<BackupKeyMetadata>> {
    load_backup_key_metadata(app)?
        .map(|content| serde_json::from_str(&content))
        .transpose()
        .map_err(Into::into)
}

fn backup_key_status_from_metadata(metadata: Option<&BackupKeyMetadata>) -> BackupKeyStatus {
    let secret_present = metadata
        .and_then(|value| value.secret.as_ref())
        .map(|secret| !secret.trim().is_empty())
        .unwrap_or(false);

    BackupKeyStatus {
        configured: metadata.is_some() && secret_present,
        needs_key: metadata.is_some() && !secret_present,
        fingerprint: metadata.map(|value| value.fingerprint.clone()),
        created_at: metadata.map(|value| value.created_at.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::{backup_key_fingerprint, backup_key_status_from_metadata, BackupKeyMetadata};

    #[test]
    fn backup_secret_status_uses_database_secret() {
        let metadata = BackupKeyMetadata {
            fingerprint: backup_key_fingerprint("very-secret-backup-key"),
            created_at: "2026-05-21T00:00:00Z".to_string(),
            secret: Some("very-secret-backup-key".to_string()),
        };
        let status = backup_key_status_from_metadata(Some(&metadata));

        assert!(status.configured);
        assert!(!status.needs_key);
    }

    #[test]
    fn legacy_backup_metadata_without_database_secret_requires_reset() {
        let metadata = BackupKeyMetadata {
            fingerprint: "old-key".to_string(),
            created_at: "2026-05-21T00:00:00Z".to_string(),
            secret: None,
        };
        let status = backup_key_status_from_metadata(Some(&metadata));

        assert!(!status.configured);
        assert!(status.needs_key);
    }
}
