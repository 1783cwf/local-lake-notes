use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::models::{OssSettings, WorkspaceOrder};

const DATABASE_FILE: &str = "yuque-lake-notes.sqlite3";
const RECENT_WORKSPACE_KEY: &str = "recent_workspace";
const OSS_SETTINGS_KEY: &str = "oss_settings";
const LEGACY_WORKSPACE_META_DIR: &str = ".yuque-lake-notes";
const LEGACY_WORKSPACE_ORDER_FILE: &str = "order.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspaceConfig {
    recent_workspace: String,
}

pub fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(DATABASE_FILE))
}

pub fn initialize_app_database(app: &AppHandle) -> AppResult<()> {
    let path = database_path(app)?;
    connect_at(&path)?;
    migrate_legacy_app_settings(app, &path)
}

pub fn load_recent_workspace_root(app: &AppHandle) -> AppResult<Option<String>> {
    let path = database_path(app)?;
    migrate_legacy_app_settings(app, &path)?;
    get_setting_at(&path, RECENT_WORKSPACE_KEY)
}

pub fn save_recent_workspace_root(app: &AppHandle, root: &Path) -> AppResult<()> {
    set_setting_at(
        &database_path(app)?,
        RECENT_WORKSPACE_KEY,
        &root.to_string_lossy(),
    )
}

pub fn load_oss_settings(app: &AppHandle) -> AppResult<Option<OssSettings>> {
    let path = database_path(app)?;
    migrate_legacy_app_settings(app, &path)?;
    load_oss_settings_at(&path)
}

pub fn save_oss_settings(app: &AppHandle, settings: &OssSettings) -> AppResult<()> {
    save_oss_settings_at(&database_path(app)?, settings)
}

pub fn read_workspace_order(app: &AppHandle, root: &Path) -> AppResult<Vec<String>> {
    let path = database_path(app)?;
    let order = read_workspace_order_at(&path, root)?;
    if !order.is_empty() {
        remove_legacy_workspace_order(root)?;
        return Ok(order);
    }

    let Some(legacy_order) = read_legacy_workspace_order(root)? else {
        return Ok(order);
    };
    set_workspace_order_at(&path, root, &legacy_order)?;
    remove_legacy_workspace_order(root)?;
    Ok(legacy_order)
}

pub fn set_workspace_order(app: &AppHandle, root: &Path, order: &[String]) -> AppResult<()> {
    set_workspace_order_at(&database_path(app)?, root, order)?;
    remove_legacy_workspace_order(root)
}

pub fn push_workspace_order_item(app: &AppHandle, root: &Path, item_id: String) -> AppResult<()> {
    let path = database_path(app)?;
    let mut order = read_workspace_order_at(&path, root)?;
    if !order.contains(&item_id) {
        order.push(item_id);
        set_workspace_order_at(&path, root, &order)?;
    }
    remove_legacy_workspace_order(root)
}

pub fn rewrite_workspace_order_path(
    app: &AppHandle,
    root: &Path,
    from_path: &str,
    to_path: &str,
) -> AppResult<()> {
    let path = database_path(app)?;
    let order = read_workspace_order_at(&path, root)?
        .into_iter()
        .map(|item_id| replace_order_item_path(&item_id, from_path, to_path))
        .collect::<Vec<_>>();
    set_workspace_order_at(&path, root, &order)?;
    remove_legacy_workspace_order(root)
}

pub fn prune_workspace_order_path(app: &AppHandle, root: &Path, path: &str) -> AppResult<()> {
    let database_path = database_path(app)?;
    let mut order = read_workspace_order_at(&database_path, root)?;
    order.retain(|item_id| {
        order_item_path(item_id)
            .map(|item_path| !is_same_or_child_path(item_path, path))
            .unwrap_or(true)
    });
    set_workspace_order_at(&database_path, root, &order)?;
    remove_legacy_workspace_order(root)
}

pub fn move_workspace_order(app: &AppHandle, from_root: &Path, to_root: &Path) -> AppResult<()> {
    let path = database_path(app)?;
    let connection = connect_at(&path)?;
    connection.execute(
        "UPDATE workspace_order SET workspace_root = ?1 WHERE workspace_root = ?2",
        params![workspace_key(to_root), workspace_key(from_root)],
    )?;
    remove_legacy_workspace_order(from_root)
}

pub fn load_oss_settings_at(database_path: &Path) -> AppResult<Option<OssSettings>> {
    get_setting_at(database_path, OSS_SETTINGS_KEY)?
        .map(|content| serde_json::from_str(&content))
        .transpose()
        .map_err(Into::into)
}

pub fn save_oss_settings_at(database_path: &Path, settings: &OssSettings) -> AppResult<()> {
    set_setting_at(
        database_path,
        OSS_SETTINGS_KEY,
        &serde_json::to_string(settings)?,
    )
}

pub fn read_workspace_order_at(database_path: &Path, root: &Path) -> AppResult<Vec<String>> {
    let connection = connect_at(database_path)?;
    let mut statement = connection.prepare(
        "SELECT item_id FROM workspace_order WHERE workspace_root = ?1 ORDER BY position ASC",
    )?;
    let rows = statement.query_map(params![workspace_key(root)], |row| row.get::<_, String>(0))?;
    let mut order = Vec::new();
    for row in rows {
        order.push(row?);
    }
    Ok(order)
}

pub fn set_workspace_order_at(
    database_path: &Path,
    root: &Path,
    order: &[String],
) -> AppResult<()> {
    let mut connection = connect_at(database_path)?;
    let transaction = connection.transaction()?;
    transaction.execute(
        "DELETE FROM workspace_order WHERE workspace_root = ?1",
        params![workspace_key(root)],
    )?;
    for (position, item_id) in order.iter().enumerate() {
        transaction.execute(
            "INSERT INTO workspace_order (workspace_root, item_id, position) VALUES (?1, ?2, ?3)",
            params![workspace_key(root), item_id, position as i64],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn rewrite_workspace_order_path_at(
    database_path: &Path,
    root: &Path,
    from_path: &str,
    to_path: &str,
) -> AppResult<()> {
    let order = read_workspace_order_at(database_path, root)?
        .into_iter()
        .map(|item_id| replace_order_item_path(&item_id, from_path, to_path))
        .collect::<Vec<_>>();
    set_workspace_order_at(database_path, root, &order)
}

pub fn prune_workspace_order_path_at(
    database_path: &Path,
    root: &Path,
    path: &str,
) -> AppResult<()> {
    let mut order = read_workspace_order_at(database_path, root)?;
    order.retain(|item_id| {
        order_item_path(item_id)
            .map(|item_path| !is_same_or_child_path(item_path, path))
            .unwrap_or(true)
    });
    set_workspace_order_at(database_path, root, &order)
}

pub fn set_recent_workspace_root_at(database_path: &Path, root: &Path) -> AppResult<()> {
    set_setting_at(database_path, RECENT_WORKSPACE_KEY, &root.to_string_lossy())
}

pub fn load_recent_workspace_root_at(database_path: &Path) -> AppResult<Option<String>> {
    get_setting_at(database_path, RECENT_WORKSPACE_KEY)
}

fn connect_at(database_path: &Path) -> AppResult<Connection> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let connection = Connection::open(database_path)?;
    initialize_schema(&connection)?;
    Ok(connection)
}

fn initialize_schema(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workspace_order (
            workspace_root TEXT NOT NULL,
            item_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (workspace_root, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_workspace_order_position
            ON workspace_order (workspace_root, position);
        ",
    )?;
    Ok(())
}

fn get_setting_at(database_path: &Path, key: &str) -> AppResult<Option<String>> {
    connect_at(database_path)?
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
}

fn set_setting_at(database_path: &Path, key: &str, value: &str) -> AppResult<()> {
    connect_at(database_path)?.execute(
        "
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        ",
        params![key, value],
    )?;
    Ok(())
}

fn migrate_legacy_app_settings(app: &AppHandle, database_path: &Path) -> AppResult<()> {
    let config_dir = app.path().app_config_dir()?;
    let workspace_path = config_dir.join("workspace.json");
    if get_setting_at(database_path, RECENT_WORKSPACE_KEY)?.is_none() && workspace_path.exists() {
        let content = fs::read_to_string(workspace_path)?;
        let config = serde_json::from_str::<LegacyWorkspaceConfig>(&content)?;
        set_setting_at(
            database_path,
            RECENT_WORKSPACE_KEY,
            &config.recent_workspace,
        )?;
    }

    let oss_path = config_dir.join("oss-settings.json");
    if get_setting_at(database_path, OSS_SETTINGS_KEY)?.is_none() && oss_path.exists() {
        let content = fs::read_to_string(oss_path)?;
        let settings = serde_json::from_str::<OssSettings>(&content)?;
        save_oss_settings_at(database_path, &settings)?;
    }

    Ok(())
}

fn read_legacy_workspace_order(root: &Path) -> AppResult<Option<Vec<String>>> {
    let path = legacy_workspace_order_path(root);
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    Ok(Some(
        serde_json::from_str::<WorkspaceOrder>(&content)?.items,
    ))
}

fn remove_legacy_workspace_order(root: &Path) -> AppResult<()> {
    let path = legacy_workspace_order_path(root);
    match fs::remove_file(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    let dir = root.join(LEGACY_WORKSPACE_META_DIR);
    if dir.exists() && dir.read_dir()?.next().is_none() {
        fs::remove_dir(dir)?;
    }
    Ok(())
}

fn legacy_workspace_order_path(root: &Path) -> PathBuf {
    root.join(LEGACY_WORKSPACE_META_DIR)
        .join(LEGACY_WORKSPACE_ORDER_FILE)
}

fn workspace_key(root: &Path) -> String {
    root.to_string_lossy().to_string()
}

fn replace_order_item_path(item_id: &str, from_path: &str, to_path: &str) -> String {
    let Some((kind, path)) = item_id.split_once(':') else {
        return item_id.to_string();
    };

    if is_same_or_child_path(path, from_path) {
        format!("{kind}:{}", replace_path_prefix(path, from_path, to_path))
    } else {
        item_id.to_string()
    }
}

fn replace_path_prefix(path: &str, from_path: &str, to_path: &str) -> String {
    if is_same_or_child_path(path, from_path) {
        format!("{to_path}{}", &path[from_path.len()..])
    } else {
        path.to_string()
    }
}

fn order_item_path(item_id: &str) -> Option<&str> {
    item_id.split_once(':').map(|(_, path)| path)
}

fn is_same_or_child_path(path: &str, base_path: &str) -> bool {
    path == base_path || path.starts_with(&format!("{base_path}/"))
}
