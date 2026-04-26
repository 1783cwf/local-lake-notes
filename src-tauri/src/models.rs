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
pub struct OssSettings {
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub public_base_url: String,
    pub force_path_style: bool,
    pub image_prefix: String,
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
}
