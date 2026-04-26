use std::fs;
use std::path::{Component, Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{WorkspaceDocument, WorkspacePayload};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceConfig {
    recent_workspace: String,
}

#[tauri::command]
pub fn get_recent_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<WorkspacePayload>> {
    let Some(config) = read_workspace_config(&app)? else {
        return Ok(None);
    };
    let root = normalize_workspace_root(&config.recent_workspace)?;
    state.set_workspace_root(root.clone());
    Ok(Some(workspace_payload(&root)?))
}

#[tauri::command]
pub fn set_workspace_root(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = normalize_workspace_root(&path)?;
    write_workspace_config(&app, &root)?;
    state.set_workspace_root(root.clone());
    workspace_payload(&root)
}

#[tauri::command]
pub fn list_lake_documents(state: State<'_, AppState>) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    workspace_payload(&root)
}

pub fn normalize_workspace_root(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    let root = path.as_ref().canonicalize()?;
    if !root.is_dir() {
        return Err(AppError::MissingWorkspace);
    }
    Ok(root)
}

pub fn workspace_payload(root: &Path) -> AppResult<WorkspacePayload> {
    Ok(WorkspacePayload {
        root: root.to_string_lossy().to_string(),
        documents: list_documents(root)?,
    })
}

pub fn list_documents(root: &Path) -> AppResult<Vec<WorkspaceDocument>> {
    let root = root.canonicalize()?;
    let mut documents = Vec::new();

    for entry in WalkDir::new(&root).into_iter().filter_entry(|entry| {
        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    }) {
        let entry = entry.map_err(|error| AppError::Io(error.into()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("lake") {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| AppError::PathOutsideWorkspace)?;
        let relative_path = normalize_relative_path(relative);
        let metadata = entry.metadata()?;
        let modified_at = metadata
            .modified()
            .ok()
            .map(DateTime::<Utc>::from)
            .map(|time| time.to_rfc3339());
        let name = entry
            .path()
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let parent_path = relative
            .parent()
            .map(normalize_relative_path)
            .unwrap_or_default();

        documents.push(WorkspaceDocument {
            id: relative_path.clone(),
            path: relative_path,
            name,
            parent_path,
            modified_at,
            size: metadata.len(),
        });
    }

    documents.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(documents)
}

pub fn resolve_existing_lake_path(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    validate_relative_lake_path(relative_path)?;
    let root = root.canonicalize()?;
    let full_path = root.join(relative_path).canonicalize()?;
    if !full_path.starts_with(&root) {
        return Err(AppError::PathOutsideWorkspace);
    }
    Ok(full_path)
}

pub fn resolve_writable_lake_path(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    validate_relative_lake_path(relative_path)?;
    let root = root.canonicalize()?;
    let full_path = root.join(relative_path);
    let parent = full_path.parent().ok_or(AppError::InvalidLakePath)?;
    let parent = parent.canonicalize()?;
    if !parent.starts_with(&root) {
        return Err(AppError::PathOutsideWorkspace);
    }
    Ok(full_path)
}

fn validate_relative_lake_path(relative_path: &str) -> AppResult<()> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(AppError::PathOutsideWorkspace);
    }
    if path.extension().and_then(|ext| ext.to_str()) != Some("lake") {
        return Err(AppError::InvalidLakePath);
    }
    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err(AppError::PathOutsideWorkspace);
        }
    }
    Ok(())
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn workspace_config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("workspace.json"))
}

fn read_workspace_config(app: &AppHandle) -> AppResult<Option<WorkspaceConfig>> {
    let path = workspace_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

fn write_workspace_config(app: &AppHandle, root: &Path) -> AppResult<()> {
    let path = workspace_config_path(app)?;
    let config = WorkspaceConfig {
        recent_workspace: root.to_string_lossy().to_string(),
    };
    fs::write(path, serde_json::to_string_pretty(&config)?)?;
    Ok(())
}
