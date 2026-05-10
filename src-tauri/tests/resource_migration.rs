use std::collections::HashMap;

use tempfile::tempdir;
use yuque_lake_notes_lib::commands::resource_migration::{
    collect_workspace_resource_refs, rewrite_workspace_resource_refs,
};

#[test]
fn scans_lake_and_multidimensional_table_resource_refs() {
    let dir = tempdir().unwrap();
    let lake_ref = "yuque-resource://notes/images/a.png?kind=image";
    let file_ref = "yuque-resource://notes/files/a.pdf?kind=file";
    let long_text_ref = "yuque-resource://notes/images/body.png?kind=image";
    std::fs::write(
        dir.path().join("a.lake"),
        format!(
            r#"<p><img src="{lake_ref}"></p><card name="file" value="data:%7B%22src%22%3A%22{}%22%7D"></card>"#,
            file_ref.replace(':', "%3A").replace('/', "%2F").replace('?', "%3F").replace('=', "%3D")
        ),
    )
    .unwrap();
    std::fs::write(
        dir.path().join("table.dbtable.json"),
        serde_json::json!({
            "kind": "multidimensional-table",
            "version": 1,
            "fields": [],
            "records": [{
                "id": "record-1",
                "values": {
                    "attachment": [{ "id": "a", "name": "a.pdf", "url": file_ref, "resourceRef": file_ref }],
                    "body": format!("<p><img src=\"{long_text_ref}\"></p>")
                },
                "createdAt": "2026-05-10T00:00:00.000Z",
                "updatedAt": "2026-05-10T00:00:00.000Z"
            }],
            "views": [],
            "activeViewId": "view-table"
        })
        .to_string(),
    )
    .unwrap();

    let refs = collect_workspace_resource_refs(dir.path()).unwrap();
    let values = refs
        .into_iter()
        .map(|(value, _, _)| value)
        .collect::<Vec<_>>();

    assert!(values.contains(&lake_ref.to_string()));
    assert!(values.contains(&file_ref.to_string()));
    assert!(values.contains(&long_text_ref.to_string()));
}

#[test]
fn rewrites_resource_refs_in_documents() {
    let dir = tempdir().unwrap();
    let source = "yuque-resource://notes/files/a.pdf?kind=file";
    let target = "yuque-resource://local/files/a.pdf?provider=local&kind=file";
    std::fs::write(
        dir.path().join("a.lake"),
        format!(r#"<p><a href="{source}">file</a></p>"#),
    )
    .unwrap();
    let mut replacements = HashMap::new();
    replacements.insert(source.to_string(), target.to_string());

    let rewritten = rewrite_workspace_resource_refs(dir.path(), &replacements).unwrap();

    assert_eq!(rewritten, vec!["a.lake"]);
    assert!(std::fs::read_to_string(dir.path().join("a.lake"))
        .unwrap()
        .contains("provider=local"));
}
