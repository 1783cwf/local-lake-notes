use std::fs;

use serde_json::Value;
use tempfile::tempdir;
use yuque_lake_notes_lib::commands::documents::{
    create_document, create_document_at, create_multidimensional_table,
    create_multidimensional_table_at, create_spreadsheet, create_spreadsheet_at,
    read_external_excel_file, rename_document_on_disk,
    resolve_existing_multidimensional_table_path, resolve_existing_spreadsheet_path,
    resolve_writable_multidimensional_table_path, resolve_writable_spreadsheet_path,
    safe_file_stem,
};
use yuque_lake_notes_lib::commands::workspace::{
    create_workspace_root_at, list_directories, list_documents, move_workspace_item_on_disk,
    resolve_existing_directory_path, resolve_existing_lake_path, resolve_writable_lake_path,
    safe_directory_name, DOCUMENT_CHILD_CONTAINER_MARKER,
};
use yuque_lake_notes_lib::error::AppError;
use yuque_lake_notes_lib::models::{MoveWorkspaceItemInput, WorkspaceDocumentKind};
use yuque_lake_notes_lib::models::GlobalTypographySettings;

const WORKBOOK_SNAPSHOT: &str =
    r#"{"sheetOrder":["sheet-0001"],"sheets":{"sheet-0001":{"id":"sheet-0001","name":"Sheet1"}}}"#;
const MULTIDIMENSIONAL_TABLE_SNAPSHOT: &str = r#"{"kind":"multidimensional-table","version":1,"fields":[],"records":[],"views":[],"activeViewId":"view-table"}"#;

#[test]
fn lists_lake_and_univer_snapshot_documents_in_nested_directories() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("notes").join("b.lake"), "<p>b</p>").unwrap();
    fs::write(
        dir.path().join("notes").join("budget.json"),
        WORKBOOK_SNAPSHOT,
    )
    .unwrap();
    fs::write(
        dir.path().join("notes").join("测试表格2.dbtable.json"),
        MULTIDIMENSIONAL_TABLE_SNAPSHOT,
    )
    .unwrap();
    fs::write(dir.path().join("notes").join("普通.json"), "{}").unwrap();
    fs::write(dir.path().join("skip.md"), "# skip").unwrap();

    let documents = list_documents(dir.path()).unwrap();

    assert_eq!(
        documents
            .iter()
            .map(|doc| (doc.path.as_str(), doc.kind.clone()))
            .collect::<Vec<_>>(),
        vec![
            ("a.lake", WorkspaceDocumentKind::Lake),
            ("notes/b.lake", WorkspaceDocumentKind::Lake),
            ("notes/budget.json", WorkspaceDocumentKind::Spreadsheet),
            (
                "notes/测试表格2.dbtable.json",
                WorkspaceDocumentKind::MultidimensionalTable
            ),
        ]
    );
}

#[test]
fn creates_unique_safe_lake_document() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试文件1.lake"), "<p>old</p>").unwrap();

    let path = create_document(dir.path(), "测试文件1").unwrap();

    assert_eq!(path, "测试文件1-2.lake");
    assert!(dir.path().join(path).exists());
}

#[test]
fn creates_unique_safe_spreadsheet_document() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试表格1.json"), WORKBOOK_SNAPSHOT).unwrap();

    let path = create_spreadsheet(dir.path(), "测试表格1").unwrap();

    assert_eq!(path, "测试表格1-2.json");
    assert!(dir.path().join(path).exists());
}

#[test]
fn creates_unique_safe_multidimensional_table_document() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("测试表格2.dbtable.json"),
        MULTIDIMENSIONAL_TABLE_SNAPSHOT,
    )
    .unwrap();

    let path = create_multidimensional_table(dir.path(), "测试表格2").unwrap();

    assert_eq!(path, "测试表格2-2.dbtable.json");
    assert!(dir.path().join(path).exists());
}

#[test]
fn creates_multidimensional_table_with_neutral_default_fields() {
    let dir = tempdir().unwrap();

    let path = create_multidimensional_table(dir.path(), "测试表格1").unwrap();
    let content = fs::read_to_string(dir.path().join(path)).unwrap();
    let snapshot = serde_json::from_str::<Value>(&content).unwrap();
    let field_names = snapshot["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|field| field["name"].as_str().unwrap())
        .collect::<Vec<_>>();
    let status_options = snapshot["fields"][1]["options"]
        .as_array()
        .unwrap()
        .iter()
        .map(|option| option["label"].as_str().unwrap())
        .collect::<Vec<_>>();

    assert_eq!(
        field_names,
        vec!["标题", "状态", "主要内容", "日期", "附件"]
    );
    assert_eq!(status_options, vec!["单选1", "单选2"]);
    assert_eq!(
        snapshot["views"][1]["cardFieldIds"],
        serde_json::json!(["description", "date", "attachment"])
    );
}

#[test]
fn renames_document_child_container_with_spreadsheet() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试表格1.json"), WORKBOOK_SNAPSHOT).unwrap();
    fs::create_dir_all(dir.path().join("测试表格1")).unwrap();
    fs::write(
        dir.path().join("测试表格1").join("测试文件2.lake"),
        "<p>api</p>",
    )
    .unwrap();

    let current_path = resolve_existing_spreadsheet_path(dir.path(), "测试表格1.json").unwrap();
    let renamed =
        rename_document_on_disk(dir.path(), current_path, "测试表格1.json", "测试表格2.json")
            .unwrap();

    assert_eq!(renamed.target_path, "测试表格2.json");
    assert_eq!(renamed.target_child_container_path, "测试表格2");
    assert!(renamed.moved_child_container);
    assert!(dir.path().join("测试表格2.json").exists());
    assert!(dir.path().join("测试表格2").join("测试文件2.lake").exists());
    assert!(dir
        .path()
        .join("测试表格2")
        .join(DOCUMENT_CHILD_CONTAINER_MARKER)
        .exists());
    assert!(!dir.path().join("测试表格1").exists());
}

#[test]
fn rejects_renaming_document_when_target_child_container_exists() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试表格1.json"), WORKBOOK_SNAPSHOT).unwrap();
    fs::create_dir_all(dir.path().join("测试表格1")).unwrap();
    fs::create_dir_all(dir.path().join("测试表格2")).unwrap();

    let current_path = resolve_existing_spreadsheet_path(dir.path(), "测试表格1.json").unwrap();
    let error =
        rename_document_on_disk(dir.path(), current_path, "测试表格1.json", "测试表格2.json")
            .unwrap_err();

    assert!(matches!(error, AppError::WorkspaceItemConflict(_)));
    assert!(dir.path().join("测试表格1.json").exists());
    assert!(dir.path().join("测试表格1").exists());
}

#[test]
fn marks_created_document_child_container() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试文件1.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("测试文件2.lake"), "<p>key</p>").unwrap();

    move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:测试文件2.lake".to_string(),
            target_parent_path: "测试文件1".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert!(dir
        .path()
        .join("测试文件1")
        .join(DOCUMENT_CHILD_CONTAINER_MARKER)
        .exists());
    assert!(list_directories(dir.path())
        .unwrap()
        .iter()
        .any(|directory| directory.path == "测试文件1" && directory.is_document_child_container));
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
fn creates_document_inside_missing_document_child_container() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("长文.lake"), "<p>a</p>").unwrap();

    let path = create_document_at(dir.path(), "长文", "第一部分").unwrap();

    assert_eq!(path, "长文/第一部分.lake");
    assert!(dir.path().join("长文").join("第一部分.lake").exists());
}

#[test]
fn creates_initial_lake_document_content_with_typography() {
    let content = yuque_lake_notes_lib::commands::documents::initial_lake_document_content(Some(
        GlobalTypographySettings {
            font_family: "Songti SC".to_string(),
            default_font_size: 22,
        },
    ))
    .unwrap();

    assert!(content.starts_with("<!--yuque-lake-notes:typography "));
    assert!(content.contains("\"fontFamily\":\"\\\"Songti SC\\\"\""));
    assert!(content.contains("\"defaultFontSize\":22"));
    assert!(content.contains("<p><span class=\"ne-text\"> </span></p>"));
}

#[test]
fn creates_spreadsheet_inside_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("reports")).unwrap();

    let path = create_spreadsheet_at(dir.path(), "reports", "测试 表格1").unwrap();

    assert_eq!(path, "reports/测试-表格1.json");
    assert!(dir.path().join(path).exists());
}

#[test]
fn creates_multidimensional_table_inside_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("projects")).unwrap();

    let path = create_multidimensional_table_at(dir.path(), "projects", "测试文件1").unwrap();

    assert_eq!(path, "projects/测试文件1.dbtable.json");
    assert!(dir.path().join(path).exists());
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
fn rejects_path_traversal_and_non_snapshot_files() {
    let dir = tempdir().unwrap();

    assert!(resolve_writable_spreadsheet_path(dir.path(), "../x.json").is_err());
    assert!(resolve_writable_spreadsheet_path(dir.path(), "x.lake").is_err());
    assert!(resolve_writable_spreadsheet_path(dir.path(), "x.xlsx").is_err());
    assert!(resolve_writable_spreadsheet_path(dir.path(), "./x.json").is_err());
    assert!(resolve_existing_spreadsheet_path(dir.path(), "missing.json").is_err());
}

#[test]
fn rejects_path_traversal_and_non_multidimensional_table_files() {
    let dir = tempdir().unwrap();

    assert!(resolve_writable_multidimensional_table_path(dir.path(), "../x.dbtable.json").is_err());
    assert!(resolve_writable_multidimensional_table_path(dir.path(), "x.json").is_err());
    assert!(resolve_writable_multidimensional_table_path(dir.path(), "x.lake").is_err());
    assert!(resolve_writable_multidimensional_table_path(dir.path(), "./x.dbtable.json").is_err());
    assert!(
        resolve_existing_multidimensional_table_path(dir.path(), "missing.dbtable.json").is_err()
    );
}

#[test]
fn reads_only_external_xlsx_bytes_for_excel_import() {
    let dir = tempdir().unwrap();
    let excel_path = dir.path().join("budget.xlsx");
    let json_path = dir.path().join("budget.json");
    fs::write(&excel_path, [1_u8, 2, 3]).unwrap();
    fs::write(&json_path, "{}").unwrap();

    assert_eq!(
        read_external_excel_file(excel_path.to_string_lossy().to_string()).unwrap(),
        vec![1_u8, 2, 3]
    );
    assert!(matches!(
        read_external_excel_file(json_path.to_string_lossy().to_string()),
        Err(AppError::InvalidExcelPath)
    ));
}

#[test]
fn sanitizes_file_stems_without_dropping_chinese_text() {
    assert_eq!(safe_file_stem(" 测试 文件/1 ").unwrap(), "测试-文件-1");
    assert_eq!(safe_directory_name(" 测试 目录/1 ").unwrap(), "测试-目录-1");
}

#[test]
fn creates_workspace_directory_inside_selected_parent() {
    let dir = tempdir().unwrap();

    let workspace = create_workspace_root_at(dir.path(), " 测试 目录1 ").unwrap();

    assert_eq!(
        workspace,
        dir.path().join("测试-目录1").canonicalize().unwrap()
    );
    assert!(workspace.is_dir());
}

#[test]
fn rejects_invalid_or_conflicting_workspace_directory_names() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("work")).unwrap();

    assert!(create_workspace_root_at(dir.path(), "  ").is_err());
    assert!(create_workspace_root_at(dir.path(), "../outside").is_err());
    assert!(create_workspace_root_at(dir.path(), "work").is_err());
}

#[test]
fn moves_root_document_into_directory() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("a.json"), WORKBOOK_SNAPSHOT).unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:a.json".to_string(),
            target_parent_path: "notes".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert_eq!(moved.source_path, "a.json");
    assert_eq!(moved.target_path, "notes/a.json");
    assert!(!dir.path().join("a.json").exists());
    assert_eq!(
        fs::read_to_string(dir.path().join("notes").join("a.json")).unwrap(),
        WORKBOOK_SNAPSHOT
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
fn moves_document_into_document_child_container() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("测试文件1.lake"), "<p>a</p>").unwrap();
    fs::write(dir.path().join("测试文件3.lake"), "<p>proxy</p>").unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:测试文件3.lake".to_string(),
            target_parent_path: "测试文件1".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert_eq!(moved.source_path, "测试文件3.lake");
    assert_eq!(moved.target_path, "测试文件1/测试文件3.lake");
    assert!(dir.path().join("测试文件1").join("测试文件3.lake").exists());
}

#[test]
fn moves_document_child_container_with_document() {
    let dir = tempdir().unwrap();
    fs::create_dir_all(dir.path().join("测试文件1")).unwrap();
    fs::write(dir.path().join("测试文件4.lake"), "<p>config</p>").unwrap();
    fs::write(dir.path().join("测试文件1.lake"), "<p>a</p>").unwrap();
    fs::write(
        dir.path().join("测试文件1").join("测试文件2.lake"),
        "<p>key</p>",
    )
    .unwrap();

    let moved = move_workspace_item_on_disk(
        dir.path(),
        &MoveWorkspaceItemInput {
            source_id: "document:测试文件1.lake".to_string(),
            target_parent_path: "测试文件4".to_string(),
            order: vec![],
        },
    )
    .unwrap();

    assert_eq!(moved.target_path, "测试文件4/测试文件1.lake");
    assert!(dir.path().join("测试文件4").join("测试文件1.lake").exists());
    assert!(dir
        .path()
        .join("测试文件4")
        .join("测试文件1")
        .join("测试文件2.lake")
        .exists());
    assert!(!dir.path().join("测试文件1").exists());
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
