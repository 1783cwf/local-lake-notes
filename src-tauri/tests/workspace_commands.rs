use std::fs;

use tempfile::tempdir;
use yuque_lake_notes_lib::commands::documents::{
    create_document, create_document_at, safe_file_stem,
};
use yuque_lake_notes_lib::commands::workspace::{
    list_directories, list_documents, move_workspace_item_on_disk, resolve_existing_directory_path,
    resolve_existing_lake_path, resolve_writable_lake_path, safe_directory_name,
};
use yuque_lake_notes_lib::error::AppError;
use yuque_lake_notes_lib::models::MoveWorkspaceItemInput;

#[test]
fn lists_only_lake_documents_in_nested_directories() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("notes").join("b.lake"), "<p>b</p>").unwrap();
    fs::write(dir.path().join("skip.md"), "# skip").unwrap();

    let documents = list_documents(dir.path()).unwrap();

    assert_eq!(
        documents
            .iter()
            .map(|doc| doc.path.as_str())
            .collect::<Vec<_>>(),
        vec!["a.lake", "notes/b.lake"]
    );
}

#[test]
fn creates_unique_safe_lake_document() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("高级工程师的要求.lake"), "<p>old</p>").unwrap();

    let path = create_document(dir.path(), "高级工程师的要求").unwrap();

    assert_eq!(path, "高级工程师的要求-2.lake");
    assert!(dir.path().join(path).exists());
}

#[test]
fn lists_empty_directories_and_creates_document_inside_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("notes").join("deep")).unwrap();

    let path = create_document_at(dir.path(), "notes/deep", "新的 文档").unwrap();
    let directories = list_directories(dir.path()).unwrap();

    assert_eq!(path, "notes/deep/新的-文档.lake");
    assert_eq!(
        directories
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>(),
        vec!["notes", "notes/deep"]
    );
}

#[test]
fn rejects_path_traversal_and_non_lake_files() {
    let dir = tempdir().unwrap();

    assert!(resolve_writable_lake_path(dir.path(), "../x.lake").is_err());
    assert!(resolve_writable_lake_path(dir.path(), "x.md").is_err());
    assert!(resolve_writable_lake_path(dir.path(), "./x.lake").is_err());
    assert!(resolve_existing_directory_path(dir.path(), "../x").is_err());
    assert!(resolve_existing_directory_path(dir.path(), ".").is_err());
    assert!(resolve_existing_lake_path(dir.path(), "missing.lake").is_err());
}

#[test]
fn sanitizes_file_stems_without_dropping_chinese_text() {
    assert_eq!(
        safe_file_stem(" 高级 工程师/要求 ").unwrap(),
        "高级-工程师-要求"
    );
    assert_eq!(
        safe_directory_name(" 个人 学习/前端 ").unwrap(),
        "个人-学习-前端"
    );
}

#[test]
fn moves_root_document_into_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:a.lake".to_string(),
            target_parent_path: "notes".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert_eq!(moved.source_path, "a.lake");
    assert_eq!(moved.target_path, "notes/a.lake");
    assert!(!dir.path().join("a.lake").exists());
    assert_eq!(
        fs::read_to_string(dir.path().join("notes").join("a.lake")).unwrap(),
        "<p>a</p>"
    );
}

#[test]
fn moves_directory_tree_into_another_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("archive")).unwrap();
    fs::create_dir_all(dir.path().join("notes").join("deep")).unwrap();
    fs::write(
        dir.path().join("notes").join("deep").join("a.lake"),
        "<p>a</p>",
    )
    .unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "folder:notes".to_string(),
            target_parent_path: "archive".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert_eq!(moved.source_path, "notes");
    assert_eq!(moved.target_path, "archive/notes");
    assert!(!dir.path().join("notes").exists());
    assert!(dir
        .path()
        .join("archive")
        .join("notes")
        .join("deep")
        .join("a.lake")
        .exists());
}

#[test]
fn same_parent_move_only_reports_paths_for_order_update() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:a.lake".to_string(),
            target_parent_path: "".to_string(),
            order: vec!["document:a.lake".to_string()],
        },
    )
    .unwrap();

    assert_eq!(moved.source_path, "a.lake");
    assert_eq!(moved.target_path, "a.lake");
    assert!(dir.path().join("a.lake").exists());
}

#[test]
fn rejects_moving_directory_into_itself_or_child() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("notes").join("deep")).unwrap();

    for target_parent_path in ["notes", "notes/deep"] {
        let error = move_workspace_item_on_disk(
            dir.path(),
            &MoveWorkspaceItemInput {
                source_id: "folder:notes".to_string(),
                target_parent_path: target_parent_path.to_string(),
                order: vec![],
            },
        )
        .unwrap_err();

        assert!(matches!(error, AppError::InvalidWorkspaceMove(_)));
        assert!(dir.path().join("notes").join("deep").exists());
    }
}

#[test]
fn rejects_move_conflicts_and_missing_sources() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("notes").join("a.lake"), "<p>existing</p>").unwrap();

    let conflict = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:a.lake".to_string(),
            target_parent_path: "notes".to_string(),
            order: vec![],
        },
    )
    .unwrap_err();
    assert!(matches!(conflict, AppError::WorkspaceItemConflict(_)));
    assert_eq!(
        fs::read_to_string(dir.path().join("a.lake")).unwrap(),
        "<p>a</p>"
    );

    let missing = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:missing.lake".to_string(),
            target_parent_path: "".to_string(),
            order: vec![],
        },
    )
    .unwrap_err();
    assert!(matches!(missing, AppError::WorkspaceItemNotFound(_)));
}
