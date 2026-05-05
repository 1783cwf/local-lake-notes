use std::fs;

use chrono::Utc;
use tempfile::tempdir;
use yuque_lake_notes_lib::commands::backup::stage_restore_chain;
use yuque_lake_notes_lib::models::KnownWorkspace;
use yuque_lake_notes_lib::storage::backup_archive::{
    build_encrypted_archive, extract_encrypted_archive,
};
use yuque_lake_notes_lib::storage::backup_manifest::{
    build_full_manifest, build_incremental_manifest,
};

#[test]
fn encrypted_archive_hides_plaintext_paths_and_round_trips() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    fs::write(workspace.join("secret-note.lake"), "<p>secret content</p>").unwrap();
    let database = dir.path().join("db.sqlite3");
    fs::write(&database, "db").unwrap();
    let known = vec![KnownWorkspace {
        root: workspace.to_string_lossy().to_string(),
        name: "workspace".to_string(),
        last_opened_at: Utc::now().to_rfc3339(),
    }];
    let (manifest, files) = build_full_manifest(
        "0.1.0",
        "backup-id".to_string(),
        Utc::now(),
        "fingerprint".to_string(),
        &database,
        &known,
    )
    .unwrap();

    let encrypted = build_encrypted_archive(&manifest, &files, "very-secret-key").unwrap();

    let encrypted_text = String::from_utf8_lossy(&encrypted);
    assert!(!encrypted_text.contains("secret-note.lake"));
    assert!(!encrypted_text.contains("secret content"));

    let extracted = extract_encrypted_archive(&encrypted, "very-secret-key").unwrap();
    assert_eq!(extracted.manifest.backup_id, "backup-id");
    assert!(extracted
        .root
        .join("workspaces/workspace-0/secret-note.lake")
        .exists());
}

#[test]
fn staged_restore_replays_incremental_manifest_without_missing_unchanged_files() {
    let dir = tempdir().unwrap();
    let workspace = dir.path().join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    fs::write(workspace.join("a.lake"), "<p>a</p>").unwrap();
    fs::write(workspace.join("b.lake"), "<p>b</p>").unwrap();
    let database = dir.path().join("db.sqlite3");
    fs::write(&database, "db-v1").unwrap();
    let known = vec![KnownWorkspace {
        root: workspace.to_string_lossy().to_string(),
        name: "workspace".to_string(),
        last_opened_at: Utc::now().to_rfc3339(),
    }];
    let (full, full_files) = build_full_manifest(
        "0.1.0",
        "full-id".to_string(),
        Utc::now(),
        "fingerprint".to_string(),
        &database,
        &known,
    )
    .unwrap();
    let full_archive = build_encrypted_archive(&full, &full_files, "very-secret-key").unwrap();

    fs::write(workspace.join("b.lake"), "<p>b changed</p>").unwrap();
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
    assert!(incremental
        .files
        .iter()
        .any(|file| file.logical_path.ends_with("a.lake")));
    assert!(!changed_files
        .iter()
        .any(|file| file.entry.logical_path.ends_with("a.lake")));
    let incremental_archive =
        build_encrypted_archive(&incremental, &changed_files, "very-secret-key").unwrap();

    let full_extracted = extract_encrypted_archive(&full_archive, "very-secret-key").unwrap();
    let incremental_extracted =
        extract_encrypted_archive(&incremental_archive, "very-secret-key").unwrap();
    let stage = tempdir().unwrap();

    let latest =
        stage_restore_chain(&[full_extracted, incremental_extracted], stage.path()).unwrap();

    assert_eq!(latest.backup_id, "inc-id");
    assert_eq!(
        fs::read_to_string(stage.path().join("workspaces/workspace-0/a.lake")).unwrap(),
        "<p>a</p>"
    );
    assert_eq!(
        fs::read_to_string(stage.path().join("workspaces/workspace-0/b.lake")).unwrap(),
        "<p>b changed</p>"
    );
}
