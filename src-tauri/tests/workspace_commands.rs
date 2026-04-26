use std::fs;

use tempfile::tempdir;
use yuque_lake_notes_lib::commands::documents::{create_document, safe_file_stem};
use yuque_lake_notes_lib::commands::workspace::{
    list_documents, resolve_existing_lake_path, resolve_writable_lake_path,
};

#[test]
fn lists_only_lake_documents_in_nested_directories() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("notes").join("b.lake"), "<p>b</p>").unwrap();
    fs::write(dir.path().join("skip.md"), "# skip").unwrap();

    let documents = list_documents(dir.path()).unwrap();

    assert_eq!(
        documents.iter().map(|doc| doc.path.as_str()).collect::<Vec<_>>(),
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
fn rejects_path_traversal_and_non_lake_files() {
    let dir = tempdir().unwrap();

    assert!(resolve_writable_lake_path(dir.path(), "../x.lake").is_err());
    assert!(resolve_writable_lake_path(dir.path(), "x.md").is_err());
    assert!(resolve_existing_lake_path(dir.path(), "missing.lake").is_err());
}

#[test]
fn sanitizes_file_stems_without_dropping_chinese_text() {
    assert_eq!(safe_file_stem(" 高级 工程师/要求 ").unwrap(), "高级-工程师-要求");
}
