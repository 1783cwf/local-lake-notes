use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::models::LocalStorageSettings;

pub fn put_object(settings: &LocalStorageSettings, key: &str, bytes: Vec<u8>) -> AppResult<()> {
    let path = object_path(settings, key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)?;
    Ok(())
}

pub fn get_object_bytes(settings: &LocalStorageSettings, key: &str) -> AppResult<Vec<u8>> {
    fs::read(object_path(settings, key)?).map_err(Into::into)
}

pub fn delete_object(settings: &LocalStorageSettings, key: &str) -> AppResult<()> {
    let path = object_path(settings, key)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn list_object_keys(settings: &LocalStorageSettings, prefix: &str) -> AppResult<Vec<String>> {
    let root = normalized_root(settings)?;
    let safe_prefix = sanitize_object_key(prefix)?;
    let start = if safe_prefix.as_os_str().is_empty() {
        root.clone()
    } else {
        root.join(&safe_prefix)
    };
    if !start.exists() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    for entry in walkdir::WalkDir::new(start).into_iter() {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|_| AppError::InvalidExternalUrl)?;
        keys.push(path_to_object_key(relative));
    }
    keys.sort();
    Ok(keys)
}

pub fn test_connection(settings: &LocalStorageSettings) -> AppResult<()> {
    let root = normalized_root(settings)?;
    fs::create_dir_all(&root)?;
    let probe = root.join(".yuque-storage-test");
    // 本地连接测试只验证目录可创建和可写，不保留探测文件，避免污染资源目录。
    fs::write(&probe, b"ok")?;
    fs::remove_file(&probe)?;
    Ok(())
}

pub fn object_path(settings: &LocalStorageSettings, key: &str) -> AppResult<PathBuf> {
    let root = normalized_root(settings)?;
    let safe_key = sanitize_object_key(key)?;
    if safe_key.as_os_str().is_empty() {
        return Err(AppError::InvalidExternalUrl);
    }
    let path = root.join(safe_key);
    // 本地存储 key 来自文档引用，必须显式保证最终路径仍在存储根目录内。
    if !path.starts_with(&root) {
        return Err(AppError::InvalidExternalUrl);
    }
    Ok(path)
}

fn normalized_root(settings: &LocalStorageSettings) -> AppResult<PathBuf> {
    if settings.root_directory.trim().is_empty() {
        return Err(AppError::InvalidOssSettings("本地存储目录".to_string()));
    }
    Ok(PathBuf::from(settings.root_directory.trim()))
}

fn sanitize_object_key(key: &str) -> AppResult<PathBuf> {
    let trimmed = key.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let mut path = PathBuf::new();
    for component in Path::new(trimmed).components() {
        match component {
            Component::Normal(value) => path.push(value),
            _ => return Err(AppError::InvalidExternalUrl),
        }
    }
    Ok(path)
}

fn path_to_object_key(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}
