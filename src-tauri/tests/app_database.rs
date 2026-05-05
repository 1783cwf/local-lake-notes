use tempfile::tempdir;
use yuque_lake_notes_lib::models::OssSettings;
use yuque_lake_notes_lib::storage::app_database::{
    clone_database_to_directory_at, list_known_workspaces_at, load_oss_settings_at,
    load_recent_workspace_root_at, prune_workspace_order_path_at, read_workspace_order_at,
    rewrite_workspace_order_items, rewrite_workspace_order_path_at, save_oss_settings_at,
    set_recent_workspace_root_at, set_workspace_order_at,
};

fn valid_settings() -> OssSettings {
    OssSettings {
        endpoint: "https://oss.example".to_string(),
        bucket: "notes".to_string(),
        region: "us-east-1".to_string(),
        access_key_id: "key".to_string(),
        secret_access_key: "secret".to_string(),
        public_base_url: "https://cdn.example".to_string(),
        force_path_style: true,
        image_prefix: "images".to_string(),
        file_prefix: "files".to_string(),
        backup_prefix: "backups".to_string(),
        default_export_resource_strategy: "bundle".to_string(),
        default_signed_url_ttl_seconds: 24 * 60 * 60,
        max_signed_url_ttl_seconds: 7 * 24 * 60 * 60,
        allow_signed_url_export: true,
    }
}

#[test]
fn stores_app_settings_in_sqlite() {
    let dir = tempdir().unwrap();
    let database = dir.path().join("app.sqlite3");
    let workspace = dir.path().join("workspace");

    set_recent_workspace_root_at(&database, &workspace).unwrap();
    save_oss_settings_at(&database, &valid_settings()).unwrap();

    assert_eq!(
        load_recent_workspace_root_at(&database).unwrap(),
        Some(workspace.to_string_lossy().to_string())
    );
    assert_eq!(
        load_oss_settings_at(&database).unwrap(),
        Some(valid_settings())
    );
}

#[test]
fn tracks_known_workspaces_from_recent_workspace() {
    let dir = tempdir().unwrap();
    let database = dir.path().join("app.sqlite3");
    let workspace = dir.path().join("workspace");

    set_recent_workspace_root_at(&database, &workspace).unwrap();

    let workspaces = list_known_workspaces_at(&database).unwrap();
    assert_eq!(workspaces.len(), 1);
    assert_eq!(workspaces[0].root, workspace.to_string_lossy());
    assert_eq!(workspaces[0].name, "workspace");
}

#[test]
fn stores_and_rewrites_workspace_order_in_sqlite() {
    let dir = tempdir().unwrap();
    let database = dir.path().join("app.sqlite3");
    let workspace = dir.path().join("workspace");
    let order = vec![
        "folder:notes".to_string(),
        "document:notes/a.lake".to_string(),
    ];

    set_workspace_order_at(&database, &workspace, &order).unwrap();
    rewrite_workspace_order_path_at(&database, &workspace, "notes", "archive").unwrap();

    assert_eq!(
        read_workspace_order_at(&database, &workspace).unwrap(),
        vec!["folder:archive", "document:archive/a.lake"]
    );

    prune_workspace_order_path_at(&database, &workspace, "archive").unwrap();
    assert!(read_workspace_order_at(&database, &workspace)
        .unwrap()
        .is_empty());
}

#[test]
fn copies_existing_database_when_switching_to_empty_directory() {
    let dir = tempdir().unwrap();
    let database = dir.path().join("app.sqlite3");
    let target_dir = dir.path().join("custom-db");
    let workspace = dir.path().join("workspace");

    set_recent_workspace_root_at(&database, &workspace).unwrap();

    let copied = clone_database_to_directory_at(&database, &target_dir).unwrap();

    assert_eq!(
        load_recent_workspace_root_at(&copied).unwrap(),
        Some(workspace.to_string_lossy().to_string())
    );
}

#[test]
fn rewrites_directory_subtree_order_items() {
    let order = vec![
        "folder:notes".to_string(),
        "folder:notes/deep".to_string(),
        "document:notes/deep/a.lake".to_string(),
        "document:other.lake".to_string(),
    ];

    assert_eq!(
        rewrite_workspace_order_items(&order, "notes", "archive/notes"),
        vec![
            "folder:archive/notes",
            "folder:archive/notes/deep",
            "document:archive/notes/deep/a.lake",
            "document:other.lake",
        ]
    );
}
