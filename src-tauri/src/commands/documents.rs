use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, State};

use crate::commands::workspace::{
    resolve_existing_directory_path, resolve_existing_lake_path, resolve_writable_lake_path,
    workspace_payload_for_app,
};
use crate::error::{AppError, AppResult};
use crate::models::{CreateDocumentPayload, WorkspacePayload};
use crate::state::AppState;
use crate::storage::app_database::{
    prune_workspace_order_path, push_workspace_order_item, rewrite_workspace_order_path,
};

const EMPTY_LAKE_DOCUMENT: &str = "<p><span class=\"ne-text\"> </span></p>";

#[tauri::command]
pub fn create_lake_document(
    title: String,
    parent_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<CreateDocumentPayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let created_path =
        create_document_at(&root, parent_path.as_deref().unwrap_or_default(), &title)?;
    push_workspace_order_item(&app, &root, format!("document:{created_path}"))?;
    let payload = workspace_payload_for_app(&app, &root)?;
    let created_document = payload
        .documents
        .iter()
        .find(|document| document.path == created_path)
        .cloned()
        .ok_or(AppError::InvalidLakePath)?;
    Ok(CreateDocumentPayload {
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
        created_document,
    })
}

#[tauri::command]
pub fn create_spreadsheet_document(
    title: String,
    parent_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<CreateDocumentPayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let created_path =
        create_spreadsheet_at(&root, parent_path.as_deref().unwrap_or_default(), &title)?;
    push_workspace_order_item(&app, &root, format!("document:{created_path}"))?;
    let payload = workspace_payload_for_app(&app, &root)?;
    let created_document = payload
        .documents
        .iter()
        .find(|document| document.path == created_path)
        .cloned()
        .ok_or(AppError::InvalidSpreadsheetPath)?;
    Ok(CreateDocumentPayload {
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
        created_document,
    })
}

#[tauri::command]
pub fn rename_lake_document(
    relative_path: String,
    title: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let current_path = resolve_existing_lake_path(&root, &relative_path)?;
    let parent = current_path.parent().ok_or(AppError::InvalidLakePath)?;
    let filename = format!("{}.lake", safe_file_stem(&title)?);
    let target = parent.join(&filename);
    if target.exists() {
        return Err(AppError::InvalidFilename);
    }
    fs::rename(current_path, target)?;
    rewrite_workspace_order_path(
        &app,
        &root,
        &relative_path,
        &replace_file_name(&relative_path, &filename),
    )?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn rename_spreadsheet_document(
    relative_path: String,
    title: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let current_path = resolve_existing_spreadsheet_path(&root, &relative_path)?;
    let parent = current_path
        .parent()
        .ok_or(AppError::InvalidSpreadsheetPath)?;
    let filename = format!("{}.json", safe_file_stem(&title)?);
    let target = parent.join(&filename);
    if target.exists() {
        return Err(AppError::InvalidFilename);
    }
    fs::rename(current_path, target)?;
    rewrite_workspace_order_path(
        &app,
        &root,
        &relative_path,
        &replace_file_name(&relative_path, &filename),
    )?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn delete_lake_document(
    relative_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_existing_lake_path(&root, &relative_path)?;
    fs::remove_file(path)?;
    prune_workspace_order_path(&app, &root, &relative_path)?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn delete_spreadsheet_document(
    relative_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkspacePayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_existing_spreadsheet_path(&root, &relative_path)?;
    fs::remove_file(path)?;
    prune_workspace_order_path(&app, &root, &relative_path)?;
    workspace_payload_for_app(&app, &root)
}

#[tauri::command]
pub fn read_lake_document(relative_path: String, state: State<'_, AppState>) -> AppResult<String> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_existing_lake_path(&root, &relative_path)?;
    Ok(fs::read_to_string(path)?)
}

#[tauri::command]
pub fn read_spreadsheet_document(
    relative_path: String,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_existing_spreadsheet_path(&root, &relative_path)?;
    Ok(fs::read_to_string(path)?)
}

#[tauri::command]
pub fn write_lake_document(
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_writable_lake_path(&root, &relative_path)?;
    atomic_write(&path, &content)
}

#[tauri::command]
pub fn write_spreadsheet_document(
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_writable_spreadsheet_path(&root, &relative_path)?;
    atomic_write_spreadsheet(&path, &content)
}

#[tauri::command]
pub fn write_export_file(path: String, content: String) -> AppResult<()> {
    let path = Path::new(&path);
    ensure_export_parent(path)?;
    fs::write(path, content)?;
    Ok(())
}

#[tauri::command]
pub fn write_export_bytes(path: String, bytes: Vec<u8>) -> AppResult<()> {
    let path = Path::new(&path);
    ensure_export_parent(path)?;
    fs::write(path, bytes)?;
    Ok(())
}

#[tauri::command]
pub fn export_pdf_from_html(path: String, html: String) -> AppResult<()> {
    let path = Path::new(&path);
    ensure_export_parent(path)?;
    let temp_dir = std::env::temp_dir().join("yuque-lake-notes");
    fs::create_dir_all(&temp_dir)?;
    let html_path = temp_dir.join(format!("{}.html", uuid::Uuid::new_v4()));
    fs::write(&html_path, html)?;
    let result = run_wkhtmltopdf(&html_path, path);
    let _ = fs::remove_file(html_path);
    result?;
    Ok(())
}

pub fn create_document(root: &Path, title: &str) -> AppResult<String> {
    create_document_at(root, "", title)
}

pub fn create_spreadsheet(root: &Path, title: &str) -> AppResult<String> {
    create_spreadsheet_at(root, "", title)
}

pub fn create_document_at(root: &Path, parent_path: &str, title: &str) -> AppResult<String> {
    let stem = safe_file_stem(title)?;
    let parent = resolve_existing_directory_path(root, parent_path)?;
    let normalized_parent = if parent_path.trim().is_empty() {
        String::new()
    } else {
        parent_path.trim_matches('/').to_string()
    };
    let mut candidate = format!("{stem}.lake");
    let mut counter = 2;

    while parent.join(&candidate).exists() {
        candidate = format!("{stem}-{counter}.lake");
        counter += 1;
    }

    let relative_path = if normalized_parent.is_empty() {
        candidate.clone()
    } else {
        format!("{normalized_parent}/{candidate}")
    };
    let path = resolve_writable_lake_path(root, &relative_path)?;
    atomic_write(&path, EMPTY_LAKE_DOCUMENT)?;
    Ok(relative_path)
}

pub fn create_spreadsheet_at(root: &Path, parent_path: &str, title: &str) -> AppResult<String> {
    let content = empty_spreadsheet_document(title)?;
    create_spreadsheet_from_content_at(root, parent_path, title, &content)
}

pub fn create_spreadsheet_from_content_at(
    root: &Path,
    parent_path: &str,
    title: &str,
    content: &str,
) -> AppResult<String> {
    let stem = safe_file_stem(title)?;
    let parent = resolve_existing_directory_path(root, parent_path)?;
    let normalized_parent = if parent_path.trim().is_empty() {
        String::new()
    } else {
        parent_path.trim_matches('/').to_string()
    };
    let mut candidate = format!("{stem}.json");
    let mut counter = 2;

    while parent.join(&candidate).exists() {
        candidate = format!("{stem}-{counter}.json");
        counter += 1;
    }

    let relative_path = if normalized_parent.is_empty() {
        candidate.clone()
    } else {
        format!("{normalized_parent}/{candidate}")
    };
    let path = resolve_writable_spreadsheet_path(root, &relative_path)?;
    atomic_write_spreadsheet(&path, content)?;
    Ok(relative_path)
}

fn empty_spreadsheet_document(title: &str) -> AppResult<String> {
    // Univer 的原生保存结果是 IWorkbookData 快照对象；新建表格直接生成同结构 JSON，避免额外格式转换。
    let snapshot = serde_json::json!({
        "id": "local-lake-workbook",
        "name": title,
        "appVersion": "0.21.1",
        "locale": "zhCN",
        "styles": {},
        "sheetOrder": ["sheet-0001"],
        "sheets": {
            "sheet-0001": {
                "id": "sheet-0001",
                "name": "Sheet1",
                "tabColor": "",
                "hidden": 0,
                "freeze": {
                    "xSplit": 0,
                    "ySplit": 0,
                    "startRow": 0,
                    "startColumn": 0
                },
                "rowCount": 100,
                "columnCount": 26,
                "zoomRatio": 1,
                "scrollTop": 0,
                "scrollLeft": 0,
                "defaultColumnWidth": 88,
                "defaultRowHeight": 24,
                "mergeData": [],
                "cellData": {},
                "rowData": {},
                "columnData": {},
                "rowHeader": { "width": 46 },
                "columnHeader": { "height": 20 },
                "showGridlines": 1,
                "rightToLeft": 0
            }
        }
    });
    Ok(format!("{}\n", serde_json::to_string_pretty(&snapshot)?))
}

pub fn safe_file_stem(title: &str) -> AppResult<String> {
    let mut output = String::new();
    let mut last_was_dash = false;

    for character in title.trim().chars() {
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
    if output.is_empty() {
        Ok("未命名文档".to_string())
    } else {
        Ok(output)
    }
}

pub fn atomic_write(path: &Path, content: &str) -> AppResult<()> {
    let parent = path.parent().ok_or(AppError::InvalidLakePath)?;
    fs::create_dir_all(parent)?;
    let temp_path = path.with_extension("lake.tmp");
    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;
    Ok(())
}

pub fn atomic_write_spreadsheet(path: &Path, content: &str) -> AppResult<()> {
    let parent = path.parent().ok_or(AppError::InvalidSpreadsheetPath)?;
    fs::create_dir_all(parent)?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;
    Ok(())
}

pub fn resolve_existing_spreadsheet_path(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    validate_relative_spreadsheet_path(relative_path)?;
    let root = root.canonicalize()?;
    let full_path = root.join(relative_path).canonicalize()?;
    if !full_path.starts_with(&root) {
        return Err(AppError::PathOutsideWorkspace);
    }
    Ok(full_path)
}

pub fn resolve_writable_spreadsheet_path(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    validate_relative_spreadsheet_path(relative_path)?;
    let root = root.canonicalize()?;
    let full_path = root.join(relative_path);
    let parent = full_path.parent().ok_or(AppError::InvalidSpreadsheetPath)?;
    let parent = parent.canonicalize()?;
    if !parent.starts_with(&root) {
        return Err(AppError::PathOutsideWorkspace);
    }
    Ok(full_path)
}

fn validate_relative_spreadsheet_path(relative_path: &str) -> AppResult<()> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(AppError::PathOutsideWorkspace);
    }
    if !path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        return Err(AppError::InvalidSpreadsheetPath);
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

fn ensure_export_parent(path: &Path) -> AppResult<()> {
    let parent = path.parent().ok_or(AppError::InvalidFilename)?;
    if !parent.exists() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn run_wkhtmltopdf(html_path: &Path, pdf_path: &Path) -> AppResult<()> {
    let candidates = [
        std::env::var("YUQUE_WKHTMLTOPDF").ok(),
        Some("wkhtmltopdf".to_string()),
        Some("/usr/local/bin/wkhtmltopdf".to_string()),
        Some("/opt/homebrew/bin/wkhtmltopdf".to_string()),
    ];
    let mut last_error = None;

    for candidate in candidates.into_iter().flatten() {
        let output = Command::new(&candidate)
            .arg("--enable-local-file-access")
            .arg("--encoding")
            .arg("utf-8")
            .arg("--print-media-type")
            .arg("--quiet")
            .arg(html_path)
            .arg(pdf_path)
            .output();

        match output {
            Ok(output) if output.status.success() => return Ok(()),
            Ok(output) => {
                last_error = Some(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
    }

    Err(AppError::Export(format!(
        "PDF 导出失败，请确认已安装 wkhtmltopdf：{}",
        last_error.unwrap_or_else(|| "未找到可用命令".to_string())
    )))
}

fn replace_file_name(relative_path: &str, filename: &str) -> String {
    relative_path
        .rsplit_once('/')
        .map(|(parent, _)| format!("{parent}/{filename}"))
        .unwrap_or_else(|| filename.to_string())
}
