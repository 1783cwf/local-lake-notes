use tempfile::tempdir;
use yuque_lake_notes_lib::models::OssSettings;
use yuque_lake_notes_lib::storage::app_database::{
    load_oss_settings_at, load_recent_workspace_root_at, prune_workspace_order_path_at,
    read_workspace_order_at, rewrite_workspace_order_path_at, save_oss_settings_at,
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
