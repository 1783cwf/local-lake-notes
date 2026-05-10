use crate::error::{AppError, AppResult};
use crate::models::WebDavStorageSettings;

pub async fn put_object(
    settings: &WebDavStorageSettings,
    key: &str,
    bytes: Vec<u8>,
    content_type: &str,
) -> AppResult<()> {
    let client = webdav_client()?;
    ensure_parent_collections(&client, settings, key).await?;
    let response = client
        .put(parsed_object_url(settings, key)?)
        .basic_auth(settings.username.trim(), Some(settings.password.trim()))
        .header("content-type", content_type)
        .body(bytes)
        .send()
        .await
        .map_err(|error| AppError::Webdav(format!("上传请求失败：{error}")))?;
    ensure_success(response.status(), "WebDAV 上传失败")
}

pub async fn get_object_bytes(settings: &WebDavStorageSettings, key: &str) -> AppResult<Vec<u8>> {
    let client = webdav_client()?;
    let response = client
        .get(parsed_object_url(settings, key)?)
        .basic_auth(settings.username.trim(), Some(settings.password.trim()))
        .send()
        .await
        .map_err(|error| AppError::Webdav(format!("读取请求失败：{error}")))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Webdav(format!("读取失败：HTTP {status}")));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| AppError::Webdav(format!("读取响应失败：{error}")))
}

pub async fn delete_object(settings: &WebDavStorageSettings, key: &str) -> AppResult<()> {
    let client = webdav_client()?;
    let response = client
        .delete(parsed_object_url(settings, key)?)
        .basic_auth(settings.username.trim(), Some(settings.password.trim()))
        .send()
        .await
        .map_err(|error| AppError::Webdav(format!("删除请求失败：{error}")))?;
    if response.status().as_u16() == 404 {
        return Ok(());
    }
    ensure_success(response.status(), "WebDAV 删除失败")
}

pub async fn list_object_keys(
    settings: &WebDavStorageSettings,
    prefix: &str,
) -> AppResult<Vec<String>> {
    let client = webdav_client()?;
    let safe_prefix = normalize_key(prefix)?;
    let response = client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND")
                .map_err(|error| AppError::Webdav(error.to_string()))?,
            parsed_object_url(settings, &safe_prefix)?,
        )
        .basic_auth(settings.username.trim(), Some(settings.password.trim()))
        .header("Depth", "infinity")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype /></prop></propfind>"#)
        .send()
        .await
        .map_err(|error| AppError::Webdav(format!("列表请求失败：{error}")))?;
    let status = response.status();
    if status.as_u16() == 404 {
        return Ok(Vec::new());
    }
    if !status.is_success() && status.as_u16() != 207 {
        return Err(AppError::Webdav(format!("列表读取失败：HTTP {status}")));
    }
    let body = response
        .text()
        .await
        .map_err(|error| AppError::Webdav(format!("列表响应失败：{error}")))?;
    Ok(parse_multistatus_keys(settings, &body, &safe_prefix))
}

pub async fn test_connection(settings: &WebDavStorageSettings) -> AppResult<()> {
    let client = webdav_client()?;
    ensure_root_collection(&client, settings).await?;
    let response = client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND")
                .map_err(|error| AppError::Webdav(error.to_string()))?,
            parsed_collection_url(settings, &path_segments(&settings.root_path)?)?,
        )
        .basic_auth(settings.username.trim(), Some(settings.password.trim()))
        .header("Depth", "0")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype /></prop></propfind>"#)
        .send()
        .await
        .map_err(|error| AppError::Webdav(format!("连接测试请求失败：{error}")))?;
    let status = response.status();
    if status.is_success() || status.as_u16() == 207 {
        Ok(())
    } else {
        Err(AppError::Webdav(format!("连接测试失败：HTTP {status}")))
    }
}

pub fn object_url(settings: &WebDavStorageSettings, key: &str) -> AppResult<String> {
    let endpoint = settings.endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err(AppError::InvalidOssSettings("WebDAV 地址".to_string()));
    }
    let mut parts = Vec::new();
    parts.extend(path_segments(&settings.root_path)?);
    parts.extend(path_segments(key)?);
    if parts.is_empty() {
        return Ok(endpoint.to_string());
    }
    Ok(format!("{}/{}", endpoint, parts.join("/")))
}

fn webdav_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .map_err(|error| AppError::Webdav(error.to_string()))
}

fn parsed_object_url(settings: &WebDavStorageSettings, key: &str) -> AppResult<reqwest::Url> {
    reqwest::Url::parse(&object_url(settings, key)?)
        .map_err(|error| AppError::InvalidOssSettings(format!("WebDAV 地址无效：{error}")))
}

async fn ensure_parent_collections(
    client: &reqwest::Client,
    settings: &WebDavStorageSettings,
    key: &str,
) -> AppResult<()> {
    let segments = path_segments(key)?;
    let root_segments = path_segments(&settings.root_path)?;
    if root_segments.is_empty() && segments.len() <= 1 {
        return Ok(());
    }
    let mut current = Vec::new();
    let directories = root_segments
        .iter()
        .chain(segments[..segments.len().saturating_sub(1)].iter());
    for segment in directories {
        current.push(segment.clone());
        let response = client
            .request(
                reqwest::Method::from_bytes(b"MKCOL")
                    .map_err(|error| AppError::Webdav(error.to_string()))?,
                parsed_collection_url(settings, &current)?,
            )
            .basic_auth(settings.username.trim(), Some(settings.password.trim()))
            .send()
            .await
            .map_err(|error| AppError::Webdav(format!("创建目录请求失败：{error}")))?;
        let status = response.status().as_u16();
        if !(status == 201 || status == 405 || status == 301 || status == 302) {
            return Err(AppError::Webdav(format!(
                "创建目录失败：HTTP {}",
                response.status()
            )));
        }
    }
    Ok(())
}

async fn ensure_root_collection(
    client: &reqwest::Client,
    settings: &WebDavStorageSettings,
) -> AppResult<()> {
    let root_segments = path_segments(&settings.root_path)?;
    let mut current = Vec::new();
    for segment in root_segments {
        current.push(segment);
        let response = client
            .request(
                reqwest::Method::from_bytes(b"MKCOL")
                    .map_err(|error| AppError::Webdav(error.to_string()))?,
                parsed_collection_url(settings, &current)?,
            )
            .basic_auth(settings.username.trim(), Some(settings.password.trim()))
            .send()
            .await
            .map_err(|error| AppError::Webdav(format!("创建根目录请求失败：{error}")))?;
        let status = response.status().as_u16();
        if !(status == 201 || status == 405 || status == 301 || status == 302) {
            return Err(AppError::Webdav(format!(
                "创建根目录失败：HTTP {}",
                response.status()
            )));
        }
    }
    Ok(())
}

fn ensure_success(status: reqwest::StatusCode, label: &str) -> AppResult<()> {
    if status.is_success() {
        Ok(())
    } else {
        Err(AppError::Webdav(format!("{label}：HTTP {status}")))
    }
}

fn parsed_collection_url(
    settings: &WebDavStorageSettings,
    encoded_segments: &[String],
) -> AppResult<reqwest::Url> {
    let endpoint = settings.endpoint.trim().trim_end_matches('/');
    if endpoint.is_empty() {
        return Err(AppError::InvalidOssSettings("WebDAV 地址".to_string()));
    }
    let url = if encoded_segments.is_empty() {
        endpoint.to_string()
    } else {
        format!("{}/{}", endpoint, encoded_segments.join("/"))
    };
    reqwest::Url::parse(&url)
        .map_err(|error| AppError::InvalidOssSettings(format!("WebDAV 地址无效：{error}")))
}

fn normalize_key(key: &str) -> AppResult<String> {
    Ok(path_segments(key)?.join("/"))
}

fn path_segments(path: &str) -> AppResult<Vec<String>> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .map(|segment| {
            let decoded = segment.trim();
            if decoded == "." || decoded == ".." || decoded.contains('\\') {
                return Err(AppError::InvalidExternalUrl);
            }
            Ok(url_encode(decoded))
        })
        .collect()
}

fn parse_multistatus_keys(
    settings: &WebDavStorageSettings,
    body: &str,
    prefix: &str,
) -> Vec<String> {
    let root_segments = path_segments(&settings.root_path).unwrap_or_default();
    let root_path = root_segments.join("/");
    let prefix_path = prefix.trim_matches('/');
    let mut keys = body
        .split("<")
        .filter_map(|part| {
            part.strip_prefix("d:href>")
                .or_else(|| part.strip_prefix("href>"))
        })
        .filter_map(|part| part.split_once("</").map(|(value, _)| value))
        .filter_map(|href| {
            let decoded = percent_decode(href);
            let normalized = decoded.trim_matches('/');
            let without_root = if root_path.is_empty() {
                normalized.to_string()
            } else {
                normalized
                    .strip_prefix(&root_path)
                    .or_else(|| {
                        normalized
                            .split_once(&format!("{root_path}/"))
                            .map(|(_, rest)| rest)
                    })
                    .unwrap_or(normalized)
                    .trim_matches('/')
                    .to_string()
            };
            if without_root.is_empty() || without_root.ends_with('/') {
                return None;
            }
            if prefix_path.is_empty()
                || without_root == prefix_path
                || without_root.starts_with(&format!("{prefix_path}/"))
            {
                Some(without_root)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    keys
}

fn url_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| {
            let allowed = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
            if allowed {
                vec![byte as char]
            } else {
                format!("%{byte:02X}").chars().collect()
            }
        })
        .collect()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
                output.push(hex);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_object_url_with_root_path() {
        let settings = WebDavStorageSettings {
            endpoint: "https://dav.example/root/".to_string(),
            root_path: "notes".to_string(),
            username: "u".to_string(),
            password: "p".to_string(),
            storage_id: "webdav".to_string(),
        };

        assert_eq!(
            object_url(&settings, "images/a b.png").unwrap(),
            "https://dav.example/root/notes/images/a%20b.png"
        );
    }

    #[test]
    fn parses_object_url_before_request() {
        let settings = WebDavStorageSettings {
            endpoint: "https://dav.example/root/".to_string(),
            root_path: "notes".to_string(),
            username: "u".to_string(),
            password: "p".to_string(),
            storage_id: "webdav".to_string(),
        };

        assert_eq!(
            parsed_object_url(&settings, "images/a.png")
                .unwrap()
                .as_str(),
            "https://dav.example/root/notes/images/a.png"
        );
    }

    #[test]
    fn builds_collection_url_for_root_directory() {
        let settings = WebDavStorageSettings {
            endpoint: "https://dav.example/root/".to_string(),
            root_path: "notes".to_string(),
            username: "u".to_string(),
            password: "p".to_string(),
            storage_id: "webdav".to_string(),
        };
        let root_segments = path_segments(&settings.root_path).unwrap();

        assert_eq!(
            parsed_collection_url(&settings, &root_segments)
                .unwrap()
                .as_str(),
            "https://dav.example/root/notes"
        );
    }

    #[test]
    fn rejects_parent_segments() {
        assert!(path_segments("images/../secret").is_err());
    }
}
