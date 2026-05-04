use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub id: String,
    pub path: String,
    pub name: String,
    pub parent_path: String,
    pub modified_at: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDirectory {
    pub id: String,
    pub path: String,
    pub name: String,
    pub parent_path: String,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOrder {
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePayload {
    pub root: String,
    pub directories: Vec<WorkspaceDirectory>,
    pub documents: Vec<WorkspaceDocument>,
    pub order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentPayload {
    pub root: String,
    pub directories: Vec<WorkspaceDirectory>,
    pub documents: Vec<WorkspaceDocument>,
    pub order: Vec<String>,
    pub created_document: WorkspaceDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MoveWorkspaceItemInput {
    pub source_id: String,
    pub target_parent_path: String,
    pub order: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OssSettings {
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    #[serde(default)]
    pub public_base_url: String,
    pub force_path_style: bool,
    pub image_prefix: String,
    #[serde(default = "default_file_prefix")]
    pub file_prefix: String,
    #[serde(default = "default_backup_prefix")]
    pub backup_prefix: String,
    #[serde(default = "default_export_resource_strategy")]
    pub default_export_resource_strategy: String,
    #[serde(default = "default_signed_url_ttl_seconds")]
    pub default_signed_url_ttl_seconds: u64,
    #[serde(default = "default_max_signed_url_ttl_seconds")]
    pub max_signed_url_ttl_seconds: u64,
    #[serde(default = "default_allow_signed_url_export")]
    pub allow_signed_url_export: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageInput {
    pub bytes: Vec<u8>,
    pub filename: String,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageOutput {
    pub url: String,
    pub size: usize,
    pub filename: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePreviewInput {
    pub resource_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePreviewOutput {
    pub resource_ref: String,
    pub preview_url: String,
    pub local_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDownloadInput {
    pub resource_ref: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedResourceUrlInput {
    pub resource_ref: String,
    pub ttl_seconds: u64,
    pub filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignedResourceUrlOutput {
    pub url: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnownWorkspace {
    pub root: String,
    pub name: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupKeyStatus {
    pub configured: bool,
    pub needs_key: bool,
    pub fingerprint: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetBackupKeyInput {
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResetBackupKeyInput {
    pub secret: String,
    pub confirm_reset: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateBackupInput {
    pub force_full: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub id: String,
    pub backup_type: String,
    pub created_at: String,
    pub base_backup_id: Option<String>,
    pub key_fingerprint: String,
    pub encrypted_size: u64,
    pub archive_hash: String,
    pub object_key: String,
    pub can_restore: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupOperationOutput {
    pub record: BackupRecord,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupInput {
    pub backup_id: String,
    #[serde(default)]
    pub allow_key_mismatch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupOutput {
    pub restored_backup_id: String,
    pub restored_at: String,
    pub requires_restart: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackupInput {
    pub backup_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackupOutput {
    pub deleted_backup_ids: Vec<String>,
}

fn default_file_prefix() -> String {
    "files".to_string()
}

fn default_backup_prefix() -> String {
    "backups".to_string()
}

fn default_export_resource_strategy() -> String {
    "bundle".to_string()
}

fn default_signed_url_ttl_seconds() -> u64 {
    24 * 60 * 60
}

fn default_max_signed_url_ttl_seconds() -> u64 {
    7 * 24 * 60 * 60
}

fn default_allow_signed_url_export() -> bool {
    true
}
