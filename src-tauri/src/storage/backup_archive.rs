use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};

use age::secrecy::SecretString;
use tempfile::TempDir;

use crate::error::{AppError, AppResult};
use crate::storage::backup_manifest::{file_hash, BackupManifest, FileSnapshot};

const MANIFEST_PATH: &str = "manifest.json";

pub struct ExtractedBackup {
    _temp_dir: TempDir,
    pub root: PathBuf,
    pub manifest: BackupManifest,
}

pub fn build_encrypted_archive(
    manifest: &BackupManifest,
    files: &[FileSnapshot],
    secret: &str,
) -> AppResult<Vec<u8>> {
    let tar_bytes = build_tar_archive(manifest, files)?;
    let compressed = zstd::stream::encode_all(Cursor::new(tar_bytes), 3)
        .map_err(|error| AppError::Backup(format!("压缩备份包失败：{error}")))?;
    encrypt_age(&compressed, secret)
}

pub fn extract_encrypted_archive(bytes: &[u8], secret: &str) -> AppResult<ExtractedBackup> {
    let compressed = decrypt_age(bytes, secret)?;
    let tar_bytes = zstd::stream::decode_all(Cursor::new(compressed))
        .map_err(|error| AppError::Backup(format!("解压备份包失败：{error}")))?;
    let temp_dir = tempfile::tempdir()?;
    unpack_tar_archive(&tar_bytes, temp_dir.path())?;
    let manifest_path = temp_dir.path().join(MANIFEST_PATH);
    let manifest = serde_json::from_str::<BackupManifest>(&fs::read_to_string(&manifest_path)?)?;
    verify_extracted_files(temp_dir.path(), &manifest)?;
    Ok(ExtractedBackup {
        root: temp_dir.path().to_path_buf(),
        _temp_dir: temp_dir,
        manifest,
    })
}

fn build_tar_archive(manifest: &BackupManifest, files: &[FileSnapshot]) -> AppResult<Vec<u8>> {
    let mut builder = tar::Builder::new(Vec::new());
    let manifest_bytes = serde_json::to_vec_pretty(manifest)?;
    let mut header = tar::Header::new_gnu();
    header.set_size(manifest_bytes.len() as u64);
    header.set_cksum();
    builder.append_data(&mut header, MANIFEST_PATH, Cursor::new(manifest_bytes))?;

    for snapshot in files {
        validate_archive_logical_path(&snapshot.entry.logical_path)?;
        builder.append_path_with_name(&snapshot.source_path, &snapshot.entry.logical_path)?;
    }

    builder
        .into_inner()
        .map_err(|error| AppError::Backup(format!("生成备份归档失败：{error}")))
}

fn unpack_tar_archive(bytes: &[u8], destination: &Path) -> AppResult<()> {
    let mut archive = tar::Archive::new(Cursor::new(bytes));
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_path_buf();
        validate_archive_path(&path)?;
        let target = destination.join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        entry.unpack(target)?;
    }
    Ok(())
}

fn verify_extracted_files(root: &Path, manifest: &BackupManifest) -> AppResult<()> {
    for entry in &manifest.files {
        let path = root.join(&entry.logical_path);
        if path.exists() {
            let actual_hash = file_hash(&path)?;
            if actual_hash != entry.hash {
                return Err(AppError::Backup(format!(
                    "备份文件校验失败：{}",
                    entry.logical_path
                )));
            }
        }
    }
    Ok(())
}

fn encrypt_age(plain_bytes: &[u8], secret: &str) -> AppResult<Vec<u8>> {
    let encryptor = age::Encryptor::with_user_passphrase(SecretString::from(secret.to_string()));
    let mut encrypted = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut encrypted)
        .map_err(|error| AppError::Backup(format!("加密备份包失败：{error}")))?;
    writer
        .write_all(plain_bytes)
        .map_err(|error| AppError::Backup(format!("写入加密备份包失败：{error}")))?;
    writer
        .finish()
        .map_err(|error| AppError::Backup(format!("完成加密备份包失败：{error}")))?;
    Ok(encrypted)
}

fn decrypt_age(encrypted_bytes: &[u8], secret: &str) -> AppResult<Vec<u8>> {
    let decryptor = age::Decryptor::new(encrypted_bytes)
        .map_err(|error| AppError::Backup(format!("读取备份包加密头失败：{error}")))?;
    let identity = age::scrypt::Identity::new(SecretString::from(secret.to_string()));
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as _))
        .map_err(|error| AppError::Backup(format!("备份密钥不匹配或备份包已损坏：{error}")))?;
    let mut decrypted = Vec::new();
    reader
        .read_to_end(&mut decrypted)
        .map_err(|error| AppError::Backup(format!("解密备份包失败：{error}")))?;
    Ok(decrypted)
}

fn validate_archive_logical_path(path: &str) -> AppResult<()> {
    validate_archive_path(Path::new(path))
}

fn validate_archive_path(path: &Path) -> AppResult<()> {
    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => {
                return Err(AppError::Backup(
                    "备份归档路径不能包含上级目录或绝对路径".to_string(),
                ));
            }
        }
    }
    Ok(())
}
