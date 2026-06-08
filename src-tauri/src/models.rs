use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub id: String,
    pub path: String,
    pub name: String,
    pub parent_path: String,
    pub kind: WorkspaceDocumentKind,
    pub modified_at: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceDocumentKind {
    Lake,
    Spreadsheet,
    MultidimensionalTable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDirectory {
    pub id: String,
    pub path: String,
    pub name: String,
    pub parent_path: String,
    pub modified_at: Option<String>,
    pub is_document_child_container: bool,
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
    #[serde(default = "default_storage_provider")]
    pub active_provider: StorageProviderKind,
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
    #[serde(default = "default_resource_preview_concurrency")]
    pub resource_preview_concurrency: u8,
    #[serde(default)]
    pub local: LocalStorageSettings,
    #[serde(default)]
    pub webdav: WebDavStorageSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobalTypographySettings {
    #[serde(default = "default_typography_font_family")]
    pub font_family: String,
    #[serde(default = "default_typography_font_size")]
    pub default_font_size: u8,
}

impl Default for GlobalTypographySettings {
    fn default() -> Self {
        Self {
            font_family: default_typography_font_family(),
            default_font_size: default_typography_font_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StorageProviderKind {
    S3,
    Local,
    Webdav,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalStorageSettings {
    #[serde(default)]
    pub root_directory: String,
    #[serde(default = "default_local_storage_id")]
    pub storage_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebDavStorageSettings {
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub root_path: String,
    #[serde(default = "default_webdav_storage_id")]
    pub storage_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageConnectionTestOutput {
    pub provider: StorageProviderKind,
    pub storage_id: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiProtocol {
    OpenaiResponses,
    OpenaiChatCompletions,
    AnthropicMessages,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum AiModelCapabilityType {
    Vision,
    Web,
    Reasoning,
    Tool,
    Rerank,
    Embedding,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiInputModality {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default)]
    pub active_model_id: Option<String>,
    #[serde(default)]
    pub profiles: Vec<AiModelProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiModelProfile {
    pub id: String,
    pub name: String,
    pub protocol: AiProtocol,
    pub base_url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub models: Vec<AiConfiguredModel>,
    #[serde(default)]
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfiguredModel {
    pub id: String,
    pub profile_id: String,
    pub model_id: String,
    pub display_name: String,
    pub protocol: AiProtocol,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub capability_types: Vec<AiModelCapabilityType>,
    #[serde(default)]
    pub supported_input_modalities: Vec<AiInputModality>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileApiKeyInput {
    pub profile_id: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSettingsInput {
    pub settings: AiSettings,
    #[serde(default)]
    pub api_keys: Vec<AiProfileApiKeyInput>,
    #[serde(default)]
    pub deleted_profile_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiListModelsInput {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiFetchedModel {
    pub model_id: String,
    pub display_name: String,
    #[serde(default)]
    pub capability_types: Vec<AiModelCapabilityType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiListModelsOutput {
    pub profile_id: String,
    pub models: Vec<AiFetchedModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAddModelInput {
    pub profile_id: String,
    pub model_id: String,
    pub display_name: String,
    #[serde(default)]
    pub capability_types: Vec<AiModelCapabilityType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSetActiveModelInput {
    pub configured_model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiDocumentContentScope {
    Document,
    Selection,
}

impl Default for AiDocumentContentScope {
    fn default() -> Self {
        Self::Document
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiDocumentActionType {
    SummarizeDocument,
    AnswerQuestion,
    GenerateTitle,
    GenerateAbstract,
    GenerateTodos,
    GenerateMeetingMinutes,
    Rewrite,
    Polish,
    Expand,
    Compress,
    OrganizeHeadings,
    OutlineToDraft,
    NotesToArticle,
    LongFormStructure,
    TechToTutorial,
    TechToReadme,
    TechToReleaseNotes,
    CustomEdit,
    SplitDocument,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiActionPreviewMode {
    Informational,
    ReplaceDocument,
    Patch,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunDocumentActionInput {
    pub action_type: AiDocumentActionType,
    pub document_title: String,
    pub content: String,
    #[serde(default)]
    pub instruction: String,
    #[serde(default)]
    pub content_scope: AiDocumentContentScope,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunDocumentActionOutput {
    pub action_type: AiDocumentActionType,
    pub title: String,
    pub content: String,
    pub preview_mode: AiActionPreviewMode,
    pub content_scope: AiDocumentContentScope,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<AiDocumentPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiDocumentPatch {
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub operations: Vec<AiDocumentPatchOperation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AiDocumentPatchOperation {
    ReplaceSelection {
        markdown: String,
        #[serde(default)]
        summary: String,
    },
    InsertBefore {
        anchor: String,
        markdown: String,
        #[serde(default)]
        summary: String,
    },
    InsertAfter {
        anchor: String,
        markdown: String,
        #[serde(default)]
        summary: String,
    },
    ReplaceText {
        anchor: String,
        markdown: String,
        #[serde(default)]
        summary: String,
    },
    DeleteText {
        anchor: String,
        #[serde(default)]
        summary: String,
    },
    PrependDocument {
        markdown: String,
        #[serde(default)]
        summary: String,
    },
    AppendDocument {
        markdown: String,
        #[serde(default)]
        summary: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSplitDocumentInput {
    pub document_title: String,
    pub content: String,
    #[serde(default)]
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSplitDocumentPart {
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSplitDocumentOutput {
    pub title: String,
    pub parts: Vec<AiSplitDocumentPart>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiTableActionType {
    GenerateFields,
    CreateRecords,
    ExtractTasks,
    SummarizeTable,
    SuggestTagsStatus,
    MeetingToTaskBoard,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunTableActionInput {
    pub action_type: AiTableActionType,
    pub table_title: String,
    pub table_json: String,
    #[serde(default)]
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunTableActionOutput {
    pub action_type: AiTableActionType,
    pub title: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<AiTablePatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiTablePatch {
    #[serde(default)]
    pub fields: Vec<AiTableFieldCandidate>,
    #[serde(default)]
    pub records: Vec<AiTableRecordCandidate>,
    #[serde(default)]
    pub prefer_board: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiTableFieldCandidate {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: AiTableFieldCandidateType,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiTableFieldCandidateType {
    Text,
    LongText,
    SingleSelect,
    MultiSelect,
    Number,
    Progress,
    Time,
    Url,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiTableRecordCandidate {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub values: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiSpreadsheetActionType {
    CreateSheet,
    AppendRows,
    SummarizeSpreadsheet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunSpreadsheetActionInput {
    pub action_type: AiSpreadsheetActionType,
    pub spreadsheet_title: String,
    pub workbook_json: String,
    #[serde(default)]
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiRunSpreadsheetActionOutput {
    pub action_type: AiSpreadsheetActionType,
    pub title: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<AiSpreadsheetPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSpreadsheetPatch {
    #[serde(default)]
    pub sheets: Vec<AiSpreadsheetSheetCandidate>,
    #[serde(default)]
    pub append_rows: Vec<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSpreadsheetSheetCandidate {
    pub name: String,
    #[serde(default)]
    pub rows: Vec<Vec<serde_json::Value>>,
}

impl Default for StorageProviderKind {
    fn default() -> Self {
        Self::S3
    }
}

impl Default for LocalStorageSettings {
    fn default() -> Self {
        Self {
            root_directory: String::new(),
            storage_id: default_local_storage_id(),
        }
    }
}

impl Default for WebDavStorageSettings {
    fn default() -> Self {
        Self {
            endpoint: String::new(),
            username: String::new(),
            password: String::new(),
            root_path: String::new(),
            storage_id: default_webdav_storage_id(),
        }
    }
}

impl OssSettings {
    pub fn active_storage_id(&self) -> String {
        match self.active_provider {
            StorageProviderKind::S3 => self.bucket.trim().to_string(),
            StorageProviderKind::Local => normalized_storage_id(&self.local.storage_id, "local"),
            StorageProviderKind::Webdav => normalized_storage_id(&self.webdav.storage_id, "webdav"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseLocationSettings {
    pub directory: String,
    pub database_path: String,
    pub custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveDatabaseLocationInput {
    pub directory: String,
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
pub struct ResourceKeyStatus {
    pub configured: bool,
    pub needs_key: bool,
    pub fingerprint: Option<String>,
    pub created_at: Option<String>,
    #[serde(default)]
    pub known_fingerprints: Vec<String>,
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
pub struct SetResourceKeyInput {
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResetResourceKeyInput {
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationTargetInput {
    pub provider: StorageProviderKind,
    pub storage_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationInput {
    pub source: ResourceMigrationTargetInput,
    pub target: ResourceMigrationTargetInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationReference {
    pub resource_ref: String,
    pub provider: StorageProviderKind,
    pub storage_id: String,
    pub key: String,
    pub document_path: String,
    pub location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationIssue {
    pub resource_ref: String,
    pub document_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationAnalysisOutput {
    pub total_references: usize,
    pub unique_resources: usize,
    pub document_count: usize,
    pub total_bytes: u64,
    pub migrated_resources: Vec<ResourceMigrationReference>,
    pub skipped_resources: Vec<ResourceMigrationReference>,
    pub unreadable_resources: Vec<ResourceMigrationIssue>,
    pub conflict_resources: Vec<ResourceMigrationIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMigrationRunOutput {
    pub analysis: ResourceMigrationAnalysisOutput,
    pub rewritten_documents: Vec<String>,
    pub copied_resources: usize,
}

fn default_file_prefix() -> String {
    "files".to_string()
}

fn default_storage_provider() -> StorageProviderKind {
    StorageProviderKind::S3
}

fn default_local_storage_id() -> String {
    "local".to_string()
}

fn default_webdav_storage_id() -> String {
    "webdav".to_string()
}

fn normalized_storage_id(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
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

pub fn default_resource_preview_concurrency() -> u8 {
    6
}

pub fn default_typography_font_family() -> String {
    "system-ui".to_string()
}

pub fn default_typography_font_size() -> u8 {
    19
}

fn default_true() -> bool {
    true
}
