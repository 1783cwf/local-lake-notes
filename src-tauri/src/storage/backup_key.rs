use chrono::Utc;
use serde::{Deserialize, Serialize};
use keyring_core::{Entry, Error as KeyringError};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::BackupKeyStatus;
use crate::storage::app_database::{load_backup_key_metadata, save_backup_key_metadata};

const BACKUP_KEY_ACCOUNT: &str = "backup-encryption-key";
const MIN_BACKUP_KEY_LEN: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupKeyMetadata {
    pub fingerprint: String,
    pub created_at: String,
}

pub trait BackupKeyStore {
    fn get_secret(&self) -> AppResult<Option<String>>;
    fn set_secret(&self, secret: &str) -> AppResult<()>;
}

pub struct SystemBackupKeyStore {
    service: String,
}

impl SystemBackupKeyStore {
    pub fn new(app: &AppHandle) -> Self {
        Self {
            service: app.config().identifier.clone(),
        }
    }

    fn entry(&self) -> AppResult<Entry> {
        let _ = keyring::use_native_store(false);
        Entry::new(&self.service, BACKUP_KEY_ACCOUNT)
            .map_err(|error| AppError::Backup(format!("本地密钥存储不可用：{error}")))
    }
}

impl BackupKeyStore for SystemBackupKeyStore {
    fn get_secret(&self) -> AppResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(AppError::Backup(format!("读取本地备份密钥失败：{error}"))),
        }
    }

    fn set_secret(&self, secret: &str) -> AppResult<()> {
        self.entry()?
            .set_password(secret)
            .map_err(|error| AppError::Backup(format!("保存本地备份密钥失败：{error}")))
    }
}

pub fn backup_key_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    backup_key_metadata_status(app)
}

pub fn verified_backup_key_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    backup_key_status_with_store(app, &SystemBackupKeyStore::new(app))
}

pub fn set_backup_secret(app: &AppHandle, secret: &str) -> AppResult<BackupKeyStatus> {
    set_backup_secret_with_store(app, &SystemBackupKeyStore::new(app), secret)
}

pub fn current_backup_secret(app: &AppHandle) -> AppResult<String> {
    let store = SystemBackupKeyStore::new(app);
    store
        .get_secret()?
        .ok_or_else(|| AppError::Backup("请先设置备份加密密钥".to_string()))
}

pub fn current_key_fingerprint(app: &AppHandle) -> AppResult<String> {
    let metadata = load_metadata(app)?
        .ok_or_else(|| AppError::Backup("请先设置备份加密密钥".to_string()))?;
    Ok(metadata.fingerprint)
}

pub fn backup_key_metadata_status(app: &AppHandle) -> AppResult<BackupKeyStatus> {
    let metadata = load_metadata(app)?;
    // 启动阶段只读 SQLite 元数据，避免 macOS 因访问钥匙串在每次打开应用时弹出授权窗口。
    Ok(BackupKeyStatus {
        configured: metadata.is_some(),
        needs_key: false,
        fingerprint: metadata.as_ref().map(|value| value.fingerprint.clone()),
        created_at: metadata.map(|value| value.created_at),
    })
}

pub fn backup_key_status_with_store(
    app: &AppHandle,
    store: &impl BackupKeyStore,
) -> AppResult<BackupKeyStatus> {
    let metadata = load_metadata(app)?;
    let secret_present = store.get_secret()?.is_some();
    Ok(BackupKeyStatus {
        configured: metadata.is_some() && secret_present,
        needs_key: metadata.is_some() && !secret_present,
        fingerprint: metadata.as_ref().map(|value| value.fingerprint.clone()),
        created_at: metadata.map(|value| value.created_at),
    })
}

pub fn set_backup_secret_with_store(
    app: &AppHandle,
    store: &impl BackupKeyStore,
    secret: &str,
) -> AppResult<BackupKeyStatus> {
    validate_backup_secret(secret)?;
    store.set_secret(secret)?;
    let metadata = BackupKeyMetadata {
        fingerprint: backup_key_fingerprint(secret),
        created_at: Utc::now().to_rfc3339(),
    };
    save_backup_key_metadata(app, &serde_json::to_string(&metadata)?)?;
    backup_key_status_with_store(app, store)
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
    // fingerprint 只用于判断“当前本地密钥是否可能匹配备份”，不保存密钥明文。
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

#[cfg(test)]
#[derive(Default)]
pub struct MemoryBackupKeyStore {
    secret: std::sync::Mutex<Option<String>>,
}

#[cfg(test)]
impl BackupKeyStore for MemoryBackupKeyStore {
    fn get_secret(&self) -> AppResult<Option<String>> {
        Ok(self.secret.lock().unwrap().clone())
    }

    fn set_secret(&self, secret: &str) -> AppResult<()> {
        *self.secret.lock().unwrap() = Some(secret.to_string());
        Ok(())
    }
}
