use std::fs;
use std::path::{Component, Path, PathBuf};

use chrono::{DateTime, Utc};
use tauri::{AppHandle, State};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};
use crate::models::{
    KnownWorkspace, MoveWorkspaceItemInput, WorkspaceDirectory, WorkspaceDocument,
    WorkspaceDocumentKind, WorkspacePayload,
};
use crate::state::AppState;
use crate::storage::app_database::{
    clear_recent_workspace_root, forget_known_workspace,
    list_known_workspaces as load_known_workspaces, load_recent_workspace_root,
    move_workspace_order, prune_workspace_order_path, push_workspace_order_item,
    read_workspace_order, rewrite_workspace_order_items, rewrite_workspace_order_path,
    save_recent_workspace_root, set_workspace_order,
};

pub const DOCUMENT_CHILD_CONTAINER_MARKER: &str = ".yuque-document-children";

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
pub fn create_workspace_root(
    parent_path: String,
    name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = create_workspace_root_at(parent_path, &name)?;
    save_recent_workspace_root(&app, &root)?;
    state.set_workspace_root(root.clone());
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn list_known_workspaces(app: AppHandle) -> AppResult<Vec<KnownWorkspace>> {
    load_known_workspaces(&app)
}

#[tauri::command]
pub fn forget_workspace_root(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<KnownWorkspace>> {
    let raw_root = PathBuf::from(path);
    let root = raw_root.canonicalize().unwrap_or(raw_root);
    forget_known_workspace(&app, &root)?;

    if state
        .workspace_root()
        .is_some_and(|current| current == root)
    {
        state.clear_workspace_root();
        clear_recent_workspace_root(&app)?;
    }

    load_known_workspaces(&app)
}

pub fn create_workspace_root_at(parent_path: impl AsRef<Path>, name: &str) -> AppResult<PathBuf> {
    let parent = normalize_workspace_root(parent_path)?;
    let directory_name = safe_directory_name(name)?;
    let root = parent.join(directory_name);
    if root.exists() {
        return Err(AppError::InvalidFilename);
    }
    // 新建知识库只在用户选择的父目录下创建一层目录，避免误创建多级路径。
    fs::create_dir(&root)?;
    normalize_workspace_root(&root)
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
    let mut order = rewrite_workspace_order_items(
        &input.order,
        &moved_item.source_path,
        &moved_item.target_path,
    );
    if let (Some(source_child_container_path), Some(target_child_container_path)) = (
        moved_item.source_child_container_path.as_ref(),
        moved_item.target_child_container_path.as_ref(),
    ) {
        order = rewrite_workspace_order_items(
            &order,
            source_child_container_path,
            target_child_container_path,
        );
    }

    if let Err(error) = set_workspace_order(&app, &root, &order) {
        if moved_item.source_path != moved_item.target_path {
            let _ = fs::rename(
                root.join(&moved_item.target_path),
                root.join(&moved_item.source_path),
            );
        }
        if let (Some(source_child_container_path), Some(target_child_container_path)) = (
            moved_item.source_child_container_path.as_ref(),
            moved_item.target_child_container_path.as_ref(),
        ) {
            if source_child_container_path != target_child_container_path {
                let _ = fs::rename(
                    root.join(target_child_container_path),
                    root.join(source_child_container_path),
                );
            }
        }
        return Err(error);
    }

    workspace_payload_for_app(&app, &root)
}

#[derive(Debug, PartialEq, Eq)]
pub struct WorkspaceItemMove {
    pub source_path: String,
    pub source_child_container_path: Option<String>,
    pub target_path: String,
    pub target_child_container_path: Option<String>,
}

pub fn move_workspace_item_on_disk(
    root: &Path,
    input: &MoveWorkspaceItemInput,
) -> AppResult<WorkspaceItemMove> {
    let (kind, source_path) = parse_workspace_item_id(&input.source_id)?;
    let target_parent_path = input.target_parent_path.trim_matches('/').to_string();
    let source_child_container_path =
        (kind == WorkspaceItemKind::Document).then(|| document_child_container_path(&source_path));
    let blocked_path = match kind {
        WorkspaceItemKind::Folder => Some(source_path.as_str()),
        WorkspaceItemKind::Document => source_child_container_path.as_deref(),
    };
    if blocked_path.is_some_and(|path| is_same_or_child_path(&target_parent_path, path)) {
        return Err(AppError::InvalidWorkspaceMove(
            "不能把项目移动到自身或子级内".to_string(),
        ));
    }

    let current_path = match kind {
        WorkspaceItemKind::Document => resolve_existing_workspace_document_path(root, &source_path),
        WorkspaceItemKind::Folder => resolve_existing_directory_path(root, &source_path),
    }
    .map_err(|_| AppError::WorkspaceItemNotFound(input.source_id.clone()))?;
    let target_parent = resolve_move_target_parent(root, &target_parent_path)?;
    let source_name = Path::new(&source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(AppError::InvalidFilename)?;
    let target_path = child_relative_path(&target_parent_path, source_name);
    let target_child_container_path =
        (kind == WorkspaceItemKind::Document).then(|| document_child_container_path(&target_path));

    if target_path != source_path {
        let full_target_path = target_parent.path.join(source_name);
        if full_target_path.exists() {
            return Err(AppError::WorkspaceItemConflict(target_path));
        }
    }

    // 文档的子级实际存放在同名目录中，移动文档时必须提前校验该目录的目标冲突。
    if let (Some(source_child_container_path), Some(target_child_container_path)) = (
        source_child_container_path.as_ref(),
        target_child_container_path.as_ref(),
    ) {
        let source_child_container = root.join(source_child_container_path);
        if source_child_container.exists()
            && source_child_container_path != target_child_container_path
        {
            let target_child_container = root.join(target_child_container_path);
            if target_child_container.exists() {
                return Err(AppError::WorkspaceItemConflict(
                    target_child_container_path.clone(),
                ));
            }
        }
    }

    if target_parent.create_missing {
        fs::create_dir(&target_parent.path)?;
        mark_document_child_container(&target_parent.path)?;
    }
    if target_path != source_path {
        fs::rename(current_path, target_parent.path.join(source_name))?;
    }
    // 文档本体和子级容器分两次移动，保持文件路径和树形展示一致。
    if let (Some(source_child_container_path), Some(target_child_container_path)) = (
        source_child_container_path.as_ref(),
        target_child_container_path.as_ref(),
    ) {
        let source_child_container = root.join(source_child_container_path);
        if source_child_container.exists()
            && source_child_container_path != target_child_container_path
        {
            fs::rename(
                source_child_container,
                root.join(target_child_container_path),
            )?;
        }
    }

    Ok(WorkspaceItemMove {
        source_path,
        source_child_container_path,
        target_path,
        target_child_container_path,
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
            is_document_child_container: is_document_child_container_dir(entry.path()),
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
        let Some(kind) = document_kind_from_path(entry.path()) else {
            continue;
        };

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
        let name = document_title_from_path(entry.path());
        let parent_path = relative
            .parent()
            .map(normalize_relative_path)
            .unwrap_or_default();

        documents.push(WorkspaceDocument {
            id: relative_path.clone(),
            path: relative_path,
            name,
            parent_path,
            kind,
            modified_at,
            size: metadata.len(),
        });
    }

    documents.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(documents)
}

pub fn document_kind_from_path(path: &Path) -> Option<WorkspaceDocumentKind> {
    let filename = path.file_name()?.to_string_lossy();
    if filename.starts_with("~$") {
        return None;
    }
    if filename.to_ascii_lowercase().ends_with(".dbtable.json")
        && is_multidimensional_table_file(path)
    {
        return Some(WorkspaceDocumentKind::MultidimensionalTable);
    }

    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("lake") => Some(WorkspaceDocumentKind::Lake),
        Some(ext) if ext.eq_ignore_ascii_case("json") && is_univer_workbook_snapshot_file(path) => {
            Some(WorkspaceDocumentKind::Spreadsheet)
        }
        _ => None,
    }
}

fn document_title_from_path(path: &Path) -> String {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled");
    filename
        .strip_suffix(".dbtable.json")
        .or_else(|| filename.strip_suffix(".DBTABLE.JSON"))
        .map(str::to_string)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("Untitled")
                .to_string()
        })
}

fn is_multidimensional_table_file(path: &Path) -> bool {
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(snapshot) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    snapshot
        .get("kind")
        .and_then(|value| value.as_str())
        .is_some_and(|kind| kind == "multidimensional-table")
}

fn is_univer_workbook_snapshot_file(path: &Path) -> bool {
    let Ok(content) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(snapshot) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    // 只把具备 Univer IWorkbookData 核心结构的 JSON 纳入文档树，避免误把普通 JSON 文件当作表格。
    snapshot
        .get("sheetOrder")
        .and_then(|value| value.as_array())
        .is_some()
        && snapshot
            .get("sheets")
            .and_then(|value| value.as_object())
            .is_some()
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

pub fn resolve_existing_workspace_document_path(
    root: &Path,
    relative_path: &str,
) -> AppResult<PathBuf> {
    validate_relative_workspace_document_path(relative_path)?;
    let root = root.canonicalize()?;
    let full_path = root.join(relative_path).canonicalize()?;
    if !full_path.starts_with(&root) || !full_path.is_file() {
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

struct MoveTargetParent {
    path: PathBuf,
    create_missing: bool,
}

fn resolve_move_target_parent(root: &Path, relative_path: &str) -> AppResult<MoveTargetParent> {
    let root = root.canonicalize()?;
    if relative_path.trim().is_empty() {
        return Ok(MoveTargetParent {
            path: root,
            create_missing: false,
        });
    }

    validate_relative_directory_path(relative_path)?;
    let full_path = root.join(relative_path);
    if full_path.exists() {
        let full_path = full_path.canonicalize()?;
        if !full_path.starts_with(&root) || !full_path.is_dir() {
            return Err(AppError::PathOutsideWorkspace);
        }
        return Ok(MoveTargetParent {
            path: full_path,
            create_missing: false,
        });
    }

    let parent = full_path.parent().ok_or(AppError::InvalidFilename)?;
    let parent = parent.canonicalize()?;
    if !parent.starts_with(&root) {
        return Err(AppError::PathOutsideWorkspace);
    }
    if !document_child_container_exists(&root, relative_path)? {
        return Err(AppError::InvalidWorkspaceMove(format!(
            "拖拽目标不存在：{relative_path}"
        )));
    }
    Ok(MoveTargetParent {
        path: full_path,
        create_missing: true,
    })
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

fn validate_relative_workspace_document_path(relative_path: &str) -> AppResult<()> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(AppError::PathOutsideWorkspace);
    }
    let valid_extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("lake") || ext.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !valid_extension {
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

pub fn document_child_container_path(path: &str) -> String {
    path.strip_suffix(".dbtable.json")
        .or_else(|| path.strip_suffix(".DBTABLE.JSON"))
        .or_else(|| path.strip_suffix(".lake"))
        .or_else(|| path.strip_suffix(".LAKE"))
        .or_else(|| path.strip_suffix(".json"))
        .or_else(|| path.strip_suffix(".JSON"))
        .unwrap_or(path)
        .to_string()
}

pub fn mark_document_child_container(path: &Path) -> AppResult<()> {
    fs::write(path.join(DOCUMENT_CHILD_CONTAINER_MARKER), b"")?;
    Ok(())
}

pub fn is_document_child_container_dir(path: &Path) -> bool {
    path.join(DOCUMENT_CHILD_CONTAINER_MARKER).is_file()
}

fn document_child_container_exists(root: &Path, relative_path: &str) -> AppResult<bool> {
    Ok(list_documents(root)?
        .iter()
        .any(|document| document_child_container_path(&document.path) == relative_path))
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
