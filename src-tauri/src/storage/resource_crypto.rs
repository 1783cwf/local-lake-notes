use std::io::{Read, Write};

use age::secrecy::SecretString;

use crate::error::{AppError, AppResult};

pub const RESOURCE_CIPHERTEXT_CONTENT_TYPE: &str = "application/vnd.local-lake.resource+age";
pub const RESOURCE_ENCRYPTION_ALGORITHM: &str = "age-v1";

pub fn encrypt_resource_bytes(plain_bytes: &[u8], secret: &str) -> AppResult<Vec<u8>> {
    let encryptor = age::Encryptor::with_user_passphrase(SecretString::from(secret.to_string()));
    let mut encrypted = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut encrypted)
        .map_err(|error| AppError::Backup(format!("加密资源失败：{error}")))?;
    writer
        .write_all(plain_bytes)
        .map_err(|error| AppError::Backup(format!("写入加密资源失败：{error}")))?;
    writer
        .finish()
        .map_err(|error| AppError::Backup(format!("完成资源加密失败：{error}")))?;
    Ok(encrypted)
}

pub fn decrypt_resource_bytes(encrypted_bytes: &[u8], secret: &str) -> AppResult<Vec<u8>> {
    let decryptor = age::Decryptor::new(encrypted_bytes)
        .map_err(|error| AppError::Backup(format!("读取资源加密头失败：{error}")))?;
    let identity = age::scrypt::Identity::new(SecretString::from(secret.to_string()));
    let mut reader = decryptor
        .decrypt(std::iter::once(&identity as _))
        .map_err(|error| AppError::Backup(format!("资源密钥不匹配或资源已损坏：{error}")))?;
    let mut decrypted = Vec::new();
    reader
        .read_to_end(&mut decrypted)
        .map_err(|error| AppError::Backup(format!("解密资源失败：{error}")))?;
    Ok(decrypted)
}

#[cfg(test)]
mod tests {
    use super::{decrypt_resource_bytes, encrypt_resource_bytes};

    #[test]
    fn resource_bytes_round_trip() {
        let plain = b"\x00\x01local image bytes\xff";
        let encrypted = encrypt_resource_bytes(plain, "resource-secret-key").unwrap();

        assert_ne!(encrypted, plain);
        assert_eq!(
            decrypt_resource_bytes(&encrypted, "resource-secret-key").unwrap(),
            plain
        );
    }

    #[test]
    fn wrong_secret_rejects_resource() {
        let encrypted = encrypt_resource_bytes(b"content", "resource-secret-key").unwrap();

        assert!(decrypt_resource_bytes(&encrypted, "other-secret-key").is_err());
    }
}
