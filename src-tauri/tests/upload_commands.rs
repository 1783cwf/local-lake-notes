use yuque_lake_notes_lib::storage::s3::{build_image_object_key, build_public_url};

#[test]
fn builds_image_object_key_under_type_directory() {
    let key = build_image_object_key("images", "hello world.png");

    assert!(key.starts_with("images/"));
    assert!(key.ends_with(".png"));
    assert!(!key.contains(' '));
}

#[test]
fn builds_public_url_without_double_slashes() {
    let url = build_public_url("https://oss.example/base/", "/images/a.png");

    assert_eq!(url, "https://oss.example/base/images/a.png");
}
