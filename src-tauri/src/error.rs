use serde::ser::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("请先选择知识库目录")]
    MissingWorkspace,
    #[error("路径不在当前知识库目录内")]
    PathOutsideWorkspace,
    #[error("只支持 .lake 文档")]
    InvalidLakePath,
    #[error("无效的文件名")]
    InvalidFilename,
    #[error("OSS 设置不完整：{0}")]
    InvalidOssSettings(String),
    #[error("文件系统错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("JSON 错误：{0}")]
    Json(#[from] serde_json::Error),
    #[error("Tauri 错误：{0}")]
    Tauri(#[from] tauri::Error),
    #[error("目录遍历错误：{0}")]
    Walkdir(#[from] walkdir::Error),
    #[error("S3 上传失败：{0}")]
    S3(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
