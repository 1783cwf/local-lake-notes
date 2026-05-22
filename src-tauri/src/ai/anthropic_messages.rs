use serde::{Deserialize, Serialize};

use crate::ai::{protocol_generation_url, protocol_models_url};
use crate::error::{AppError, AppResult};
use crate::models::{AiConfiguredModel, AiFetchedModel, AiModelProfile};

const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_MODEL_LIST_PAGES: usize = 20;

#[derive(Debug, Deserialize)]
struct AnthropicModelsResponse {
    data: Vec<AnthropicModelItem>,
    #[serde(default)]
    has_more: bool,
    last_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicModelItem {
    id: String,
    display_name: Option<String>,
}

pub async fn list_models(
    client: &reqwest::Client,
    profile: &AiModelProfile,
    api_key: &str,
) -> AppResult<Vec<AiFetchedModel>> {
    let mut url = protocol_models_url(profile)?;
    let mut models = Vec::new();

    for _ in 0..MAX_MODEL_LIST_PAGES {
        let response = client
            .get(url.clone())
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .await
            .map_err(|error| AppError::Ai(format!("获取 Anthropic 模型列表失败：{error}")))?;

        if !response.status().is_success() {
            return Err(AppError::Ai(format!(
                "获取 Anthropic 模型列表失败：HTTP {}",
                response.status()
            )));
        }

        let payload = response
            .json::<AnthropicModelsResponse>()
            .await
            .map_err(|error| AppError::Ai(format!("解析 Anthropic 模型列表失败：{error}")))?;

        models.extend(payload.data.into_iter().map(|model| AiFetchedModel {
            display_name: model.display_name.unwrap_or_else(|| model.id.clone()),
            model_id: model.id,
            capability_types: Vec::new(),
        }));

        if !payload.has_more {
            return Ok(models);
        }

        let Some(last_id) = payload.last_id else {
            return Ok(models);
        };
        url.query_pairs_mut()
            .clear()
            .append_pair("after_id", &last_id);
    }

    Err(AppError::Ai(
        "Anthropic 模型列表分页过多，请稍后重试".to_string(),
    ))
}

#[derive(Debug, Serialize)]
struct AnthropicMessagesRequest<'a> {
    model: &'a str,
    system: &'a str,
    messages: Vec<AnthropicInputMessage<'a>>,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct AnthropicInputMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
    content: Vec<AnthropicOutputContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicOutputContent {
    text: Option<String>,
}

pub async fn generate_text(
    client: &reqwest::Client,
    profile: &AiModelProfile,
    model: &AiConfiguredModel,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let request = AnthropicMessagesRequest {
        model: &model.model_id,
        system: system_prompt,
        messages: vec![AnthropicInputMessage {
            role: "user",
            content: user_prompt,
        }],
        max_tokens: 4096,
    };
    let response = client
        .post(protocol_generation_url(profile)?)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&request)
        .send()
        .await
        .map_err(|error| AppError::Ai(format!("调用 Anthropic Messages 失败：{error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Ai(format!(
            "调用 Anthropic Messages 失败：HTTP {}",
            response.status()
        )));
    }

    let payload = response
        .json::<AnthropicMessagesResponse>()
        .await
        .map_err(|error| AppError::Ai(format!("解析 Anthropic Messages 结果失败：{error}")))?;

    payload
        .content
        .into_iter()
        .find_map(|item| item.text)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Ai("模型没有返回文本内容".to_string()))
}
