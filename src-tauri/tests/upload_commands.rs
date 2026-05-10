use tempfile::tempdir;
use yuque_lake_notes_lib::models::{OssSettings, StorageProviderKind};
use yuque_lake_notes_lib::storage::local_store;
use yuque_lake_notes_lib::storage::s3::{
    build_file_object_key, build_image_object_key, build_public_url,
    build_resource_ref_with_encryption, parse_resource_ref_detail,
};

#[test]
fn builds_image_object_key_under_type_directory() {
    let key = build_image_object_key("images", "hello world.png");

    assert!(key.starts_with("images/"));
    assert!(key.ends_with(".png"));
    assert!(!key.contains(' '));
}

#[test]
fn builds_file_object_key_under_files_directory() {
    let key = build_file_object_key("files", "hello world.zip");

    assert!(key.starts_with("files/"));
    assert!(key.ends_with(".zip"));
    assert!(!key.contains(' '));
}

#[test]
fn builds_public_url_without_double_slashes() {
    let url = build_public_url("https://oss.example/base/", "/images/a.png");

    assert_eq!(url, "https://oss.example/base/images/a.png");
}

#[test]
fn builds_provider_aware_local_resource_reference() {
    let settings = OssSettings {
        active_provider: StorageProviderKind::Local,
        endpoint: String::new(),
        bucket: String::new(),
        region: "us-east-1".to_string(),
        access_key_id: String::new(),
        secret_access_key: String::new(),
        public_base_url: String::new(),
        force_path_style: true,
        image_prefix: "images".to_string(),
        file_prefix: "files".to_string(),
        backup_prefix: "backups".to_string(),
        default_export_resource_strategy: "bundle".to_string(),
        default_signed_url_ttl_seconds: 24 * 60 * 60,
        max_signed_url_ttl_seconds: 7 * 24 * 60 * 60,
        allow_signed_url_export: true,
        resource_preview_concurrency: 6,
        local: yuque_lake_notes_lib::models::LocalStorageSettings {
            root_directory: "/tmp/local-storage".to_string(),
            storage_id: "local".to_string(),
        },
        webdav: Default::default(),
    };

    let resource_ref = build_resource_ref_with_encryption(
        &settings,
        "images/a.png",
        "image",
        "a.png",
        10,
        "image/png",
        Some("fingerprint"),
    );
    let parsed = parse_resource_ref_detail(&resource_ref).unwrap();

    assert_eq!(parsed.provider, StorageProviderKind::Local);
    assert_eq!(parsed.storage_id, "local");
    assert_eq!(parsed.key, "images/a.png");
    assert_eq!(parsed.encryption.unwrap().key_fingerprint, "fingerprint");
}

#[test]
fn local_store_round_trips_object_bytes_and_rejects_parent_path() {
    let dir = tempdir().unwrap();
    let settings = yuque_lake_notes_lib::models::LocalStorageSettings {
        root_directory: dir.path().to_string_lossy().to_string(),
        storage_id: "local".to_string(),
    };

    local_store::put_object(&settings, "images/a.bin", vec![1, 2, 3]).unwrap();

    assert_eq!(
        local_store::get_object_bytes(&settings, "images/a.bin").unwrap(),
        vec![1, 2, 3]
    );
    assert_eq!(
        local_store::list_object_keys(&settings, "images").unwrap(),
        vec!["images/a.bin"]
    );
    assert!(local_store::get_object_bytes(&settings, "../secret.bin").is_err());
}

#[test]
fn local_connection_test_creates_storage_directory_without_probe_leftover() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("resource-storage");
    let settings = yuque_lake_notes_lib::models::LocalStorageSettings {
        root_directory: root.to_string_lossy().to_string(),
        storage_id: "local".to_string(),
    };

    local_store::test_connection(&settings).unwrap();

    assert!(root.is_dir());
    assert!(!root.join(".yuque-storage-test").exists());
}
