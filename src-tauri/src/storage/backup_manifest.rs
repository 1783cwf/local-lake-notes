use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::KnownWorkspace;

pub const BACKUP_SCHEMA_VERSION: u32 = 1;
pub const DATABASE_LOGICAL_PATH: &str = "database/yuque-lake-notes.sqlite3";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub schema_version: u32,
    pub app_version: String,
    pub backup_id: String,
    pub backup_type: String,
    pub base_backup_id: Option<String>,
    pub created_at: String,
    pub key_fingerprint: String,
    pub database: BackupFileEntry,
    pub workspaces: Vec<BackupWorkspace>,
    pub files: Vec<BackupFileEntry>,
    pub tombstones: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupWorkspace {
    pub id: String,
    pub root: String,
    pub name: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub logical_path: String,
    pub hash: String,
    pub size: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FileSnapshot {
    pub entry: BackupFileEntry,
    pub source_path: PathBuf,
}

pub fn build_full_manifest(
    app_version: &str,
    backup_id: String,
    created_at: DateTime<Utc>,
    key_fingerprint: String,
    database_snapshot: &Path,
    workspaces: &[KnownWorkspace],
) -> AppResult<(BackupManifest, Vec<FileSnapshot>)> {
    build_manifest(
        app_version,
        backup_id,
        "full".to_string(),
        None,
        created_at,
        key_fingerprint,
        database_snapshot,
        workspaces,
        None,
    )
}

pub fn build_incremental_manifest(
    app_version: &str,
    backup_id: String,
    base_backup_id: String,
    created_at: DateTime<Utc>,
    key_fingerprint: String,
    database_snapshot: &Path,
    workspaces: &[KnownWorkspace],
    previous_manifest: &BackupManifest,
) -> AppResult<(BackupManifest, Vec<FileSnapshot>)> {
    build_manifest(
        app_version,
        backup_id,
        "incremental".to_string(),
        Some(base_backup_id),
        created_at,
        key_fingerprint,
        database_snapshot,
        workspaces,
        Some(previous_manifest),
    )
}

pub fn parse_manifest(content: &str) -> AppResult<BackupManifest> {
    serde_json::from_str(content).map_err(Into::into)
}

pub fn manifest_file_map(manifest: &BackupManifest) -> BTreeMap<String, BackupFileEntry> {
    manifest
        .files
        .iter()
        .cloned()
        .map(|entry| (entry.logical_path.clone(), entry))
        .collect()
}

fn build_manifest(
    app_version: &str,
    backup_id: String,
    backup_type: String,
    base_backup_id: Option<String>,
    created_at: DateTime<Utc>,
    key_fingerprint: String,
    database_snapshot: &Path,
    workspaces: &[KnownWorkspace],
    previous_manifest: Option<&BackupManifest>,
) -> AppResult<(BackupManifest, Vec<FileSnapshot>)> {
    let mut warnings = Vec::new();
    let database_snapshot = snapshot_file(DATABASE_LOGICAL_PATH.to_string(), database_snapshot)?;
    let mut snapshots = vec![database_snapshot.clone()];
    let mut workspace_roots = Vec::new();

    for (index, workspace) in workspaces.iter().enumerate() {
        let root = PathBuf::from(&workspace.root);
        if !root.exists() || !root.is_dir() {
            warnings.push(format!("知识库不可读，已跳过：{}", workspace.root));
            continue;
        }
        let id = format!("workspace-{index}");
        workspace_roots.push(BackupWorkspace {
            id: id.clone(),
            root: workspace.root.clone(),
            name: workspace.name.clone(),
            last_opened_at: workspace.last_opened_at.clone(),
        });
        snapshots.extend(scan_workspace_files(&id, &root, &mut warnings)?);
    }

    if workspace_roots.is_empty() {
        return Err(AppError::Backup("没有可备份的已知知识库目录".to_string()));
    }

    let previous = previous_manifest.map(manifest_file_map).unwrap_or_default();
    let current: BTreeMap<String, BackupFileEntry> = snapshots
        .iter()
        .map(|snapshot| (snapshot.entry.logical_path.clone(), snapshot.entry.clone()))
        .collect();
    let previous_paths = previous.keys().cloned().collect::<BTreeSet<_>>();
    let current_paths = current.keys().cloned().collect::<BTreeSet<_>>();
    let tombstones = previous_paths
        .difference(&current_paths)
        .cloned()
        .collect::<Vec<_>>();

    let files = if previous_manifest.is_some() && backup_type == "incremental" {
        snapshots
            .into_iter()
            .filter(|snapshot| {
                previous
                    .get(&snapshot.entry.logical_path)
                    .map(|entry| entry.hash != snapshot.entry.hash)
                    .unwrap_or(true)
            })
            .collect::<Vec<_>>()
    } else {
        snapshots
    };
    let complete_files = current.values().cloned().collect::<Vec<_>>();
    let database = current
        .get(DATABASE_LOGICAL_PATH)
        .cloned()
        .ok_or_else(|| AppError::Backup("数据库快照缺失".to_string()))?;
    let manifest = BackupManifest {
        schema_version: BACKUP_SCHEMA_VERSION,
        app_version: app_version.to_string(),
        backup_id,
        backup_type,
        base_backup_id,
        created_at: created_at.to_rfc3339(),
        key_fingerprint,
        database,
        workspaces: workspace_roots,
        files: complete_files,
        tombstones,
        warnings,
    };
    Ok((manifest, files))
}

fn scan_workspace_files(
    workspace_id: &str,
    root: &Path,
    warnings: &mut Vec<String>,
) -> AppResult<Vec<FileSnapshot>> {
    let mut snapshots = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_entry(|entry| {
        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    }) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!("跳过无法访问的文件：{error}"));
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        if is_excel_temporary_file(entry.path()) {
            continue;
        }
        let relative_path = match entry.path().strip_prefix(root) {
            Ok(path) => normalize_archive_path(path)?,
            Err(_) => return Err(AppError::PathOutsideWorkspace),
        };
        snapshots.push(snapshot_file(
            format!("workspaces/{workspace_id}/{relative_path}"),
            entry.path(),
        )?);
    }
    Ok(snapshots)
}

fn is_excel_temporary_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with("~$") && name.ends_with(".xlsx"))
        .unwrap_or(false)
}

pub fn snapshot_file(logical_path: String, source_path: &Path) -> AppResult<FileSnapshot> {
    Ok(FileSnapshot {
        entry: BackupFileEntry {
            logical_path,
            hash: file_hash(source_path)?,
            size: source_path.metadata()?.len(),
            modified_at: source_path
                .metadata()?
                .modified()
                .ok()
                .map(system_time_to_rfc3339),
        },
        source_path: source_path.to_path_buf(),
    })
}

pub fn file_hash(path: &Path) -> AppResult<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub fn normalize_archive_path(path: &Path) -> AppResult<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => {
                return Err(AppError::Backup(
                    "备份归档路径不能包含上级目录或绝对路径".to_string(),
                ));
            }
        }
    }
    if parts.is_empty() {
        return Err(AppError::Backup("备份归档路径不能为空".to_string()));
    }
    Ok(parts.join("/"))
}

fn system_time_to_rfc3339(time: SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}
