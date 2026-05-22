use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::storage::app_database::{load_ai_profile_secrets, save_ai_profile_secrets};

pub fn current_ai_profile_secret(app: &AppHandle, profile_id: &str) -> AppResult<String> {
    let profile_id = normalized_profile_id(profile_id)?;
    load_ai_profile_secrets(app)?
        .get(&profile_id)
        .filter(|secret| !secret.trim().is_empty())
        .cloned()
        .ok_or_else(|| AppError::Ai("请先配置模型 API Key".to_string()))
}

pub fn save_ai_profile_secret(app: &AppHandle, profile_id: &str, secret: &str) -> AppResult<()> {
    let profile_id = normalized_profile_id(profile_id)?;
    let secret = secret.trim();
    if secret.is_empty() {
        return Err(AppError::Ai("模型 API Key 不能为空".to_string()));
    }

    let mut secrets = load_ai_profile_secrets(app)?;
    // 模型 Key 只存应用数据库，避免系统凭据授权弹窗打断 AI 调用。
    secrets.insert(profile_id, secret.to_string());
    save_ai_profile_secrets(app, &secrets)
}

pub fn delete_ai_profile_secret(app: &AppHandle, profile_id: &str) -> AppResult<()> {
    let profile_id = normalized_profile_id(profile_id)?;
    let mut secrets = load_ai_profile_secrets(app)?;
    secrets.remove(&profile_id);
    save_ai_profile_secrets(app, &secrets)
}

fn normalized_profile_id(profile_id: &str) -> AppResult<String> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return Err(AppError::Ai("模型配置 ID 不能为空".to_string()));
    }
    Ok(profile_id.to_string())
}
