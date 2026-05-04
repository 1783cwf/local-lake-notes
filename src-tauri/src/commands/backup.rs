use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use tauri::AppHandle;
use uuid::Uuid;

use crate::commands::settings::{load_oss_settings, validate_oss_settings};
use crate::error::{AppError, AppResult};
use crate::models::{
    BackupKeyStatus, BackupOperationOutput, BackupRecord, CreateBackupInput, DeleteBackupInput,
    DeleteBackupOutput, ResetBackupKeyInput, RestoreBackupInput, RestoreBackupOutput,
    SetBackupKeyInput,
};
use crate::storage::app_database::{
    clear_backup_last_manifest, database_path, list_known_workspaces, load_backup_device_id,
    load_backup_last_manifest, save_backup_device_id, save_backup_last_manifest, snapshot_database,
};
use crate::storage::backup_archive::{build_encrypted_archive, extract_encrypted_archive};
use crate::storage::backup_key::{
    backup_key_status, current_backup_secret, current_key_fingerprint, set_backup_secret,
    verified_backup_key_status,
};
use crate::storage::backup_manifest::{
    build_full_manifest, build_incremental_manifest, file_hash, parse_manifest, BackupManifest,
    DATABASE_LOGICAL_PATH,
};
use crate::storage::backup_store::{
    delete_backup_indexes, download_backup_archive, list_backup_indexes, upload_backup, BackupIndex,
};

#[tauri::command]
pub fn get_backup_key_status(app: AppHandle) -> AppResult<BackupKeyStatus> {
    backup_key_status(&app)
}

#[tauri::command]
pub fn verify_backup_key_status(app: AppHandle) -> AppResult<BackupKeyStatus> {
    verified_backup_key_status(&app)
}

#[tauri::command]
pub fn set_backup_key(app: AppHandle, input: SetBackupKeyInput) -> AppResult<BackupKeyStatus> {
    set_backup_secret(&app, &input.secret)
}

#[tauri::command]
pub fn reset_backup_key(app: AppHandle, input: ResetBackupKeyInput) -> AppResult<BackupKeyStatus> {
    if !input.confirm_reset {
        return Err(AppError::Backup("重置备份密钥需要二次确认".to_string()));
    }
    set_backup_secret(&app, &input.secret)
}

#[tauri::command]
pub async fn list_backups(app: AppHandle) -> AppResult<Vec<BackupRecord>> {
    let settings = load_valid_oss_settings(&app)?;
    let device_id = backup_device_id(&app)?;
    let current_fingerprint = current_key_fingerprint(&app).ok();
    Ok(list_backup_indexes(&settings, &device_id)
        .await?
        .into_iter()
        .map(|index| index.to_record(current_fingerprint.as_deref()))
        .collect())
}

#[tauri::command]
pub async fn create_backup(
    app: AppHandle,
    input: CreateBackupInput,
) -> AppResult<BackupOperationOutput> {
    let settings = load_valid_oss_settings(&app)?;
    let secret = current_backup_secret(&app)?;
    let key_fingerprint = current_key_fingerprint(&app)?;
    let device_id = backup_device_id(&app)?;
    let temp_dir = tempfile::tempdir()?;
    let database_snapshot = temp_dir.path().join("database.sqlite3");
    snapshot_database(&app, &database_snapshot)?;

    let previous_manifest = load_backup_last_manifest(&app)?
        .map(|content| parse_manifest(&content))
        .transpose()?;
    let backup_id = Uuid::new_v4().to_string();
    let created_at = Utc::now();
    let known_workspaces = list_known_workspaces(&app)?;
    let app_version = app.package_info().version.to_string();
    let use_full = input.force_full || previous_manifest.is_none();
    let (manifest, files) = if use_full {
        build_full_manifest(
            &app_version,
            backup_id,
            created_at,
            key_fingerprint.clone(),
            &database_snapshot,
            &known_workspaces,
        )?
    } else {
        let previous = previous_manifest.as_ref().expect("checked above");
        build_incremental_manifest(
            &app_version,
            backup_id,
            previous.backup_id.clone(),
            created_at,
            key_fingerprint.clone(),
            &database_snapshot,
            &known_workspaces,
            previous,
        )?
    };

    let encrypted_bytes = build_encrypted_archive(&manifest, &files, &secret)?;
    let index = upload_backup(
        &settings,
        &device_id,
        manifest.backup_id.clone(),
        encrypted_bytes,
        manifest.backup_type.clone(),
        manifest.base_backup_id.clone(),
        key_fingerprint,
    )
    .await?;
    save_backup_last_manifest(&app, &serde_json::to_string(&manifest)?)?;

    Ok(BackupOperationOutput {
        record: index.to_record(Some(&manifest.key_fingerprint)),
        warnings: manifest.warnings,
    })
}

#[tauri::command]
pub async fn restore_backup(
    app: AppHandle,
    input: RestoreBackupInput,
) -> AppResult<RestoreBackupOutput> {
    let settings = load_valid_oss_settings(&app)?;
    let secret = current_backup_secret(&app)?;
    let key_fingerprint = current_key_fingerprint(&app)?;
    let device_id = backup_device_id(&app)?;
    let indexes = list_backup_indexes(&settings, &device_id).await?;
    let chain = backup_chain(&indexes, &input.backup_id)?;
    let mut extracted_chain = Vec::new();
    for index in &chain {
        if index.key_fingerprint != key_fingerprint && !input.allow_key_mismatch {
            return Err(AppError::Backup(format!(
                "备份 {} 使用的密钥 fingerprint 与当前本地密钥不一致",
                index.id
            )));
        }
        let bytes = download_backup_archive(&settings, index).await?;
        let extracted = extract_encrypted_archive(&bytes, &secret)?;
        if extracted.manifest.backup_id != index.id {
            return Err(AppError::Backup(format!(
                "备份索引与包内容不一致：{}",
                index.id
            )));
        }
        extracted_chain.push(extracted);
    }

    let stage = tempfile::tempdir()?;
    let latest_manifest = stage_restore_chain(&extracted_chain, stage.path())?;
    apply_staged_restore(&app, stage.path())?;
    save_backup_last_manifest(&app, &serde_json::to_string(&latest_manifest)?)?;

    Ok(RestoreBackupOutput {
        restored_backup_id: input.backup_id,
        restored_at: Utc::now().to_rfc3339(),
        // SQLite 文件已被替换，前端需要重新 boot；桌面端重启最稳妥。
        requires_restart: true,
        warnings: latest_manifest.warnings,
    })
}

#[tauri::command]
pub async fn delete_backup(
    app: AppHandle,
    input: DeleteBackupInput,
) -> AppResult<DeleteBackupOutput> {
    let settings = load_valid_oss_settings(&app)?;
    let device_id = backup_device_id(&app)?;
    let indexes = list_backup_indexes(&settings, &device_id).await?;
    let indexes_to_delete = backups_to_delete(&indexes, &input.backup_id)?;
    let deleted_backup_ids = indexes_to_delete
        .iter()
        .map(|index| index.id.clone())
        .collect::<Vec<_>>();
    delete_backup_indexes(&settings, &device_id, &indexes_to_delete).await?;

    if load_backup_last_manifest(&app)?
        .and_then(|content| parse_manifest(&content).ok())
        .map(|manifest| deleted_backup_ids.contains(&manifest.backup_id))
        .unwrap_or(false)
    {
        // 最新基线被删除后无法安全增量，清空本地基线，让下一次备份自动回退为全量。
        clear_backup_last_manifest(&app)?;
    }

    Ok(DeleteBackupOutput { deleted_backup_ids })
}

fn load_valid_oss_settings(app: &AppHandle) -> AppResult<crate::models::OssSettings> {
    let settings = load_oss_settings(app)?
        .ok_or_else(|| AppError::InvalidOssSettings("请先配置 OSS 上传信息".to_string()))?;
    validate_oss_settings(&settings)?;
    Ok(settings)
}

fn backups_to_delete(indexes: &[BackupIndex], backup_id: &str) -> AppResult<Vec<BackupIndex>> {
    if !indexes.iter().any(|index| index.id == backup_id) {
        return Err(AppError::Backup(format!("找不到备份：{backup_id}")));
    }

    let mut pending = vec![backup_id.to_string()];
    let mut deleted_ids = Vec::new();
    while let Some(current_id) = pending.pop() {
        if deleted_ids.contains(&current_id) {
            continue;
        }
        deleted_ids.push(current_id.clone());
        for child in indexes
            .iter()
            .filter(|index| index.base_backup_id.as_deref() == Some(current_id.as_str()))
        {
            pending.push(child.id.clone());
        }
    }

    Ok(indexes
        .iter()
        .filter(|index| deleted_ids.contains(&index.id))
        .cloned()
        .collect())
}

fn backup_device_id(app: &AppHandle) -> AppResult<String> {
    if let Some(device_id) = load_backup_device_id(app)? {
        return Ok(device_id);
    }
    let device_id = Uuid::new_v4().to_string();
    save_backup_device_id(app, &device_id)?;
    Ok(device_id)
}

fn backup_chain(indexes: &[BackupIndex], backup_id: &str) -> AppResult<Vec<BackupIndex>> {
    let by_id = indexes
        .iter()
        .cloned()
        .map(|index| (index.id.clone(), index))
        .collect::<HashMap<_, _>>();
    let mut cursor = by_id
        .get(backup_id)
        .cloned()
        .ok_or_else(|| AppError::Backup(format!("找不到备份：{backup_id}")))?;
    let mut reversed = Vec::new();
    loop {
        let next_base = cursor.base_backup_id.clone();
        reversed.push(cursor);
        let Some(base_id) = next_base else {
            break;
        };
        cursor = by_id
            .get(&base_id)
            .cloned()
            .ok_or_else(|| AppError::Backup(format!("备份链缺失基础备份：{base_id}")))?;
    }
    reversed.reverse();
    if reversed.first().map(|index| index.backup_type.as_str()) != Some("full") {
        return Err(AppError::Backup("备份链缺少全量备份".to_string()));
    }
    Ok(reversed)
}

pub fn stage_restore_chain(
    extracted_chain: &[crate::storage::backup_archive::ExtractedBackup],
    stage: &Path,
) -> AppResult<BackupManifest> {
    let database_stage = stage.join(DATABASE_LOGICAL_PATH);
    let workspace_stage = stage.join("workspaces");
    for extracted in extracted_chain {
        let manifest = &extracted.manifest;
        for tombstone in &manifest.tombstones {
            remove_stage_path(stage, tombstone)?;
        }
        for file in &manifest.files {
            let source = extracted.root.join(&file.logical_path);
            if !source.exists() {
                // 增量备份的 manifest 表示“恢复到该版本后的完整状态”，但包里只包含变化文件。
                // 链式恢复时，未变化文件应沿用前序 full/incremental 已 staged 的内容。
                continue;
            }
            let target = stage.join(&file.logical_path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, target)?;
        }
    }

    if !database_stage.exists() {
        return Err(AppError::Backup("恢复包缺少 SQLite 数据库".to_string()));
    }
    if !workspace_stage.exists() {
        return Err(AppError::Backup("恢复包缺少知识库文件".to_string()));
    }

    let latest_manifest = extracted_chain
        .last()
        .map(|backup| backup.manifest.clone())
        .ok_or_else(|| AppError::Backup("备份链为空".to_string()))?;
    fs::write(
        stage.join("manifest.json"),
        serde_json::to_vec_pretty(&latest_manifest)?,
    )?;
    verify_staged_manifest(stage, &latest_manifest)?;

    Ok(latest_manifest)
}

fn verify_staged_manifest(stage: &Path, manifest: &BackupManifest) -> AppResult<()> {
    for file in &manifest.files {
        let staged_file = stage.join(&file.logical_path);
        if !staged_file.exists() {
            return Err(AppError::Backup(format!(
                "恢复链缺少文件：{}",
                file.logical_path
            )));
        }
        let actual_hash = file_hash(&staged_file)?;
        if actual_hash != file.hash {
            return Err(AppError::Backup(format!(
                "恢复链文件校验失败：{}",
                file.logical_path
            )));
        }
    }
    Ok(())
}

fn apply_staged_restore(app: &AppHandle, stage: &Path) -> AppResult<()> {
    let database_source = stage.join(DATABASE_LOGICAL_PATH);
    let target_database = database_path(app)?;
    validate_sqlite_snapshot(&database_source)?;
    if let Some(parent) = target_database.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&database_source, &target_database)?;

    let manifest = serde_json::from_str::<BackupManifest>(
        &fs::read_to_string(stage.join("manifest.json")).unwrap_or_default(),
    )
    .ok();
    let workspace_roots = manifest
        .map(|manifest| {
            manifest
                .workspaces
                .into_iter()
                .map(|workspace| (workspace.id, PathBuf::from(workspace.root)))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    for (workspace_id, root) in workspace_roots {
        let source = stage.join("workspaces").join(&workspace_id);
        if !source.exists() {
            continue;
        }
        restore_directory_contents(&source, &root)?;
    }

    Ok(())
}

fn restore_directory_contents(source: &Path, target: &Path) -> AppResult<()> {
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    fs::create_dir_all(target)?;
    copy_directory_contents(source, target)
}

fn copy_directory_contents(source: &Path, target: &Path) -> AppResult<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir_all(&target_path)?;
            copy_directory_contents(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn remove_stage_path(stage: &Path, logical_path: &str) -> AppResult<()> {
    let path = stage.join(logical_path);
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn validate_sqlite_snapshot(path: &Path) -> AppResult<()> {
    let connection = rusqlite::Connection::open(path)?;
    connection.execute_batch(
        "
        SELECT name FROM sqlite_master WHERE type = 'table';
        ",
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_backup_includes_dependent_incrementals_only() {
        let indexes = vec![
            backup_index("latest-full", None),
            backup_index("old-inc-2", Some("old-inc-1")),
            backup_index("old-inc-1", Some("old-full")),
            backup_index("old-full", None),
        ];

        let ids = backups_to_delete(&indexes, "old-inc-1")
            .unwrap()
            .into_iter()
            .map(|index| index.id)
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["old-inc-2", "old-inc-1"]);
    }

    fn backup_index(id: &str, base_backup_id: Option<&str>) -> BackupIndex {
        BackupIndex {
            id: id.to_string(),
            backup_type: if base_backup_id.is_some() {
                "incremental".to_string()
            } else {
                "full".to_string()
            },
            created_at: "2026-05-04T00:00:00Z".to_string(),
            base_backup_id: base_backup_id.map(ToString::to_string),
            key_fingerprint: "fingerprint".to_string(),
            encrypted_size: 1,
            archive_hash: "hash".to_string(),
            object_key: format!("{id}.ylbackup"),
        }
    }
}
