use std::fs;
use std::path::{Component, Path, PathBuf};

use chrono::{DateTime, Utc};
use tauri::{AppHandle, State};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{
    MoveWorkspaceItemInput, WorkspaceDirectory, WorkspaceDocument, WorkspacePayload,
};
use crate::state::AppState;
use crate::storage::app_database::{
    load_recent_workspace_root, move_workspace_order, prune_workspace_order_path,
    push_workspace_order_item, read_workspace_order, rewrite_workspace_order_items,
    rewrite_workspace_order_path, save_recent_workspace_root, set_workspace_order,
};

#[tauri::command]
pub fn get_recent_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<WorkspacePayload>> {
    let Some(recent_workspace) = load_recent_workspace_root(&app)? else {
        return Ok(None);
    };
    let root = normalize_workspace_root(&recent_workspace)?;
    state.set_workspace_root(root.clone());
    Ok(Some(workspace_payload_for_app(&app, &root)?))
}

#[tauri::command]
pub fn set_workspace_root(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = normalize_workspace_root(&path)?;
    save_recent_workspace_root(&app, &root)?;
    state.set_workspace_root(root.clone());
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn list_lake_documents(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn rename_workspace(
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let parent = root.parent().ok_or(AppError::InvalidFilename)?;
    let target = parent.join(safe_directory_name(&name)?);
    if target.exists() {
        return Err(AppError::InvalidFilename);
    }

    fs::rename(&root, &target)?;
    let new_root = target.canonicalize()?;
    move_workspace_order(&app, &root, &new_root)?;
    save_recent_workspace_root(&app, &new_root)?;
    state.set_workspace_root(new_root.clone());
    workspace_payload_for_app(&app, &new_root)
}

#[tauri::command]
pub fn create_lake_directory(
    parent_path: String,
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let parent = resolve_existing_directory_path(&root, &parent_path)?;
    let directory_name = safe_directory_name(&name)?;
    let target = parent.join(&directory_name);
    if target.exists() {
        return Err(AppError::InvalidFilename);
    }
    fs::create_dir_all(target)?;
    push_workspace_order_item(
        &app,
        &root,
        format!(
            "folder:{}",
            child_relative_path(&parent_path, &directory_name)
        ),
    )?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn rename_lake_directory(
    relative_path: String,
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    if relative_path.trim().is_empty() {
        return Err(AppError::InvalidFilename);
    }
    let current_path = resolve_existing_directory_path(&root, &relative_path)?;
    let parent = current_path.parent().ok_or(AppError::InvalidFilename)?;
    let directory_name = safe_directory_name(&name)?;
    let target = parent.join(&directory_name);
    if target.exists() {
        return Err(AppError::InvalidFilename);
    }

    fs::rename(current_path, target)?;
    rewrite_workspace_order_path(
        &app,
        &root,
        &relative_path,
        &replace_directory_name(&relative_path, &directory_name),
    )?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn delete_lake_directory(
    relative_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    if relative_path.trim().is_empty() {
        return Err(AppError::InvalidFilename);
    }
    let target = resolve_existing_directory_path(&root, &relative_path)?;
    fs::remove_dir_all(target)?;
    prune_workspace_order_path(&app, &root, &relative_path)?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn save_workspace_order(
    order: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    set_workspace_order(&app, &root, &order)?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn move_workspace_item(
    input: MoveWorkspaceItemInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let moved_item = move_workspace_item_on_disk(&root, &input)?;
    let order = rewrite_workspace_order_items(
        &input.order,
        &moved_item.source_path,
        &moved_item.target_path,
    );

    if let Err(error) = set_workspace_order(&app, &root, &order) {
        if moved_item.source_path != moved_item.target_path {
            let _ = fs::rename(
                root.join(&moved_item.target_path),
                root.join(&moved_item.source_path),
            );
        }
        return Err(error);
    }

    workspace_payload_for_app(&app, &root)
}

#[derive(Debug, PartialEq, Eq)]
pub struct WorkspaceItemMove {
    pub source_path: String,
    pub target_path: String,
}

pub fn move_workspace_item_on_disk(
    root: &Path,
    input: &MoveWorkspaceItemInput,
) -> AppResult<WorkspaceItemMove> {
    let (kind, source_path) = parse_workspace_item_id(&input.source_id)?;
    let target_parent_path = input.target_parent_path.trim_matches('/').to_string();
    if kind == WorkspaceItemKind::Folder && is_same_or_child_path(&target_parent_path, &source_path)
    {
        return Err(AppError::InvalidWorkspaceMove(
            "不能把目录移动到自身或子目录内".to_string(),
        ));
    }

    let current_path = match kind {
        WorkspaceItemKind::Document => resolve_existing_lake_path(root, &source_path),
        WorkspaceItemKind::Folder => resolve_existing_directory_path(root, &source_path),
    }
    .map_err(|_| AppError::WorkspaceItemNotFound(input.source_id.clone()))?;
    let target_parent = resolve_existing_directory_path(root, &target_parent_path)?;
    let source_name = Path::new(&source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(AppError::InvalidFilename)?;
    let target_path = child_relative_path(&target_parent_path, source_name);

    if target_path != source_path {
        let full_target_path = target_parent.join(source_name);
        if full_target_path.exists() {
            return Err(AppError::WorkspaceItemConflict(target_path));
        }
        fs::rename(current_path, full_target_path)?;
    }

    Ok(WorkspaceItemMove {
        source_path,
        target_path,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkspaceItemKind {
    Folder,
    Document,
}

fn parse_workspace_item_id(item_id: &str) -> AppResult<(WorkspaceItemKind, String)> {
    let Some((kind, path)) = item_id.split_once(':') else {
        return Err(AppError::InvalidWorkspaceMove("缺少移动源类型".to_string()));
    };
    if path.trim().is_empty() {
        return Err(AppError::InvalidWorkspaceMove("缺少移动源路径".to_string()));
    }

    match kind {
        "folder" => Ok((WorkspaceItemKind::Folder, path.to_string())),
        "document" => Ok((WorkspaceItemKind::Document, path.to_string())),
        _ => Err(AppError::InvalidWorkspaceMove("未知移动源类型".to_string())),
    }
}

pub fn normalize_workspace_root(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    let root = path.as_ref().canonicalize()?;
    if !root.is_dir() {
        return Err(AppError::MissingWorkspace);
    }
    Ok(root)
}

pub fn workspace_payload(root: &Path) -> AppResult<WorkspacePayload> {
    workspace_payload_with_order(root, Vec::new())
}

pub fn workspace_payload_for_app(app: &AppHandle, root: &Path) -> AppResult<WorkspacePayload> {
    workspace_payload_with_order(root, read_workspace_order(app, root)?)
}

fn workspace_payload_with_order(root: &Path, order: Vec<String>) -> AppResult<WorkspacePayload> {
    Ok(WorkspacePayload {
        root: root.to_string_lossy().to_string(),
        directories: list_directories(root)?,
        documents: list_documents(root)?,
        order,
    })
}

pub fn list_directories(root: &Path) -> AppResult<Vec<WorkspaceDirectory>> {
    let root = root.canonicalize()?;
    let mut directories = Vec::new();

    for entry in WalkDir::new(&root).into_iter().filter_entry(|entry| {
        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
    }) {
        let entry = entry.map_err(|error| AppError::Io(error.into()))?;
        if !entry.file_type().is_dir() || entry.depth() == 0 {
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
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();
        let parent_path = relative
            .parent()
            .map(normalize_relative_path)
            .unwrap_or_default();

        directories.push(WorkspaceDirectory {
            id: relative_path.clone(),
            path: relative_path,
            name,
            parent_path,
            modified_at,
        });
    }

    directories.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(directories)
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

pub fn resolve_existing_directory_path(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let root = root.canonicalize()?;
    if relative_path.trim().is_empty() {
        return Ok(root);
    }

    validate_relative_directory_path(relative_path)?;
    let full_path = root.join(relative_path).canonicalize()?;
    if !full_path.starts_with(&root) || !full_path.is_dir() {
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
        if matches!(
            component,
            Component::CurDir | Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(AppError::PathOutsideWorkspace);
        }
    }
    Ok(())
}

fn validate_relative_directory_path(relative_path: &str) -> AppResult<()> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(AppError::PathOutsideWorkspace);
    }
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                if value.to_string_lossy().starts_with('.') {
                    return Err(AppError::PathOutsideWorkspace);
                }
            }
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err(AppError::PathOutsideWorkspace);
            }
        }
    }
    Ok(())
}

pub fn safe_directory_name(name: &str) -> AppResult<String> {
    let mut output = String::new();
    let mut last_was_dash = false;

    for character in name.trim().chars() {
        let invalid = character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            );
        if invalid || character.is_whitespace() {
            if !last_was_dash && !output.is_empty() {
                output.push('-');
                last_was_dash = true;
            }
            continue;
        }

        output.push(character);
        last_was_dash = false;
        if output.chars().count() >= 80 {
            break;
        }
    }

    let output = output.trim_matches('-').to_string();
    if output.is_empty() || output.starts_with('.') {
        Err(AppError::InvalidFilename)
    } else {
        Ok(output)
    }
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

fn child_relative_path(parent_path: &str, child_name: &str) -> String {
    let parent_path = parent_path.trim_matches('/');
    if parent_path.is_empty() {
        child_name.to_string()
    } else {
        format!("{parent_path}/{child_name}")
    }
}

fn replace_directory_name(relative_path: &str, directory_name: &str) -> String {
    relative_path
        .rsplit_once('/')
        .map(|(parent, _)| format!("{parent}/{directory_name}"))
        .unwrap_or_else(|| directory_name.to_string())
}

fn is_same_or_child_path(path: &str, base_path: &str) -> bool {
    path == base_path || path.starts_with(&format!("{base_path}/"))
}
