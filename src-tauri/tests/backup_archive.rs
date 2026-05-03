use std::fs;

use chrono::Utc;
use tempfile::tempdir;
use yuque_lake_notes_lib::models::KnownWorkspace;
use yuque_lake_notes_lib::storage::backup_archive::{
    build_encrypted_archive, extract_encrypted_archive,
};
use yuque_lake_notes_lib::storage::backup_manifest::build_full_manifest;

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
