use serde::{Deserialize, Serialize};

use crate::ai::{protocol_generation_url, protocol_models_url};
use crate::error::{AppError, AppResult};
use crate::models::{AiConfiguredModel, AiFetchedModel, AiModelProfile};

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModelItem>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelItem {
    id: String,
}

pub async fn list_models(
    client: &reqwest::Client,
    profile: &AiModelProfile,
    api_key: &str,
) -> AppResult<Vec<AiFetchedModel>> {
    let response = client
        .get(protocol_models_url(profile)?)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|error| AppError::Ai(format!("获取 OpenAI 模型列表失败：{error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Ai(format!(
            "获取 OpenAI 模型列表失败：HTTP {}",
            response.status()
        )));
    }

    let payload = response
        .json::<OpenAiModelsResponse>()
        .await
        .map_err(|error| AppError::Ai(format!("解析 OpenAI 模型列表失败：{error}")))?;

    Ok(payload
        .data
        .into_iter()
        .map(|model| AiFetchedModel {
            display_name: model.id.clone(),
            model_id: model.id,
            capability_types: Vec::new(),
        })
        .collect())
}

#[derive(Debug, Serialize)]
struct OpenAiChatCompletionsRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiChatMessage<'a>>,
}

#[derive(Debug, Serialize)]
struct OpenAiChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatCompletionsResponse {
    choices: Vec<OpenAiChatChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatChoice {
    message: OpenAiChatOutputMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatOutputMessage {
    content: Option<String>,
}

pub async fn generate_text(
    client: &reqwest::Client,
    profile: &AiModelProfile,
    model: &AiConfiguredModel,
    api_key: &str,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let request = OpenAiChatCompletionsRequest {
        model: &model.model_id,
        messages: vec![
            OpenAiChatMessage {
                role: "system",
                content: system_prompt,
            },
            OpenAiChatMessage {
                role: "user",
                content: user_prompt,
            },
        ],
    };
    let response = client
        .post(protocol_generation_url(profile)?)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| AppError::Ai(format!("调用 OpenAI Chat Completions 失败：{error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Ai(format!(
            "调用 OpenAI Chat Completions 失败：HTTP {}",
            response.status()
        )));
    }

    let payload = response
        .json::<OpenAiChatCompletionsResponse>()
        .await
        .map_err(|error| AppError::Ai(format!("解析 OpenAI Chat Completions 结果失败：{error}")))?;

    payload
        .choices
        .into_iter()
        .find_map(|choice| choice.message.content)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Ai("模型没有返回文本内容".to_string()))
}
