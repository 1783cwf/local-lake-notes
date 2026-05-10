use std::collections::HashSet;
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::{OssSettings, ResourceMigrationIssue, ResourceMigrationReference};
use crate::storage::object_store::{get_object_bytes, put_object, ObjectStoreTarget};
use crate::storage::resource_crypto::{
    decrypt_resource_bytes, encrypt_resource_bytes, RESOURCE_CIPHERTEXT_CONTENT_TYPE,
};
use crate::storage::resource_key::{active_resource_fingerprint, current_resource_secret};
use crate::storage::s3::{build_resource_ref_for_target, parse_resource_ref_detail};

const RESOURCE_CONTENT_TYPE: &str = "application/octet-stream";

#[derive(Debug, Clone)]
pub struct PlannedResourceMigration {
    pub resource_ref: String,
    pub next_resource_ref: String,
    pub key: String,
    pub source: ObjectStoreTarget,
    pub target: ObjectStoreTarget,
    pub size: u64,
    pub content_type: String,
}

pub async fn plan_resource_migrations(
    app: &AppHandle,
    settings: &OssSettings,
    refs: &[(String, String, String)],
    source: &ObjectStoreTarget,
    target: &ObjectStoreTarget,
) -> AppResult<(
    Vec<PlannedResourceMigration>,
    Vec<ResourceMigrationReference>,
    Vec<ResourceMigrationReference>,
    Vec<ResourceMigrationIssue>,
    Vec<ResourceMigrationIssue>,
)> {
    let mut seen_refs = HashSet::new();
    let mut planned = Vec::new();
    let mut migrated_resources = Vec::new();
    let mut skipped_resources = Vec::new();
    let mut unreadable_resources = Vec::new();
    let mut conflict_resources = Vec::new();

    for (resource_ref, document_path, location) in refs {
        let Ok(parsed) = parse_resource_ref_detail(resource_ref) else {
            unreadable_resources.push(ResourceMigrationIssue {
                resource_ref: resource_ref.clone(),
                document_path: document_path.clone(),
                message: "资源引用格式无效".to_string(),
            });
            continue;
        };

        let reference = ResourceMigrationReference {
            resource_ref: resource_ref.clone(),
            provider: parsed.provider.clone(),
            storage_id: parsed.storage_id.clone(),
            key: parsed.key.clone(),
            document_path: document_path.clone(),
            location: location.clone(),
        };

        if parsed.provider != source.provider || parsed.storage_id != source.storage_id {
            skipped_resources.push(reference);
            continue;
        }

        migrated_resources.push(reference);
        if !seen_refs.insert(resource_ref.clone()) {
            continue;
        }

        let source_bytes = match get_object_bytes(settings, source, &parsed.key).await {
            Ok(bytes) => bytes,
            Err(error) => {
                unreadable_resources.push(ResourceMigrationIssue {
                    resource_ref: resource_ref.clone(),
                    document_path: document_path.clone(),
                    message: error.to_string(),
                });
                continue;
            }
        };
        let plain_bytes = match decode_migration_resource_bytes(app, &source_bytes, &parsed) {
            Ok(bytes) => bytes,
            Err(error) => {
                unreadable_resources.push(ResourceMigrationIssue {
                    resource_ref: resource_ref.clone(),
                    document_path: document_path.clone(),
                    message: error.to_string(),
                });
                continue;
            }
        };
        let next_encryption = target_encryption_metadata(app, &target.provider, &parsed)?;
        let content_type = if next_encryption.is_some() {
            RESOURCE_CIPHERTEXT_CONTENT_TYPE.to_string()
        } else {
            parsed
                .content_type
                .clone()
                .unwrap_or_else(|| RESOURCE_CONTENT_TYPE.to_string())
        };

        if let Ok(target_bytes) = get_object_bytes(settings, target, &parsed.key).await {
            let target_resource = crate::storage::s3::ResourceRef {
                provider: target.provider.clone(),
                storage_id: target.storage_id.clone(),
                bucket: target.storage_id.clone(),
                key: parsed.key.clone(),
                kind: parsed.kind.clone(),
                name: parsed.name.clone(),
                size: parsed.size,
                content_type: parsed.content_type.clone(),
                encryption: next_encryption.clone(),
            };
            let target_plain_bytes =
                match decode_migration_resource_bytes(app, &target_bytes, &target_resource) {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        conflict_resources.push(ResourceMigrationIssue {
                            resource_ref: resource_ref.clone(),
                            document_path: document_path.clone(),
                            message: format!("目标存储已存在同名对象但无法读取：{error}"),
                        });
                        continue;
                    }
                };
            if blake3::hash(&target_plain_bytes) != blake3::hash(&plain_bytes) {
                conflict_resources.push(ResourceMigrationIssue {
                    resource_ref: resource_ref.clone(),
                    document_path: document_path.clone(),
                    message: "目标存储已存在同名对象但内容不同".to_string(),
                });
                continue;
            }
        }

        planned.push(PlannedResourceMigration {
            next_resource_ref: build_resource_ref_for_target(
                &target.provider,
                &target.storage_id,
                &parsed.key,
                &parsed.kind,
                parsed.name.as_deref(),
                parsed.size,
                parsed.content_type.as_deref(),
                next_encryption.as_ref(),
            ),
            resource_ref: resource_ref.clone(),
            key: parsed.key.clone(),
            source: source.clone(),
            target: target.clone(),
            size: plain_bytes.len() as u64,
            content_type,
        });
    }

    Ok((
        planned,
        migrated_resources,
        skipped_resources,
        unreadable_resources,
        conflict_resources,
    ))
}

pub async fn copy_planned_resources(
    app: &AppHandle,
    settings: &OssSettings,
    planned: &[PlannedResourceMigration],
) -> AppResult<usize> {
    for item in planned {
        let bytes = get_object_bytes(settings, &item.source, &item.key).await?;
        let parsed = parse_resource_ref_detail(&item.resource_ref)?;
        let plain_bytes = decode_migration_resource_bytes(app, &bytes, &parsed)?;
        let next_resource = parse_resource_ref_detail(&item.next_resource_ref)?;
        let stored_bytes = encode_migration_resource_bytes(
            app,
            &item.target.provider,
            &plain_bytes,
            next_resource.encryption.as_ref(),
        )?;
        put_object(
            settings,
            &item.target,
            &item.key,
            stored_bytes.clone(),
            &item.content_type,
        )
        .await?;
        let target_bytes = get_object_bytes(settings, &item.target, &item.key).await?;
        if blake3::hash(&stored_bytes) != blake3::hash(&target_bytes) {
            return Err(AppError::Backup(format!("资源迁移校验失败：{}", item.key)));
        }
    }
    Ok(planned.len())
}

fn decode_migration_resource_bytes(
    app: &AppHandle,
    bytes: &[u8],
    resource: &crate::storage::s3::ResourceRef,
) -> AppResult<Vec<u8>> {
    let Some(encryption) = resource.encryption.as_ref() else {
        return Ok(bytes.to_vec());
    };
    let secret = current_resource_secret(app, Some(&encryption.key_fingerprint))?;
    decrypt_resource_bytes(bytes, &secret)
}

fn encode_migration_resource_bytes(
    app: &AppHandle,
    provider: &crate::models::StorageProviderKind,
    plain_bytes: &[u8],
    encryption: Option<&crate::storage::s3::ResourceEncryptionMetadata>,
) -> AppResult<Vec<u8>> {
    if *provider == crate::models::StorageProviderKind::Local {
        return Ok(plain_bytes.to_vec());
    }
    let fingerprint = encryption
        .map(|metadata| metadata.key_fingerprint.clone())
        .unwrap_or(active_resource_fingerprint(app)?);
    let secret = current_resource_secret(app, Some(&fingerprint))?;
    encrypt_resource_bytes(plain_bytes, &secret)
}

fn target_encryption_metadata(
    app: &AppHandle,
    provider: &crate::models::StorageProviderKind,
    source: &crate::storage::s3::ResourceRef,
) -> AppResult<Option<crate::storage::s3::ResourceEncryptionMetadata>> {
    if *provider == crate::models::StorageProviderKind::Local {
        return Ok(None);
    }
    if let Some(encryption) = source.encryption.as_ref() {
        return Ok(Some(encryption.clone()));
    }
    Ok(Some(crate::storage::s3::ResourceEncryptionMetadata {
        algorithm: crate::storage::resource_crypto::RESOURCE_ENCRYPTION_ALGORITHM.to_string(),
        key_fingerprint: active_resource_fingerprint(app)?,
    }))
}
