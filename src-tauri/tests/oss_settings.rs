use yuque_lake_notes_lib::commands::settings::validate_oss_settings;
use yuque_lake_notes_lib::models::OssSettings;

fn valid_settings() -> OssSettings {
    OssSettings {
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
