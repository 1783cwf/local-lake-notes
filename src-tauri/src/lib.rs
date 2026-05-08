pub mod commands;
pub mod error;
pub mod models;
pub mod state;
pub mod storage;

use commands::backup::{
    create_backup, delete_backup, get_backup_key_status, list_backups, reset_backup_key,
    restore_backup, set_backup_key, verify_backup_key_status,
};
use commands::documents::{
    create_lake_document, create_multidimensional_table_document, create_spreadsheet_document,
    delete_lake_document, delete_multidimensional_table_document, delete_spreadsheet_document,
    export_pdf_from_html, read_external_excel_file, read_lake_document,
    read_multidimensional_table_document, read_spreadsheet_document, rename_lake_document,
    rename_multidimensional_table_document, rename_spreadsheet_document, write_export_bytes,
    write_export_file, write_lake_document, write_multidimensional_table_document,
    write_spreadsheet_document,
};
use commands::external::{download_external_file, open_external_url};
use commands::resource_key::{
    get_resource_key_status, reset_resource_key, set_resource_key, verify_resource_key_status,
};
use commands::resources::{
    create_temporary_resource_url, download_resource, prepare_resource_preview, read_resource_bytes,
};
use commands::settings::{
    get_database_location, get_oss_settings, save_database_location_settings, save_oss_settings,
};
use commands::upload::{upload_file, upload_image};
use commands::workspace::{
    create_lake_directory, create_workspace_root, delete_lake_directory, forget_workspace_root,
    get_recent_workspace, list_known_workspaces, list_lake_documents, move_workspace_item,
    rename_lake_directory, rename_workspace, save_workspace_order, set_workspace_root,
};
use state::AppState;
use storage::app_database::initialize_app_database;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager,
};

const OPEN_DEVTOOLS_MENU_ID: &str = "open-devtools";

fn configure_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let app_handle = app.handle();
    let menu = Menu::default(app_handle)?;
    let open_devtools = MenuItem::with_id(
        app_handle,
        OPEN_DEVTOOLS_MENU_ID,
        "打开开发者工具",
        true,
        Some("CmdOrCtrl+Alt+KeyI"),
    )?;

    let view_menu = menu
        .items()?
        .into_iter()
        .filter_map(|item| item.as_submenu().cloned())
        .find(|submenu| submenu.text().is_ok_and(|text| text == "View"));

    if let Some(view_menu) = view_menu {
        view_menu.append(&PredefinedMenuItem::separator(app_handle)?)?;
        view_menu.append(&open_devtools)?;
    } else {
        // Windows/Linux 没有默认 View 菜单时补一个，保持诊断入口在各平台一致可见。
        menu.append(&Submenu::with_items(
            app_handle,
            "View",
            true,
            &[&open_devtools],
        )?)?;
    }

    app.set_menu(menu)?;
    app.on_menu_event(|app_handle, event| {
        if event.id().as_ref() == OPEN_DEVTOOLS_MENU_ID {
            if let Some(window) = app_handle.get_webview_window("main") {
                window.open_devtools();
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            initialize_app_database(app.handle()).map_err(|error| {
                std::io::Error::new(std::io::ErrorKind::Other, error.to_string())
            })?;
            configure_app_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_recent_workspace,
            set_workspace_root,
            create_workspace_root,
            list_known_workspaces,
            forget_workspace_root,
            list_lake_documents,
            rename_workspace,
            create_lake_directory,
            rename_lake_directory,
            delete_lake_directory,
            save_workspace_order,
            move_workspace_item,
            create_lake_document,
            create_spreadsheet_document,
            create_multidimensional_table_document,
            rename_lake_document,
            rename_spreadsheet_document,
            rename_multidimensional_table_document,
            delete_lake_document,
            delete_spreadsheet_document,
            delete_multidimensional_table_document,
            read_lake_document,
            read_spreadsheet_document,
            read_multidimensional_table_document,
            read_external_excel_file,
            write_lake_document,
            write_spreadsheet_document,
            write_multidimensional_table_document,
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
            get_database_location,
            save_database_location_settings,
            open_external_url,
            upload_file,
            upload_image,
            get_resource_key_status,
            verify_resource_key_status,
            set_resource_key,
            reset_resource_key,
            get_backup_key_status,
            verify_backup_key_status,
            set_backup_key,
            reset_backup_key,
            list_backups,
            create_backup,
            restore_backup,
            delete_backup,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Local Lake Notes");
}
