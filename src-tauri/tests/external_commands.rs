use yuque_lake_notes_lib::commands::external::validate_external_url;

#[test]
fn accepts_http_external_urls() {
    assert_eq!(
        validate_external_url(" https://oss.example/files/a.zip ").unwrap(),
        "https://oss.example/files/a.zip"
    );
}

#[test]
fn rejects_non_http_external_urls() {
    assert!(validate_external_url("file:///tmp/a.zip").is_err());
    assert!(validate_external_url("javascript:alert(1)").is_err());
}
