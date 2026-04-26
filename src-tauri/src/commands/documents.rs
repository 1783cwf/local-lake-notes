use std::fs;
use std::path::Path;

use tauri::State;

use crate::commands::workspace::{resolve_existing_lake_path, resolve_writable_lake_path, workspace_payload};
use crate::error::{AppError, AppResult};
use crate::models::CreateDocumentPayload;
use crate::state::AppState;

const EMPTY_LAKE_DOCUMENT: &str = "<p><span class=\"ne-text\"> </span></p>";

#[tauri::command]
pub fn create_lake_document(title: String, state: State<'_, AppState>) -> AppResult<CreateDocumentPayload> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let created_path = create_document(&root, &title)?;
    let payload = workspace_payload(&root)?;
    let created_document = payload
        .documents
        .iter()
        .find(|document| document.path == created_path)
        .cloned()
        .ok_or(AppError::InvalidLakePath)?;
    Ok(CreateDocumentPayload {
        root: payload.root,
        documents: payload.documents,
        created_document,
    })
}

#[tauri::command]
pub fn read_lake_document(relative_path: String, state: State<'_, AppState>) -> AppResult<String> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let path = resolve_existing_lake_path(&root, &relative_path)?;
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

pub fn create_document(root: &Path, title: &str) -> AppResult<String> {
    let stem = safe_file_stem(title)?;
    let mut candidate = format!("{stem}.lake");
    let mut counter = 2;

    while root.join(&candidate).exists() {
        candidate = format!("{stem}-{counter}.lake");
        counter += 1;
    }

    let path = resolve_writable_lake_path(root, &candidate)?;
    atomic_write(&path, EMPTY_LAKE_DOCUMENT)?;
    Ok(candidate)
}

pub fn safe_file_stem(title: &str) -> AppResult<String> {
    let mut output = String::new();
    let mut last_was_dash = false;

    for character in title.trim().chars() {
        let invalid = character.is_control()
            || matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
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
