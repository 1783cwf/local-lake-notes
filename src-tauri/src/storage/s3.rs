use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::config::Builder as S3ConfigBuilder;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use chrono::Utc;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::OssSettings;

const FILE_UPLOAD_PREFIX: &str = "files";

pub fn build_image_object_key(prefix: &str, filename: &str) -> String {
    build_object_key(prefix, filename)
}

pub fn build_file_object_key(filename: &str) -> String {
    build_object_key(FILE_UPLOAD_PREFIX, filename)
}

fn build_object_key(prefix: &str, filename: &str) -> String {
    let safe_prefix = sanitize_path_segment(prefix).unwrap_or_else(|| "images".to_string());
    let safe_filename = sanitize_filename(filename);
    let extension = safe_filename
        .rsplit_once('.')
        .map(|(_, extension)| format!(".{extension}"))
        .unwrap_or_default();
    let now = Utc::now();
    format!(
        "{}/{}/{}/{}{}",
        safe_prefix.trim_matches('/'),
        now.format("%Y"),
        now.format("%m"),
        Uuid::new_v4(),
        extension
    )
}

pub fn build_public_url(base_url: &str, key: &str) -> String {
    format!(
        "{}/{}",
        base_url.trim_end_matches('/'),
        key.trim_start_matches('/')
    )
}

pub async fn put_object(
    settings: &OssSettings,
    key: &str,
    bytes: Vec<u8>,
    content_type: &str,
) -> AppResult<()> {
    let credentials = Credentials::new(
        settings.access_key_id.clone(),
        settings.secret_access_key.clone(),
        None,
        None,
        "yuque-lake-notes",
    );
    let shared_config = aws_config::defaults(BehaviorVersion::latest())
        .endpoint_url(settings.endpoint.clone())
        .region(Region::new(settings.region.clone()))
        .credentials_provider(credentials)
        .load()
        .await;
    let mut builder = S3ConfigBuilder::from(&shared_config);
    builder.set_force_path_style(Some(settings.force_path_style));
    let client = Client::from_conf(builder.build());

    client
        .put_object()
        .bucket(&settings.bucket)
        .key(key)
        .content_type(content_type)
        .body(ByteStream::from(bytes))
        .send()
        .await
        .map_err(|error| AppError::S3(error.to_string()))?;

    Ok(())
}

fn sanitize_path_segment(value: &str) -> Option<String> {
    let cleaned = value
        .split('/')
        .filter_map(|part| {
            let segment = sanitize_filename(part);
            if segment.is_empty() {
                None
            } else {
                Some(segment)
            }
        })
        .collect::<Vec<_>>()
        .join("/");

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn sanitize_filename(filename: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for character in filename.trim().chars() {
        let invalid = character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            );
        if invalid || character.is_whitespace() {
            if !last_dash && !output.is_empty() {
                output.push('-');
                last_dash = true;
            }
            continue;
        }
        output.push(character);
        last_dash = false;
    }
    output.trim_matches('-').to_string()
}
