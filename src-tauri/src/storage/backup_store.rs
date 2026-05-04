use crate::error::{AppError, AppResult};
use crate::models::{BackupRecord, OssSettings};
use crate::storage::s3::{delete_object, get_object_bytes, list_object_keys, put_object};
use chrono::Utc;
use serde::{Deserialize, Serialize};

const BACKUP_CONTENT_TYPE: &str = "application/octet-stream";
const INDEX_CONTENT_TYPE: &str = "application/json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupIndex {
    pub id: String,
    pub backup_type: String,
    pub created_at: String,
    pub base_backup_id: Option<String>,
    pub key_fingerprint: String,
    pub encrypted_size: u64,
    pub archive_hash: String,
    pub object_key: String,
}

impl BackupIndex {
    pub fn to_record(&self, current_key_fingerprint: Option<&str>) -> BackupRecord {
        BackupRecord {
            id: self.id.clone(),
            backup_type: self.backup_type.clone(),
            created_at: self.created_at.clone(),
            base_backup_id: self.base_backup_id.clone(),
            key_fingerprint: self.key_fingerprint.clone(),
            encrypted_size: self.encrypted_size,
            archive_hash: self.archive_hash.clone(),
            object_key: self.object_key.clone(),
            can_restore: current_key_fingerprint
                .map(|fingerprint| fingerprint == self.key_fingerprint)
                .unwrap_or(false),
        }
    }
}

pub async fn upload_backup(
    settings: &OssSettings,
    device_id: &str,
    id: String,
    encrypted_bytes: Vec<u8>,
    backup_type: String,
    base_backup_id: Option<String>,
    key_fingerprint: String,
) -> AppResult<BackupIndex> {
    let object_key = backup_object_key(settings, device_id, &id)?;
    let archive_hash = blake3::hash(&encrypted_bytes).to_hex().to_string();
    let encrypted_size = encrypted_bytes.len() as u64;
    let index = BackupIndex {
        id: id.clone(),
        backup_type,
        created_at: Utc::now().to_rfc3339(),
        base_backup_id,
        key_fingerprint,
        encrypted_size,
        archive_hash,
        object_key: object_key.clone(),
    };

    put_object(settings, &object_key, encrypted_bytes, BACKUP_CONTENT_TYPE).await?;
    put_object(
        settings,
        &backup_index_key(settings, device_id, &id)?,
        serde_json::to_vec_pretty(&index)?,
        INDEX_CONTENT_TYPE,
    )
    .await?;

    Ok(index)
}

pub async fn list_backup_indexes(
    settings: &OssSettings,
    device_id: &str,
) -> AppResult<Vec<BackupIndex>> {
    let prefix = format!("{}/device-{device_id}/index/", backup_prefix(settings)?);
    let keys = list_object_keys(settings, &prefix).await?;
    let mut indexes = Vec::new();
    for key in keys {
        if !key.ends_with(".json") {
            continue;
        }
        let bytes = get_object_bytes(settings, &key).await?;
        let index = serde_json::from_slice::<BackupIndex>(&bytes)?;
        indexes.push(index);
    }
    indexes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(indexes)
}

pub async fn download_backup_archive(
    settings: &OssSettings,
    index: &BackupIndex,
) -> AppResult<Vec<u8>> {
    let bytes = get_object_bytes(settings, &index.object_key).await?;
    let actual_hash = blake3::hash(&bytes).to_hex().to_string();
    if actual_hash != index.archive_hash {
        return Err(AppError::Backup(format!("备份对象校验失败：{}", index.id)));
    }
    Ok(bytes)
}

pub async fn delete_backup_indexes(
    settings: &OssSettings,
    device_id: &str,
    indexes: &[BackupIndex],
) -> AppResult<()> {
    for index in indexes {
        delete_object(settings, &backup_index_key(settings, device_id, &index.id)?).await?;
        delete_object(settings, &index.object_key).await?;
    }
    Ok(())
}

pub fn backup_prefix(settings: &OssSettings) -> AppResult<String> {
    sanitize_prefix(&settings.backup_prefix)
        .ok_or_else(|| AppError::InvalidOssSettings("备份目录".to_string()))
}

fn backup_index_key(settings: &OssSettings, device_id: &str, id: &str) -> AppResult<String> {
    Ok(format!(
        "{}/device-{device_id}/index/{id}.json",
        backup_prefix(settings)?
    ))
}

fn backup_object_key(settings: &OssSettings, device_id: &str, id: &str) -> AppResult<String> {
    Ok(format!(
        "{}/device-{device_id}/objects/{id}.ylbackup",
        backup_prefix(settings)?
    ))
}

fn sanitize_prefix(value: &str) -> Option<String> {
    let cleaned = value
        .split('/')
        .filter_map(|part| {
            let segment = part
                .trim()
                .chars()
                .filter(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '~')
                })
                .collect::<String>();
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
