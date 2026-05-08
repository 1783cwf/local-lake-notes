use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::models::{DatabaseLocationSettings, KnownWorkspace, OssSettings, WorkspaceOrder};

pub const DATABASE_FILE: &str = "yuque-lake-notes.sqlite3";
const DATABASE_LOCATION_FILE: &str = "database-location.json";
const RECENT_WORKSPACE_KEY: &str = "recent_workspace";
const OSS_SETTINGS_KEY: &str = "oss_settings";
const BACKUP_KEY_METADATA_KEY: &str = "backup_key_metadata";
const RESOURCE_KEY_METADATA_KEY: &str = "resource_key_metadata";
const BACKUP_DEVICE_ID_KEY: &str = "backup_device_id";
const BACKUP_LAST_MANIFEST_KEY: &str = "backup_last_manifest";
const LEGACY_WORKSPACE_META_DIR: &str = ".yuque-lake-notes";
const LEGACY_WORKSPACE_ORDER_FILE: &str = "order.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyWorkspaceConfig {
    recent_workspace: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseLocationConfig {
    directory: String,
}

pub fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = database_dir(app)?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(DATABASE_FILE))
}

pub fn database_location_settings(app: &AppHandle) -> AppResult<DatabaseLocationSettings> {
    let directory = database_dir(app)?;
    let custom = load_database_location_config(app)?.is_some();
    Ok(DatabaseLocationSettings {
        database_path: directory.join(DATABASE_FILE).to_string_lossy().to_string(),
        directory: directory.to_string_lossy().to_string(),
        custom,
    })
}

pub fn save_database_location(
    app: &AppHandle,
    directory: &Path,
) -> AppResult<DatabaseLocationSettings> {
    let current_path = database_path(app)?;
    let next_directory = normalize_database_directory(directory)?;
    let next_path = next_directory.join(DATABASE_FILE);
    fs::create_dir_all(&next_directory)?;

    if current_path != next_path {
        clone_database_to_directory_at(&current_path, &next_directory)?;
    }

    let config_path = database_location_config_path(app)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let config = DatabaseLocationConfig {
        directory: next_directory.to_string_lossy().to_string(),
    };
    // 数据库位置不能写入 SQLite 自身，否则应用启动时无法先定位数据库。
    fs::write(config_path, serde_json::to_vec_pretty(&config)?)?;
    database_location_settings(app)
}

pub fn clone_database_to_directory_at(
    current_path: &Path,
    next_directory: &Path,
) -> AppResult<PathBuf> {
    let next_path = next_directory.join(DATABASE_FILE);
    fs::create_dir_all(next_directory)?;
    if !next_path.exists() && current_path.exists() {
        fs::copy(current_path, &next_path)?;
    }
    connect_at(&next_path)?;
    Ok(next_path)
}

pub fn snapshot_database(app: &AppHandle, destination: &Path) -> AppResult<()> {
    let source_path = database_path(app)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let source = Connection::open(source_path)?;
    let mut target = Connection::open(destination)?;
    {
        let backup = rusqlite::backup::Backup::new(&source, &mut target)?;
        // SQLite 在线备份 API 能在应用运行时拿到一致性快照，避免直接复制 wal 中的半写入状态。
        backup.run_to_completion(100, Duration::from_millis(25), None)?;
    }
    Ok(())
}

#[cfg(debug_assertions)]
fn default_database_dir(_app: &AppHandle) -> AppResult<PathBuf> {
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("dev-data"))
}

#[cfg(not(debug_assertions))]
fn default_database_dir(app: &AppHandle) -> AppResult<PathBuf> {
    app.path().app_local_data_dir().map_err(Into::into)
}

fn database_dir(app: &AppHandle) -> AppResult<PathBuf> {
    match load_database_location_config(app)? {
        Some(config) if !config.directory.trim().is_empty() => {
            normalize_database_directory(Path::new(&config.directory))
        }
        _ => default_database_dir(app),
    }
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
    let path = database_path(app)?;
    set_recent_workspace_root_at(&path, root)
}

pub fn clear_recent_workspace_root(app: &AppHandle) -> AppResult<()> {
    delete_setting_at(&database_path(app)?, RECENT_WORKSPACE_KEY)
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
    let order =
        rewrite_workspace_order_items(&read_workspace_order_at(&path, root)?, from_path, to_path);
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
    move_known_workspace_at(&path, from_root, to_root)?;
    remove_legacy_workspace_order(from_root)
}

pub fn list_known_workspaces(app: &AppHandle) -> AppResult<Vec<KnownWorkspace>> {
    let path = database_path(app)?;
    migrate_legacy_app_settings(app, &path)?;
    list_known_workspaces_at(&path)
}

pub fn forget_known_workspace(app: &AppHandle, root: &Path) -> AppResult<()> {
    forget_known_workspace_at(&database_path(app)?, root)
}

pub fn load_backup_key_metadata(app: &AppHandle) -> AppResult<Option<String>> {
    get_setting_at(&database_path(app)?, BACKUP_KEY_METADATA_KEY)
}

pub fn save_backup_key_metadata(app: &AppHandle, metadata: &str) -> AppResult<()> {
    set_setting_at(&database_path(app)?, BACKUP_KEY_METADATA_KEY, metadata)
}

pub fn load_resource_key_metadata(app: &AppHandle) -> AppResult<Option<String>> {
    get_setting_at(&database_path(app)?, RESOURCE_KEY_METADATA_KEY)
}

pub fn save_resource_key_metadata(app: &AppHandle, metadata: &str) -> AppResult<()> {
    set_setting_at(&database_path(app)?, RESOURCE_KEY_METADATA_KEY, metadata)
}

pub fn load_backup_device_id(app: &AppHandle) -> AppResult<Option<String>> {
    get_setting_at(&database_path(app)?, BACKUP_DEVICE_ID_KEY)
}

pub fn save_backup_device_id(app: &AppHandle, device_id: &str) -> AppResult<()> {
    set_setting_at(&database_path(app)?, BACKUP_DEVICE_ID_KEY, device_id)
}

pub fn load_backup_last_manifest(app: &AppHandle) -> AppResult<Option<String>> {
    get_setting_at(&database_path(app)?, BACKUP_LAST_MANIFEST_KEY)
}

pub fn save_backup_last_manifest(app: &AppHandle, manifest: &str) -> AppResult<()> {
    set_setting_at(&database_path(app)?, BACKUP_LAST_MANIFEST_KEY, manifest)
}

pub fn clear_backup_last_manifest(app: &AppHandle) -> AppResult<()> {
    delete_setting_at(&database_path(app)?, BACKUP_LAST_MANIFEST_KEY)
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
    let order = rewrite_workspace_order_items(
        &read_workspace_order_at(database_path, root)?,
        from_path,
        to_path,
    );
    set_workspace_order_at(database_path, root, &order)
}

pub fn rewrite_workspace_order_items(
    order: &[String],
    from_path: &str,
    to_path: &str,
) -> Vec<String> {
    order
        .iter()
        .map(|item_id| replace_order_item_path(item_id, from_path, to_path))
        .collect()
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
    set_setting_at(database_path, RECENT_WORKSPACE_KEY, &root.to_string_lossy())?;
    upsert_known_workspace_at(database_path, root)
}

pub fn load_recent_workspace_root_at(database_path: &Path) -> AppResult<Option<String>> {
    get_setting_at(database_path, RECENT_WORKSPACE_KEY)
}

pub fn clear_recent_workspace_root_at(database_path: &Path) -> AppResult<()> {
    delete_setting_at(database_path, RECENT_WORKSPACE_KEY)
}

pub fn upsert_known_workspace_at(database_path: &Path, root: &Path) -> AppResult<()> {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("知识库");
    connect_at(database_path)?.execute(
        "
        INSERT INTO known_workspaces (workspace_root, name, last_opened_at)
        VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(workspace_root) DO UPDATE SET
            name = excluded.name,
            last_opened_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ",
        params![workspace_key(root), name],
    )?;
    Ok(())
}

pub fn move_known_workspace_at(
    database_path: &Path,
    from_root: &Path,
    to_root: &Path,
) -> AppResult<()> {
    let name = to_root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("知识库");
    connect_at(database_path)?.execute(
        "
        UPDATE known_workspaces
        SET workspace_root = ?1, name = ?2, last_opened_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE workspace_root = ?3
        ",
        params![workspace_key(to_root), name, workspace_key(from_root)],
    )?;
    Ok(())
}

pub fn list_known_workspaces_at(database_path: &Path) -> AppResult<Vec<KnownWorkspace>> {
    migrate_recent_workspace_to_known(database_path)?;
    let connection = connect_at(database_path)?;
    let mut statement = connection.prepare(
        "
        SELECT workspace_root, name, last_opened_at
        FROM known_workspaces
        ORDER BY last_opened_at DESC, name ASC
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(KnownWorkspace {
            root: row.get(0)?,
            name: row.get(1)?,
            last_opened_at: row.get(2)?,
        })
    })?;
    let mut workspaces = Vec::new();
    for row in rows {
        workspaces.push(row?);
    }
    Ok(workspaces)
}

pub fn forget_known_workspace_at(database_path: &Path, root: &Path) -> AppResult<()> {
    connect_at(database_path)?.execute(
        "DELETE FROM known_workspaces WHERE workspace_root = ?1",
        params![workspace_key(root)],
    )?;
    Ok(())
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

        CREATE TABLE IF NOT EXISTS known_workspaces (
            workspace_root TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
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

fn delete_setting_at(database_path: &Path, key: &str) -> AppResult<()> {
    connect_at(database_path)?.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
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
        upsert_known_workspace_at(database_path, Path::new(&config.recent_workspace))?;
    }

    migrate_recent_workspace_to_known(database_path)?;

    let oss_path = config_dir.join("oss-settings.json");
    if get_setting_at(database_path, OSS_SETTINGS_KEY)?.is_none() && oss_path.exists() {
        let content = fs::read_to_string(oss_path)?;
        let settings = serde_json::from_str::<OssSettings>(&content)?;
        save_oss_settings_at(database_path, &settings)?;
    }

    Ok(())
}

fn migrate_recent_workspace_to_known(database_path: &Path) -> AppResult<()> {
    let Some(recent_workspace) = get_setting_at(database_path, RECENT_WORKSPACE_KEY)? else {
        return Ok(());
    };
    let recent_path = Path::new(&recent_workspace);
    // 只用 recent workspace 做已知知识库的兜底迁移，避免旧版本用户首次备份时漏掉当前知识库。
    upsert_known_workspace_at(database_path, recent_path)
}

fn load_database_location_config(app: &AppHandle) -> AppResult<Option<DatabaseLocationConfig>> {
    let path = database_location_config_path(app)?;
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).map(Some).map_err(Into::into),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn database_location_config_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_config_dir()?.join(DATABASE_LOCATION_FILE))
}

fn normalize_database_directory(path: &Path) -> AppResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err(AppError::Backup("数据库目录不能为空".to_string()));
    }
    if path.file_name().is_some_and(|name| name == DATABASE_FILE) {
        return Err(AppError::Backup(
            "请选择数据库文件所在目录，不要直接选择数据库文件".to_string(),
        ));
    }
    Ok(path.to_path_buf())
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
