use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use tauri::{AppHandle, State};
use walkdir::WalkDir;

use crate::commands::documents::{atomic_write, atomic_write_multidimensional_table};
use crate::commands::settings::load_oss_settings;
use crate::error::{AppError, AppResult};
use crate::models::{
    ResourceMigrationAnalysisOutput, ResourceMigrationInput, ResourceMigrationIssue,
    ResourceMigrationReference, ResourceMigrationRunOutput,
};
use crate::state::AppState;
use crate::storage::object_store::ObjectStoreTarget;
use crate::storage::resource_migration::{copy_planned_resources, plan_resource_migrations};

#[tauri::command]
pub async fn analyze_resource_migration(
    input: ResourceMigrationInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ResourceMigrationAnalysisOutput> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let settings = load_oss_settings(&app)?
        .ok_or_else(|| AppError::InvalidOssSettings("请先配置文件存储".to_string()))?;
    let refs = collect_workspace_resource_refs(&root)?;
    let source = migration_target(input.source);
    let target = migration_target(input.target);
    let (planned, migrated, skipped, unreadable, conflicts) =
        plan_resource_migrations(&app, &settings, &refs, &source, &target).await?;

    Ok(build_analysis(
        refs.len(),
        &planned,
        migrated,
        skipped,
        unreadable,
        conflicts,
    ))
}

#[tauri::command]
pub async fn run_resource_migration(
    input: ResourceMigrationInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ResourceMigrationRunOutput> {
    let root = state.workspace_root().ok_or(AppError::MissingWorkspace)?;
    let settings = load_oss_settings(&app)?
        .ok_or_else(|| AppError::InvalidOssSettings("请先配置文件存储".to_string()))?;
    let refs = collect_workspace_resource_refs(&root)?;
    let source = migration_target(input.source);
    let target = migration_target(input.target);
    let (planned, migrated, skipped, unreadable, conflicts) =
        plan_resource_migrations(&app, &settings, &refs, &source, &target).await?;

    if !unreadable.is_empty() || !conflicts.is_empty() {
        return Err(AppError::Backup(
            "资源迁移存在不可读资源或目标冲突，请先查看 dry-run 结果".to_string(),
        ));
    }

    let copied_resources = copy_planned_resources(&app, &settings, &planned).await?;
    let replacements = planned
        .iter()
        .map(|item| (item.resource_ref.clone(), item.next_resource_ref.clone()))
        .collect::<HashMap<_, _>>();
    let rewritten_documents = rewrite_workspace_resource_refs(&root, &replacements)?;

    Ok(ResourceMigrationRunOutput {
        analysis: build_analysis(
            refs.len(),
            &planned,
            migrated,
            skipped,
            unreadable,
            conflicts,
        ),
        rewritten_documents,
        copied_resources,
    })
}

pub fn collect_workspace_resource_refs(root: &Path) -> AppResult<Vec<(String, String, String)>> {
    let root = root.canonicalize()?;
    let mut refs = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|entry| !is_hidden_document_child_container(entry.path()))
    {
        let entry = entry?;
        if !entry.file_type().is_file() || !is_resource_document(entry.path()) {
            continue;
        }
        let relative_path = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| AppError::PathOutsideWorkspace)?
            .to_string_lossy()
            .replace('\\', "/");
        let content = fs::read_to_string(entry.path())?;
        collect_text_resource_refs(&content, &relative_path, "文本", &mut refs);
        collect_lake_card_resource_refs(&content, &relative_path, &mut refs);
        if is_multidimensional_table_path(entry.path()) {
            collect_json_resource_refs(&content, &relative_path, &mut refs);
        }
    }
    Ok(refs)
}

pub fn rewrite_workspace_resource_refs(
    root: &Path,
    replacements: &HashMap<String, String>,
) -> AppResult<Vec<String>> {
    if replacements.is_empty() {
        return Ok(Vec::new());
    }

    let root = root.canonicalize()?;
    let mut pending_writes = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|entry| !is_hidden_document_child_container(entry.path()))
    {
        let entry = entry?;
        if !entry.file_type().is_file() || !is_resource_document(entry.path()) {
            continue;
        }
        let content = fs::read_to_string(entry.path())?;
        let rewritten = rewrite_resource_refs_in_text(&content, replacements);
        if rewritten != content {
            let relative_path = entry
                .path()
                .strip_prefix(&root)
                .map_err(|_| AppError::PathOutsideWorkspace)?
                .to_string_lossy()
                .replace('\\', "/");
            pending_writes.push((entry.path().to_path_buf(), relative_path, rewritten));
        }
    }

    let mut rewritten_documents = Vec::new();
    for (path, relative_path, content) in pending_writes {
        if is_lake_path(&path) {
            atomic_write(&path, &content)?;
        } else {
            atomic_write_multidimensional_table(&path, &content)?;
        }
        rewritten_documents.push(relative_path);
    }
    Ok(rewritten_documents)
}

fn build_analysis(
    total_references: usize,
    planned: &[crate::storage::resource_migration::PlannedResourceMigration],
    migrated_resources: Vec<ResourceMigrationReference>,
    skipped_resources: Vec<ResourceMigrationReference>,
    unreadable_resources: Vec<ResourceMigrationIssue>,
    conflict_resources: Vec<ResourceMigrationIssue>,
) -> ResourceMigrationAnalysisOutput {
    let document_count = migrated_resources
        .iter()
        .map(|item| item.document_path.clone())
        .collect::<HashSet<_>>()
        .len();
    ResourceMigrationAnalysisOutput {
        total_references,
        unique_resources: planned.len(),
        document_count,
        total_bytes: planned.iter().map(|item| item.size).sum(),
        migrated_resources,
        skipped_resources,
        unreadable_resources,
        conflict_resources,
    }
}

fn migration_target(input: crate::models::ResourceMigrationTargetInput) -> ObjectStoreTarget {
    ObjectStoreTarget {
        provider: input.provider,
        storage_id: input.storage_id,
    }
}

fn is_hidden_document_child_container(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == crate::commands::workspace::DOCUMENT_CHILD_CONTAINER_MARKER)
}

fn is_resource_document(path: &Path) -> bool {
    is_lake_path(path) || is_multidimensional_table_path(path)
}

fn is_lake_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lake"))
}

fn is_multidimensional_table_path(path: &Path) -> bool {
    path.to_string_lossy()
        .to_ascii_lowercase()
        .ends_with(".dbtable.json")
}

fn collect_text_resource_refs(
    content: &str,
    document_path: &str,
    location: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    let mut rest = content;
    while let Some(index) = rest.find("yuque-resource://") {
        let candidate = &rest[index..];
        let end = candidate
            .char_indices()
            .find_map(|(offset, character)| {
                if offset > 0 && is_resource_ref_terminator(character) {
                    Some(offset)
                } else {
                    None
                }
            })
            .unwrap_or(candidate.len());
        let value = html_unescape_minimal(&candidate[..end]);
        refs.push((value, document_path.to_string(), location.to_string()));
        rest = &candidate[end..];
    }
}

fn collect_lake_card_resource_refs(
    content: &str,
    document_path: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    for encoded_value in extract_attribute_values(content, "value") {
        let decoded_attribute = html_unescape_minimal(&encoded_value);
        let payload = decoded_attribute
            .strip_prefix("data:")
            .unwrap_or(decoded_attribute.as_str());
        let decoded_payload = percent_decode(payload);
        collect_text_resource_refs(&decoded_payload, document_path, "Lake 卡片", refs);
    }
}

fn collect_json_resource_refs(
    content: &str,
    document_path: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
        return;
    };
    collect_json_value_resource_refs(&value, document_path, refs);
}

fn collect_json_value_resource_refs(
    value: &serde_json::Value,
    document_path: &str,
    refs: &mut Vec<(String, String, String)>,
) {
    match value {
        serde_json::Value::String(text) => {
            collect_text_resource_refs(text, document_path, "多维表格", refs);
            collect_lake_card_resource_refs(text, document_path, refs);
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_json_value_resource_refs(item, document_path, refs);
            }
        }
        serde_json::Value::Object(map) => {
            for item in map.values() {
                collect_json_value_resource_refs(item, document_path, refs);
            }
        }
        _ => {}
    }
}

fn rewrite_resource_refs_in_text(content: &str, replacements: &HashMap<String, String>) -> String {
    replacements
        .iter()
        .fold(content.to_string(), |next, (source, target)| {
            next.replace(source, target)
                .replace(&html_escape_attr(source), &html_escape_attr(target))
                .replace(&encode_uri_component(source), &encode_uri_component(target))
        })
}

fn extract_attribute_values(content: &str, attribute: &str) -> Vec<String> {
    let mut values = Vec::new();
    for quote in ['"', '\''] {
        let marker = format!("{attribute}={quote}");
        let mut rest = content;
        while let Some(index) = rest.find(&marker) {
            let value_start = index + marker.len();
            let candidate = &rest[value_start..];
            let Some(value_end) = candidate.find(quote) else {
                break;
            };
            values.push(candidate[..value_end].to_string());
            rest = &candidate[value_end + quote.len_utf8()..];
        }
    }
    values
}

fn is_resource_ref_terminator(character: char) -> bool {
    character.is_whitespace() || matches!(character, '"' | '\'' | '<' | '>' | ')' | '(' | '[' | ']')
}

fn html_unescape_minimal(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&#38;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
}

fn html_escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                output.push(hex);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn encode_uri_component(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| {
            let allowed = byte.is_ascii_alphanumeric()
                || matches!(
                    byte,
                    b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
                );
            if allowed {
                vec![byte as char]
            } else {
                format!("%{byte:02X}").chars().collect()
            }
        })
        .collect()
}
