pub mod commands;
pub mod error;
pub mod models;
pub mod state;
pub mod storage;

use commands::backup::{
    create_backup, delete_backup, get_backup_key_status, list_backups, reset_backup_key,
    restore_backup, set_backup_key,
};
use commands::documents::{
    create_lake_document, delete_lake_document, export_pdf_from_html, read_lake_document,
    rename_lake_document, write_export_bytes, write_export_file, write_lake_document,
};
use commands::external::{download_external_file, open_external_url};
use commands::resources::{
    create_temporary_resource_url, download_resource, prepare_resource_preview, read_resource_bytes,
};
use commands::settings::{get_oss_settings, save_oss_settings};
use commands::upload::{upload_file, upload_image};
use commands::workspace::{
    create_lake_directory, delete_lake_directory, get_recent_workspace, list_lake_documents,
    move_workspace_item, rename_lake_directory, rename_workspace, save_workspace_order,
    set_workspace_root,
};
use state::AppState;
use storage::app_database::initialize_app_database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            initialize_app_database(app.handle()).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error.to_string())
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_recent_workspace,
            set_workspace_root,
            list_lake_documents,
            rename_workspace,
            create_lake_directory,
            rename_lake_directory,
            delete_lake_directory,
            save_workspace_order,
            move_workspace_item,
            create_lake_document,
            rename_lake_document,
            delete_lake_document,
            read_lake_document,
            write_lake_document,
            write_export_file,
            write_export_bytes,
            export_pdf_from_html,
            download_external_file,
            prepare_resource_preview,
            download_resource,
            read_resource_bytes,
            create_temporary_resource_url,
            get_oss_settings,
            save_oss_settings,
            open_external_url,
            upload_file,
            upload_image,
            get_backup_key_status,
            set_backup_key,
            reset_backup_key,
            list_backups,
            create_backup,
            restore_backup,
            delete_backup,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Yuque Lake Notes");
}
