pub mod commands;
pub mod error;
pub mod models;
pub mod state;
pub mod storage;

use commands::documents::{create_lake_document, read_lake_document, write_lake_document};
use commands::settings::{get_oss_settings, save_oss_settings};
use commands::upload::upload_image;
use commands::workspace::{get_recent_workspace, list_lake_documents, set_workspace_root};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_recent_workspace,
            set_workspace_root,
            list_lake_documents,
            create_lake_document,
            read_lake_document,
            write_lake_document,
            get_oss_settings,
            save_oss_settings,
            upload_image,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Yuque Lake Notes");
}
