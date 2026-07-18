use yuque_lake_notes_lib::commands::settings::{
    create_global_typography_settings, normalize_font_family, normalize_typography_settings,
    validate_oss_settings,
};
use yuque_lake_notes_lib::models::{
    GlobalTypographySettings, ImageOptimizationMode, OssSettings, StorageProviderKind,
};

fn valid_settings() -> OssSettings {
    OssSettings {
        active_provider: StorageProviderKind::S3,
        endpoint: "https://s3.example.com".to_string(),
        bucket: "notes".to_string(),
        region: "us-east-1".to_string(),
        access_key_id: "ak".to_string(),
        secret_access_key: "sk".to_string(),
        public_base_url: "https://cdn.example.com".to_string(),
        force_path_style: true,
        image_prefix: "images".to_string(),
        file_prefix: "files".to_string(),
        backup_prefix: "backups".to_string(),
        default_export_resource_strategy: "bundle".to_string(),
        default_signed_url_ttl_seconds: 24 * 60 * 60,
        max_signed_url_ttl_seconds: 7 * 24 * 60 * 60,
        allow_signed_url_export: true,
        resource_preview_concurrency: 6,
        image_optimization: ImageOptimizationMode::Balanced,
        local: Default::default(),
        webdav: Default::default(),
    }
}

#[test]
fn validates_required_oss_fields() {
    let mut settings = valid_settings();
    settings.bucket.clear();

    assert!(validate_oss_settings(&settings).is_err());
}

#[test]
fn accepts_complete_oss_settings() {
    assert!(validate_oss_settings(&valid_settings()).is_ok());
}

#[test]
fn accepts_local_storage_settings() {
    let mut settings = valid_settings();
    settings.active_provider = StorageProviderKind::Local;
    settings.bucket.clear();
    settings.access_key_id.clear();
    settings.secret_access_key.clear();
    settings.local.root_directory = "/tmp/local-lake-storage".to_string();

    assert!(validate_oss_settings(&settings).is_ok());
}

#[test]
fn validates_local_storage_directory() {
    let mut settings = valid_settings();
    settings.active_provider = StorageProviderKind::Local;

    assert!(validate_oss_settings(&settings).is_err());
}

#[test]
fn rejects_signed_url_as_default_for_local_storage() {
    let mut settings = valid_settings();
    settings.active_provider = StorageProviderKind::Local;
    settings.local.root_directory = "/tmp/local-lake-storage".to_string();
    settings.default_export_resource_strategy = "signed-url".to_string();

    assert!(validate_oss_settings(&settings).is_err());
}

#[test]
fn validates_resource_preview_concurrency_range() {
    let mut settings = valid_settings();
    settings.resource_preview_concurrency = 9;

    assert!(validate_oss_settings(&settings).is_err());
}

#[test]
fn legacy_settings_default_to_original_image_optimization() {
    let mut value = serde_json::to_value(valid_settings()).unwrap();
    value.as_object_mut().unwrap().remove("imageOptimization");

    let settings: OssSettings = serde_json::from_value(value).unwrap();

    assert_eq!(settings.image_optimization, ImageOptimizationMode::Original);
}

#[test]
fn normalizes_typography_settings() {
    let settings = create_global_typography_settings("Songti SC, serif", 22).unwrap();

    assert_eq!(settings.font_family, "\"Songti SC\", serif");
    assert_eq!(settings.default_font_size, 22);
}

#[test]
fn rejects_unsupported_typography_font_size() {
    let error = normalize_typography_settings(GlobalTypographySettings {
        font_family: "Songti SC".to_string(),
        default_font_size: 18,
    })
    .unwrap_err();

    assert!(error.to_string().contains("默认字号"));
}

#[test]
fn drops_dangerous_typography_font_family_parts() {
    assert_eq!(normalize_font_family("Songti SC; color:red"), None);
    assert_eq!(
        normalize_font_family("Songti SC, serif").as_deref(),
        Some("\"Songti SC\", serif")
    );
}
