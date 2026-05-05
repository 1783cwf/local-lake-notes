use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::models::{ResetResourceKeyInput, ResourceKeyStatus, SetResourceKeyInput};
use crate::storage::resource_key::{
    resource_key_status, set_resource_secret, verified_resource_key_status,
};

#[tauri::command]
pub fn get_resource_key_status(app: AppHandle) -> AppResult<ResourceKeyStatus> {
    resource_key_status(&app)
}

#[tauri::command]
pub fn verify_resource_key_status(app: AppHandle) -> AppResult<ResourceKeyStatus> {
    verified_resource_key_status(&app)
}

#[tauri::command]
pub fn set_resource_key(
    app: AppHandle,
    input: SetResourceKeyInput,
) -> AppResult<ResourceKeyStatus> {
    set_resource_secret(&app, &input.secret)
}

#[tauri::command]
pub fn reset_resource_key(
    app: AppHandle,
    input: ResetResourceKeyInput,
) -> AppResult<ResourceKeyStatus> {
    if !input.confirm_reset {
        return Err(AppError::Backup("重置资源密钥需要确认".to_string()));
    }
    set_resource_secret(&app, &input.secret)
}
