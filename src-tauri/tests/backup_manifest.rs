use std::fs;

use chrono::Utc;
use tempfile::tempdir;
use yuque_lake_notes_lib::models::KnownWorkspace;
use yuque_lake_notes_lib::storage::backup_manifest::{
    build_full_manifest, build_incremental_manifest,
};

#[test]
fn builds_full_and_incremental_manifests() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    fs::write(workspace.join("a.lake"), "<p>a</p>").unwrap();
    fs::write(workspace.join("budget.json"), r#"{"sheetOrder":["sheet-0001"],"sheets":{"sheet-0001":{"id":"sheet-0001","name":"Sheet1"}}}"#).unwrap();
    fs::write(workspace.join("~$budget.json"), b"temporary").unwrap();
    let database = dir.path().join("db.sqlite3");
    fs::write(&database, "db-v1").unwrap();
    let known = vec![KnownWorkspace {
        root: workspace.to_string_lossy().to_string(),
        name: "workspace".to_string(),
        last_opened_at: Utc::now().to_rfc3339(),
    }];

    let (full, _) = build_full_manifest(
        "0.1.0",
        "full-id".to_string(),
        Utc::now(),
        "fingerprint".to_string(),
        &database,
        &known,
    )
    .unwrap();

    fs::write(workspace.join("a.lake"), "<p>changed</p>").unwrap();
    fs::write(workspace.join("b.lake"), "<p>b</p>").unwrap();
    let (incremental, changed_files) = build_incremental_manifest(
        "0.1.0",
        "inc-id".to_string(),
        full.backup_id.clone(),
        Utc::now(),
        "fingerprint".to_string(),
        &database,
        &known,
        &full,
    )
    .unwrap();

    assert_eq!(incremental.backup_type, "incremental");
    assert!(incremental
        .files
        .iter()
        .any(|entry| entry.logical_path.ends_with("a.lake")));
    assert!(incremental
        .files
        .iter()
        .any(|entry| entry.logical_path.ends_with("budget.json")));
    assert!(!incremental
        .files
        .iter()
        .any(|entry| entry.logical_path.ends_with("~$budget.json")));
    assert!(changed_files
        .iter()
        .any(|file| file.entry.logical_path.ends_with("b.lake")));
}

#[test]
fn full_manifest_includes_multiple_known_workspaces() {
    let dir = tempdir().unwrap();
    let work = dir.path().join("work");
    let common = dir.path().join("common");
    fs::create_dir_all(&work).unwrap();
    fs::create_dir_all(common.join("nested")).unwrap();
    fs::write(work.join("a.lake"), "<p>work</p>").unwrap();
    fs::write(common.join("nested/a.lake"), "<p>common</p>").unwrap();
    let database = dir.path().join("db.sqlite3");
    fs::write(&database, "db-v1").unwrap();
    let known = vec![
        KnownWorkspace {
            root: work.to_string_lossy().to_string(),
            name: "work".to_string(),
            last_opened_at: Utc::now().to_rfc3339(),
        },
        KnownWorkspace {
            root: common.to_string_lossy().to_string(),
            name: "common".to_string(),
            last_opened_at: Utc::now().to_rfc3339(),
        },
    ];

    let (manifest, files) = build_full_manifest(
        "0.1.0",
        "full-id".to_string(),
        Utc::now(),
        "fingerprint".to_string(),
        &database,
        &known,
    )
    .unwrap();

    assert_eq!(manifest.workspaces.len(), 2);
    assert_eq!(manifest.workspaces[0].id, "workspace-0");
    assert_eq!(manifest.workspaces[1].id, "workspace-1");
    assert!(manifest
        .files
        .iter()
        .any(|entry| entry.logical_path == "workspaces/workspace-0/a.lake"));
    assert!(manifest
        .files
        .iter()
        .any(|entry| entry.logical_path == "workspaces/workspace-1/nested/a.lake"));
    assert!(files
        .iter()
        .any(|file| file.entry.logical_path == "workspaces/workspace-1/nested/a.lake"));
}
