mod anthropic_messages;
mod openai_responses;

use std::time::Duration;

use reqwest::Url;

use crate::error::{AppError, AppResult};
use crate::models::{AiConfiguredModel, AiFetchedModel, AiModelProfile, AiProtocol};

pub async fn list_models(
    profile: &AiModelProfile,
    api_key: &str,
) -> AppResult<Vec<AiFetchedModel>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| AppError::Ai(format!("初始化模型请求客户端失败：{error}")))?;

    match profile.protocol {
        AiProtocol::OpenaiResponses => {
            openai_responses::list_models(&client, profile, api_key).await
        }
        AiProtocol::AnthropicMessages => {
            anthropic_messages::list_models(&client, profile, api_key).await
        }
    }
}

pub async fn generate_text(
    profile: &AiModelProfile,
    model: &AiConfiguredModel,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| AppError::Ai(format!("初始化模型请求客户端失败：{error}")))?;

    match profile.protocol {
        AiProtocol::OpenaiResponses => {
            openai_responses::generate_text(
                &client,
                profile,
                model,
                api_key,
                system_prompt,
                user_prompt,
            )
            .await
        }
        AiProtocol::AnthropicMessages => {
            anthropic_messages::generate_text(
                &client,
                profile,
                model,
                api_key,
                system_prompt,
                user_prompt,
            )
            .await
        }
    }
}

pub fn default_ai_base_url(protocol: &AiProtocol) -> &'static str {
    match protocol {
        AiProtocol::OpenaiResponses => "https://api.openai.com",
        AiProtocol::AnthropicMessages => "https://api.anthropic.com",
    }
}

pub fn normalize_ai_base_url(protocol: &AiProtocol, value: &str) -> AppResult<String> {
    let candidate = if value.trim().is_empty() {
        default_ai_base_url(protocol)
    } else {
        value.trim()
    };
    let mut url = Url::parse(candidate)
        .map_err(|error| AppError::Ai(format!("模型服务地址无效：{error}")))?;

    if !matches!(url.scheme(), "https" | "http") {
        return Err(AppError::Ai("模型服务地址只支持 http 或 https".to_string()));
    }
    if url.scheme() == "http" && !is_local_http_host(url.host_str()) {
        return Err(AppError::Ai(
            "非本机模型服务必须使用 https，避免 API Key 明文传输".to_string(),
        ));
    }
    if url.username() != "" || url.password().is_some() {
        return Err(AppError::Ai("模型服务地址不能包含用户名或密码".to_string()));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(AppError::Ai(
            "模型服务地址不能包含查询参数或片段".to_string(),
        ));
    }

    if matches!(url.path(), "/v1" | "/v1/") {
        url.set_path("");
    }

    Ok(url.as_str().trim_end_matches('/').to_string())
}

pub fn protocol_models_url(profile: &AiModelProfile) -> AppResult<Url> {
    match profile.protocol {
        AiProtocol::OpenaiResponses => append_api_path(&profile.base_url, "/v1/models"),
        AiProtocol::AnthropicMessages => append_api_path(&profile.base_url, "/v1/models"),
    }
}

pub fn protocol_generation_url(profile: &AiModelProfile) -> AppResult<Url> {
    match profile.protocol {
        AiProtocol::OpenaiResponses => append_api_path(&profile.base_url, "/v1/responses"),
        AiProtocol::AnthropicMessages => append_api_path(&profile.base_url, "/v1/messages"),
    }
}

fn append_api_path(base_url: &str, api_path: &str) -> AppResult<Url> {
    let mut url =
        Url::parse(base_url).map_err(|error| AppError::Ai(format!("模型服务地址无效：{error}")))?;
    let base_path = url.path().trim_end_matches('/');
    let base_path = if base_path == "/" { "" } else { base_path };
    url.set_path(&format!("{base_path}/{}", api_path.trim_start_matches('/')));
    Ok(url)
}

fn is_local_http_host(host: Option<&str>) -> bool {
    matches!(host, Some("localhost" | "127.0.0.1" | "::1"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_ai_base_url, protocol_models_url};
    use crate::models::{AiModelProfile, AiProtocol};

    #[test]
    fn normalizes_protocol_base_url_without_v1_suffix() {
        assert_eq!(
            normalize_ai_base_url(&AiProtocol::OpenaiResponses, "https://api.example.com/v1/")
                .unwrap(),
            "https://api.example.com"
        );
    }

    #[test]
    fn rejects_non_local_plain_http_base_url() {
        assert!(
            normalize_ai_base_url(&AiProtocol::OpenaiResponses, "http://api.example.com").is_err()
        );
        assert_eq!(
            normalize_ai_base_url(&AiProtocol::OpenaiResponses, "http://localhost:11434").unwrap(),
            "http://localhost:11434"
        );
    }

    #[test]
    fn preserves_custom_base_path_when_building_models_url() {
        let profile = AiModelProfile {
            id: "profile".to_string(),
            name: "代理".to_string(),
            protocol: AiProtocol::OpenaiResponses,
            base_url: "https://proxy.example.com/custom".to_string(),
            enabled: true,
            models: Vec::new(),
            has_api_key: true,
        };

        assert_eq!(
            protocol_models_url(&profile).unwrap().as_str(),
            "https://proxy.example.com/custom/v1/models"
        );
    }
}
