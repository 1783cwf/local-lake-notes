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
struct OpenAiResponsesRequest<'a> {
    model: &'a str,
    input: Vec<OpenAiInputMessage<'a>>,
}

#[derive(Debug, Serialize)]
struct OpenAiInputMessage<'a> {
    role: &'a str,
    content: Vec<OpenAiInputContent<'a>>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum OpenAiInputContent<'a> {
    #[serde(rename = "input_text")]
    Text { text: &'a str },
}

#[derive(Debug, Deserialize)]
struct OpenAiResponsesOutput {
    output_text: Option<String>,
    output: Option<Vec<OpenAiOutputMessage>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiOutputMessage {
    content: Option<Vec<OpenAiOutputContent>>,
}

#[derive(Debug, Deserialize)]
struct OpenAiOutputContent {
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
    let request = OpenAiResponsesRequest {
        model: &model.model_id,
        input: vec![
            OpenAiInputMessage {
                role: "system",
                content: vec![OpenAiInputContent::Text {
                    text: system_prompt,
                }],
            },
            OpenAiInputMessage {
                role: "user",
                content: vec![OpenAiInputContent::Text { text: user_prompt }],
            },
        ],
    };
    let response = client
        .post(protocol_generation_url(profile)?)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| AppError::Ai(format!("调用 OpenAI Responses 失败：{error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Ai(format!(
            "调用 OpenAI Responses 失败：HTTP {}",
            response.status()
        )));
    }

    let payload = response
        .json::<OpenAiResponsesOutput>()
        .await
        .map_err(|error| AppError::Ai(format!("解析 OpenAI Responses 结果失败：{error}")))?;

    let text = payload.output_text.or_else(|| {
        payload.output.and_then(|items| {
            items.into_iter().find_map(|item| {
                item.content.and_then(|content| {
                    content
                        .into_iter()
                        .find_map(|content_item| content_item.text)
                })
            })
        })
    });

    text.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Ai("模型没有返回文本内容".to_string()))
}
