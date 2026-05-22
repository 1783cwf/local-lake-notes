use std::collections::{HashMap, HashSet};

use tauri::AppHandle;

use crate::ai::{generate_text, list_models, normalize_ai_base_url};
use crate::error::{AppError, AppResult};
use crate::models::{
    AiActionPreviewMode, AiAddModelInput, AiConfiguredModel, AiDocumentActionType,
    AiDocumentContentScope, AiDocumentPatch, AiDocumentPatchOperation, AiInputModality,
    AiListModelsInput, AiListModelsOutput, AiModelCapabilityType, AiModelProfile,
    AiRunDocumentActionInput, AiRunDocumentActionOutput, AiRunSpreadsheetActionInput,
    AiRunSpreadsheetActionOutput, AiRunTableActionInput, AiRunTableActionOutput,
    AiSetActiveModelInput, AiSettings, AiSplitDocumentInput, AiSplitDocumentOutput,
    AiSpreadsheetActionType, AiTableActionType, SaveAiSettingsInput,
};
use crate::storage::ai_key::{
    current_ai_profile_secret, delete_ai_profile_secret, save_ai_profile_secret,
};
use crate::storage::app_database::{
    load_ai_settings as load_database_ai_settings, save_ai_settings as save_database_ai_settings,
};

#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> AppResult<AiSettings> {
    load_database_ai_settings(&app)
}

#[tauri::command]
pub fn save_ai_settings(app: AppHandle, input: SaveAiSettingsInput) -> AppResult<AiSettings> {
    let mut settings = normalize_ai_settings(input.settings)?;
    let mut secret_profile_ids = HashSet::new();

    for key in input.api_keys {
        if !settings
            .profiles
            .iter()
            .any(|profile| profile.id == key.profile_id)
        {
            return Err(AppError::Ai("API Key 对应的模型配置不存在".to_string()));
        }
        save_ai_profile_secret(&app, &key.profile_id, &key.api_key)?;
        secret_profile_ids.insert(key.profile_id);
    }

    for profile_id in input.deleted_profile_ids {
        delete_ai_profile_secret(&app, &profile_id)?;
    }

    for profile in &mut settings.profiles {
        if secret_profile_ids.contains(&profile.id) {
            profile.has_api_key = true;
        }
    }

    save_database_ai_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn list_ai_models(
    app: AppHandle,
    input: AiListModelsInput,
) -> AppResult<AiListModelsOutput> {
    let settings = load_database_ai_settings(&app)?;
    let profile = settings
        .profiles
        .into_iter()
        .find(|profile| profile.id == input.profile_id)
        .ok_or_else(|| AppError::Ai("模型配置不存在".to_string()))?;
    validate_ai_profile(&profile)?;
    let api_key = current_ai_profile_secret(&app, &profile.id)?;
    let models = list_models(&profile, &api_key).await?;

    Ok(AiListModelsOutput {
        profile_id: profile.id,
        models,
    })
}

#[tauri::command]
pub fn add_ai_model_to_profile(app: AppHandle, input: AiAddModelInput) -> AppResult<AiSettings> {
    let mut settings = load_database_ai_settings(&app)?;
    let profile = settings
        .profiles
        .iter_mut()
        .find(|profile| profile.id == input.profile_id)
        .ok_or_else(|| AppError::Ai("模型配置不存在".to_string()))?;
    validate_ai_profile(profile)?;

    let model_id = input.model_id.trim();
    if model_id.is_empty() {
        return Err(AppError::Ai("模型 ID 不能为空".to_string()));
    }

    let model = normalize_ai_model(AiConfiguredModel {
        id: configured_model_id(&profile.id, model_id),
        profile_id: profile.id.clone(),
        model_id: model_id.to_string(),
        display_name: if input.display_name.trim().is_empty() {
            model_id.to_string()
        } else {
            input.display_name.trim().to_string()
        },
        protocol: profile.protocol.clone(),
        enabled: true,
        capability_types: input.capability_types,
        supported_input_modalities: Vec::new(),
    })?;

    if let Some(existing) = profile.models.iter_mut().find(|item| item.id == model.id) {
        *existing = model;
    } else {
        profile.models.push(model);
    }

    settings = normalize_ai_settings(settings)?;
    save_database_ai_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_active_ai_model(app: AppHandle, input: AiSetActiveModelInput) -> AppResult<AiSettings> {
    let mut settings = load_database_ai_settings(&app)?;
    let configured_model_id = input.configured_model_id.trim();
    if configured_model_id.is_empty() {
        settings.active_model_id = None;
    } else if !settings.profiles.iter().any(|profile| {
        profile.enabled
            && profile
                .models
                .iter()
                .any(|model| model.enabled && model.id == configured_model_id)
    }) {
        return Err(AppError::Ai("只能启用已配置且可用的模型".to_string()));
    } else {
        settings.active_model_id = Some(configured_model_id.to_string());
    }

    settings = normalize_ai_settings(settings)?;
    save_database_ai_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn run_ai_document_action(
    app: AppHandle,
    input: AiRunDocumentActionInput,
) -> AppResult<AiRunDocumentActionOutput> {
    validate_ai_action_input(&input)?;
    let settings = load_database_ai_settings(&app)?;
    let active_model_id = settings
        .active_model_id
        .as_deref()
        .ok_or_else(|| AppError::Ai("请先在设置中启用一个模型".to_string()))?;
    let (profile, model) = find_active_profile_and_model(&settings, active_model_id)?;
    let api_key = current_ai_profile_secret(&app, &profile.id)?;
    let action = ai_document_action_spec(&input.action_type);
    let user_prompt = if action.preview_mode == AiActionPreviewMode::Patch {
        build_document_patch_prompt(&input, action.user_instruction)
    } else {
        build_document_action_prompt(&input, action.user_instruction)
    };
    let system_prompt = if action.preview_mode == AiActionPreviewMode::Patch {
        STRUCTURED_SYSTEM_PROMPT
    } else {
        SYSTEM_PROMPT
    };
    let content = generate_text(&profile, &model, &api_key, system_prompt, &user_prompt).await?;
    let patch = if action.preview_mode == AiActionPreviewMode::Patch {
        Some(parse_document_patch_output(&content)?)
    } else {
        None
    };

    Ok(AiRunDocumentActionOutput {
        action_type: input.action_type,
        title: action.title.to_string(),
        content: if let Some(patch) = &patch {
            document_patch_preview_text(patch)
        } else {
            content
        },
        preview_mode: action.preview_mode,
        content_scope: input.content_scope,
        patch,
    })
}

#[tauri::command]
pub async fn run_ai_split_document(
    app: AppHandle,
    input: AiSplitDocumentInput,
) -> AppResult<AiSplitDocumentOutput> {
    validate_split_document_input(&input)?;
    let content = generate_with_active_model(
        &app,
        STRUCTURED_SYSTEM_PROMPT,
        &build_split_document_prompt(&input),
    )
    .await?;
    parse_split_document_output(&content)
}

#[tauri::command]
pub async fn run_ai_table_action(
    app: AppHandle,
    input: AiRunTableActionInput,
) -> AppResult<AiRunTableActionOutput> {
    validate_table_action_input(&input)?;
    let content = generate_with_active_model(
        &app,
        STRUCTURED_SYSTEM_PROMPT,
        &build_table_action_prompt(&input),
    )
    .await?;
    let mut output = parse_table_action_output(&content, table_action_allows_new_fields(&input))?;
    output.action_type = input.action_type;
    Ok(output)
}

#[tauri::command]
pub async fn run_ai_spreadsheet_action(
    app: AppHandle,
    input: AiRunSpreadsheetActionInput,
) -> AppResult<AiRunSpreadsheetActionOutput> {
    validate_spreadsheet_action_input(&input)?;
    let content = generate_with_active_model(
        &app,
        STRUCTURED_SYSTEM_PROMPT,
        &build_spreadsheet_action_prompt(&input),
    )
    .await?;
    let mut output = parse_spreadsheet_action_output(&content)?;
    output.action_type = input.action_type;
    Ok(output)
}

async fn generate_with_active_model(
    app: &AppHandle,
    system_prompt: &str,
    user_prompt: &str,
) -> AppResult<String> {
    let settings = load_database_ai_settings(app)?;
    let active_model_id = settings
        .active_model_id
        .as_deref()
        .ok_or_else(|| AppError::Ai("请先在设置中启用一个模型".to_string()))?;
    let (profile, model) = find_active_profile_and_model(&settings, active_model_id)?;
    let api_key = current_ai_profile_secret(app, &profile.id)?;
    generate_text(&profile, &model, &api_key, system_prompt, user_prompt).await
}

pub fn normalize_ai_settings(mut settings: AiSettings) -> AppResult<AiSettings> {
    let mut profile_ids = HashSet::new();
    let mut model_ids = HashSet::new();

    settings.profiles = settings
        .profiles
        .into_iter()
        .map(|profile| normalize_ai_profile(profile, &mut profile_ids, &mut model_ids))
        .collect::<AppResult<Vec<_>>>()?;

    let active_model_available = settings.profiles.iter().any(|profile| {
        profile.enabled
            && profile.models.iter().any(|model| {
                model.enabled && Some(model.id.as_str()) == settings.active_model_id.as_deref()
            })
    });
    if !active_model_available {
        settings.active_model_id = None;
    }

    Ok(settings)
}

fn normalize_ai_profile(
    mut profile: AiModelProfile,
    profile_ids: &mut HashSet<String>,
    model_ids: &mut HashSet<String>,
) -> AppResult<AiModelProfile> {
    profile.id = profile.id.trim().to_string();
    if profile.id.is_empty() {
        return Err(AppError::Ai("模型配置 ID 不能为空".to_string()));
    }
    if !profile_ids.insert(profile.id.clone()) {
        return Err(AppError::Ai("模型配置 ID 不能重复".to_string()));
    }

    profile.name = profile.name.trim().to_string();
    if profile.name.is_empty() {
        profile.name = "自定义模型".to_string();
    }
    profile.base_url = normalize_ai_base_url(&profile.protocol, &profile.base_url)?;

    profile.models = profile
        .models
        .into_iter()
        .map(|mut model| {
            model.profile_id = profile.id.clone();
            model.protocol = profile.protocol.clone();
            let normalized = normalize_ai_model(model)?;
            if !model_ids.insert(normalized.id.clone()) {
                return Err(AppError::Ai("模型 ID 不能重复".to_string()));
            }
            Ok(normalized)
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(profile)
}

fn normalize_ai_model(mut model: AiConfiguredModel) -> AppResult<AiConfiguredModel> {
    model.id = model.id.trim().to_string();
    model.model_id = model.model_id.trim().to_string();
    model.display_name = model.display_name.trim().to_string();
    if model.model_id.is_empty() {
        return Err(AppError::Ai("模型 ID 不能为空".to_string()));
    }
    if model.id.is_empty() {
        model.id = configured_model_id(&model.profile_id, &model.model_id);
    }
    if model.display_name.is_empty() {
        model.display_name = model.model_id.clone();
    }

    dedupe_capabilities(&mut model.capability_types);
    model.supported_input_modalities = input_modalities_for_capabilities(&model.capability_types);
    Ok(model)
}

fn validate_ai_profile(profile: &AiModelProfile) -> AppResult<()> {
    if profile.id.trim().is_empty() {
        return Err(AppError::Ai("模型配置 ID 不能为空".to_string()));
    }
    normalize_ai_base_url(&profile.protocol, &profile.base_url)?;
    Ok(())
}

fn validate_ai_action_input(input: &AiRunDocumentActionInput) -> AppResult<()> {
    if input.content.trim().is_empty() {
        return Err(AppError::Ai(
            "当前文档内容为空，无法执行 AI 动作".to_string(),
        ));
    }
    if matches!(input.action_type, AiDocumentActionType::AnswerQuestion)
        && input.instruction.trim().is_empty()
    {
        return Err(AppError::Ai("请先输入问题".to_string()));
    }
    if matches!(input.action_type, AiDocumentActionType::CustomEdit)
        && input.instruction.trim().is_empty()
    {
        return Err(AppError::Ai("请先输入要如何修改文档".to_string()));
    }
    Ok(())
}

fn validate_split_document_input(input: &AiSplitDocumentInput) -> AppResult<()> {
    if input.content.trim().is_empty() {
        return Err(AppError::Ai("当前文档内容为空，无法拆分文档".to_string()));
    }
    Ok(())
}

fn validate_table_action_input(input: &AiRunTableActionInput) -> AppResult<()> {
    if input.table_json.trim().is_empty() {
        return Err(AppError::Ai(
            "当前多维表格内容为空，无法执行 AI 动作".to_string(),
        ));
    }
    serde_json::from_str::<serde_json::Value>(&input.table_json)
        .map_err(|_| AppError::Ai("当前多维表格 JSON 无效，无法执行 AI 动作".to_string()))?;
    if matches!(
        input.action_type,
        AiTableActionType::GenerateFields
            | AiTableActionType::CreateRecords
            | AiTableActionType::ExtractTasks
            | AiTableActionType::MeetingToTaskBoard
    ) && input.instruction.trim().is_empty()
    {
        return Err(AppError::Ai("请先输入要生成的表格内容".to_string()));
    }
    Ok(())
}

fn validate_spreadsheet_action_input(input: &AiRunSpreadsheetActionInput) -> AppResult<()> {
    if input.workbook_json.trim().is_empty() {
        return Err(AppError::Ai("当前表格内容为空，无法执行 AI 动作".to_string()));
    }
    serde_json::from_str::<serde_json::Value>(&input.workbook_json)
        .map_err(|_| AppError::Ai("当前表格 JSON 无效，无法执行 AI 动作".to_string()))?;
    if matches!(
        input.action_type,
        AiSpreadsheetActionType::CreateSheet | AiSpreadsheetActionType::AppendRows
    ) && input.instruction.trim().is_empty()
    {
        return Err(AppError::Ai("请先输入要生成的表格内容".to_string()));
    }
    Ok(())
}

fn find_active_profile_and_model(
    settings: &AiSettings,
    active_model_id: &str,
) -> AppResult<(AiModelProfile, AiConfiguredModel)> {
    settings
        .profiles
        .iter()
        .filter(|profile| profile.enabled)
        .find_map(|profile| {
            profile
                .models
                .iter()
                .find(|model| model.enabled && model.id == active_model_id)
                .map(|model| (profile.clone(), model.clone()))
        })
        .ok_or_else(|| AppError::Ai("当前启用模型不存在或已停用".to_string()))
}

fn configured_model_id(profile_id: &str, model_id: &str) -> String {
    format!("{}:{}", profile_id.trim(), model_id.trim())
}

fn input_modalities_for_capabilities(
    capabilities: &[AiModelCapabilityType],
) -> Vec<AiInputModality> {
    let mut modalities = vec![AiInputModality::Text];
    if capabilities.contains(&AiModelCapabilityType::Vision) {
        // 视觉能力表示该模型可以同时处理文本和图片输入；第一版暂不接入音频、视频或文件输入。
        modalities.push(AiInputModality::Image);
    }
    modalities
}

fn dedupe_capabilities(capabilities: &mut Vec<AiModelCapabilityType>) {
    let mut seen = HashMap::<AiModelCapabilityType, ()>::new();
    capabilities.retain(|capability| seen.insert(capability.clone(), ()).is_none());
}

const SYSTEM_PROMPT: &str = "你是本地笔记应用中的文档助手。只根据用户提供的当前文档或选中文本工作，不假设全库索引存在。输出必须是适合 Lake 富文本编辑器导入的中文 Markdown：使用 #/##/### 形成递进层级，避免多个同级条目都写成“1.”；关键结论用引用块 >，流程和清单用有序/无序/任务列表，结构化信息优先用 Markdown 表格。不要声称已经写入、替换或创建文档。";
const STRUCTURED_SYSTEM_PROMPT: &str = "你是本地笔记应用中的 AI 助手。只根据用户提供的当前文档或当前多维表格工作，不假设全库索引存在。写入类结果必须只输出严格 JSON，不要输出 Markdown 代码块、解释文字或前后缀。JSON 中的 markdown 字段必须适合 Lake 富文本编辑器导入：使用 #/##/### 形成递进层级，关键结论用 > 引用块，清单使用 -、1. 或 - [ ]，结构化信息优先用 Markdown 表格。";

struct AiDocumentActionSpec {
    title: &'static str,
    preview_mode: AiActionPreviewMode,
    user_instruction: &'static str,
}

fn ai_document_action_spec(action_type: &AiDocumentActionType) -> AiDocumentActionSpec {
    match action_type {
        AiDocumentActionType::SummarizeDocument => AiDocumentActionSpec {
            title: "文档总结",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "总结当前文档，保留关键结论、事实、风险和待确认点。",
        },
        AiDocumentActionType::AnswerQuestion => AiDocumentActionSpec {
            title: "文档问答",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "回答用户问题；如果文档没有依据，明确说明当前文档中没有找到。",
        },
        AiDocumentActionType::GenerateTitle => AiDocumentActionSpec {
            title: "标题建议",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "生成 5 个适合作为当前文档标题的候选，按质量排序。",
        },
        AiDocumentActionType::GenerateAbstract => AiDocumentActionSpec {
            title: "摘要",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "生成一段 150 字以内摘要，并附 3 到 5 个关键词。",
        },
        AiDocumentActionType::GenerateTodos => AiDocumentActionSpec {
            title: "待办提取",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "从文档中提取待办事项，输出 Markdown 任务清单，包含负责人、截止时间、状态；缺失则标注待确认。",
        },
        AiDocumentActionType::GenerateMeetingMinutes => AiDocumentActionSpec {
            title: "会议纪要",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "将当前文档整理成会议纪要，包含背景、讨论要点、决策、行动项。",
        },
        AiDocumentActionType::Rewrite => AiDocumentActionSpec {
            title: "改写预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "在不改变事实含义的前提下改写当前内容，使表达更清晰。优先用 replace-selection 或 replace-text 操作。",
        },
        AiDocumentActionType::Polish => AiDocumentActionSpec {
            title: "润色预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "润色当前内容，提升表达质量和可读性，不新增未经文档支持的事实。优先用 replace-selection 或 replace-text 操作。",
        },
        AiDocumentActionType::Expand => AiDocumentActionSpec {
            title: "扩写预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "基于当前内容扩写，补足过渡、背景、示例和必要解释。按用户意图选择插入或替换操作。",
        },
        AiDocumentActionType::Compress => AiDocumentActionSpec {
            title: "压缩预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "压缩当前内容，保留核心信息，删除重复和低价值表述。优先用 replace-selection 或 replace-text 操作。",
        },
        AiDocumentActionType::OrganizeHeadings => AiDocumentActionSpec {
            title: "结构整理预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "把散乱内容整理成清晰的小标题结构，保留原始信息。优先替换需要整理的连续段落。",
        },
        AiDocumentActionType::OutlineToDraft => AiDocumentActionSpec {
            title: "初稿预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "把当前提纲扩展成完整初稿，保持层级结构。优先替换提纲段落或在指定位置插入正文。",
        },
        AiDocumentActionType::NotesToArticle => AiDocumentActionSpec {
            title: "文章预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "将零散笔记整理成一篇结构完整、衔接自然的文章。优先替换零散笔记所在段落。",
        },
        AiDocumentActionType::LongFormStructure => AiDocumentActionSpec {
            title: "长文结构建议",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "给当前长文提出目录结构、段落顺序和需要补充/删减的位置建议。",
        },
        AiDocumentActionType::TechToTutorial => AiDocumentActionSpec {
            title: "教程预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "将当前技术笔记改写成教程，包含背景、步骤、代码或命令说明、常见问题。优先替换技术笔记主体。",
        },
        AiDocumentActionType::TechToReadme => AiDocumentActionSpec {
            title: "README 预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "将当前技术笔记改写成 README，包含简介、安装、使用、配置、开发和限制。优先替换技术笔记主体。",
        },
        AiDocumentActionType::TechToReleaseNotes => AiDocumentActionSpec {
            title: "发布说明预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "将当前技术笔记整理成发布说明，按新增、修复、变更、注意事项组织。优先替换相关技术笔记主体。",
        },
        AiDocumentActionType::CustomEdit => AiDocumentActionSpec {
            title: "文档修改预览",
            preview_mode: AiActionPreviewMode::Patch,
            user_instruction: "根据用户补充要求直接修改当前内容。可以新增、删除、替换、整理段落、添加表格或补充小节；必须返回可定位的 patch 操作，保留用户未要求删除的已有信息。",
        },
        AiDocumentActionType::SplitDocument => AiDocumentActionSpec {
            title: "拆分文档预览",
            preview_mode: AiActionPreviewMode::Informational,
            user_instruction: "分析当前长文，给出适合拆分为多个子文档的标题和正文。",
        },
    }
}

fn build_document_action_prompt(
    input: &AiRunDocumentActionInput,
    action_instruction: &str,
) -> String {
    let mut prompt = format!(
        "任务：{action_instruction}\n\n文档标题：{}\n\n当前文档内容：\n{}\n",
        input.document_title.trim(),
        input.content.trim()
    );
    if !input.instruction.trim().is_empty() {
        prompt.push_str("\n用户补充要求：\n");
        prompt.push_str(input.instruction.trim());
        prompt.push('\n');
    }
    prompt.push_str("\n格式要求：\n1. 正文必须有清晰层级：主标题后按 ## / ### 拆分小节，不要把所有小节都写成同一级编号。\n2. 关键结论、风险、注意事项优先使用 > 引用块；可执行事项使用 - [ ] 任务清单。\n3. 对比、参数、清单、步骤结果等结构化内容优先用 Markdown 表格。\n4. 只输出结果正文，不要添加解释性前后缀。");
    prompt
}

fn build_document_patch_prompt(
    input: &AiRunDocumentActionInput,
    action_instruction: &str,
) -> String {
    let scope_name = match input.content_scope {
        AiDocumentContentScope::Document => "当前文档",
        AiDocumentContentScope::Selection => "当前选中区域",
    };
    let scope_rule = match input.content_scope {
        AiDocumentContentScope::Document => {
            "输入范围是当前文档时，可以使用 insert-before、insert-after、replace-text、delete-text、prepend-document、append-document；不要使用 replace-selection。"
        }
        AiDocumentContentScope::Selection => {
            "输入范围是当前选中区域时，必须返回 replace-selection；markdown 是完整替换这段选区的新内容，不要使用 anchor 或文档级操作。"
        }
    };
    let mut prompt = format!(
        "任务：{action_instruction}\n\n文档标题：{}\n输入范围：{scope_name}\n\n当前内容：\n{}\n\n输出 JSON 结构必须为：{{\"summary\":\"改动摘要\",\"operations\":[{{\"type\":\"insert-after|insert-before|replace-text|delete-text|prepend-document|append-document|replace-selection\",\"anchor\":\"必须从当前内容中逐字复制的定位文本\",\"markdown\":\"要插入或替换的 Markdown\",\"summary\":\"单项改动说明\"}}]}}。\n约束：\n1. 只输出严格 JSON，不要 Markdown 代码块或解释文字。\n2. {scope_rule}\n3. 不要返回整篇文档，除非用户明确要求替换整段且该段就是 anchor。\n4. 文档级 insert/replace/delete 操作的 anchor 必须是当前内容中真实存在且尽量短的连续文本。\n5. 新增到文首用 prepend-document；新增到文末用 append-document；无法稳定定位时优先 append-document 并在 summary 说明。\n6. 多个操作按从文前到文后的顺序输出；不要生成空 markdown。\n7. markdown 字段要写成适合 Lake 编辑器的富文本结构：主标题后按 ## / ### 拆小节，不要把所有小节都写成同级“1.”；关键结论或注意事项用 > 引用块；行动项用 - [ ]；结构化内容优先使用 Markdown 表格。\n",
        input.document_title.trim(),
        input.content.trim()
    );
    if !input.instruction.trim().is_empty() {
        prompt.push_str("\n用户补充要求：\n");
        prompt.push_str(input.instruction.trim());
        prompt.push('\n');
    }
    prompt
}

fn build_split_document_prompt(input: &AiSplitDocumentInput) -> String {
    let mut prompt = format!(
        "任务：把当前长文拆分成多个可独立保存的子文档候选。\n\n文档标题：{}\n\n当前文档内容：\n{}\n\n输出 JSON 结构必须为：{{\"title\":\"拆分方案标题\",\"parts\":[{{\"title\":\"子文档标题\",\"content\":\"Markdown 正文\"}}]}}。\n要求：parts 数量 2 到 12 个；title 不带文件扩展名；content 保留原文事实并补齐必要上下文；不要创建空子文档。\n",
        input.document_title.trim(),
        input.content.trim()
    );
    if !input.instruction.trim().is_empty() {
        prompt.push_str("\n用户补充要求：\n");
        prompt.push_str(input.instruction.trim());
        prompt.push('\n');
    }
    prompt
}

fn build_table_action_prompt(input: &AiRunTableActionInput) -> String {
    let instruction = match input.action_type {
        AiTableActionType::GenerateFields => {
            "根据用户描述或当前表格语义生成字段候选。patch.fields 必须包含字段名、字段类型和必要选项；不需要生成记录。"
        }
        AiTableActionType::CreateRecords => {
            "根据用户输入创建新的表格记录。默认只能使用当前表格已有字段填充 patch.records；没有对应字段的信息写入 body，不要新增 fields，除非用户明确要求新增字段。"
        }
        AiTableActionType::ExtractTasks => {
            "从用户输入或当前表格中提取可写入的新记录。默认只能使用当前表格已有字段填充 patch.records；没有对应字段的信息写入 body，不要新增 fields，除非用户明确要求新增字段。"
        }
        AiTableActionType::SummarizeTable => {
            "对当前表格数据生成统计摘要、分布、风险和待确认点。默认不要生成 patch，除非用户明确要求补字段或记录。"
        }
        AiTableActionType::SuggestTagsStatus => {
            "根据记录正文和已有字段建议标签、状态、优先级记录值。默认只能使用当前表格已有字段生成 patch.records；不要新增 fields，除非用户明确要求新增字段。"
        }
        AiTableActionType::MeetingToTaskBoard => {
            "将会议纪要转换成任务看板候选。默认只能使用当前表格已有字段创建任务记录，缺少字段的信息写入 body；patch.preferBoard 设为 true。不要新增 fields，除非用户明确要求新增字段。"
        }
    };
    let field_rule = match input.action_type {
        AiTableActionType::GenerateFields => {
            "当前动作允许输出 patch.fields。字段和记录都只是候选，不要输出本地 ID。"
        }
        _ => {
            "除非用户补充要求中明确出现“新增字段、添加字段、生成字段、创建字段”等意图，否则 patch.fields 必须省略或为空；默认只按已有字段创建 patch.records。"
        }
    };
    let mut prompt = format!(
        "任务：{instruction}\n\n多维表格标题：{}\n\n当前多维表格 JSON：\n{}\n\n输出 JSON 结构必须为：{{\"title\":\"结果标题\",\"summary\":\"面向用户的预览摘要\",\"patch\":{{\"fields\":[{{\"name\":\"字段名\",\"type\":\"text|longText|singleSelect|multiSelect|number|progress|time|url\",\"options\":[\"选项\"]}}],\"records\":[{{\"title\":\"记录标题\",\"values\":{{\"字段名\":\"值或数组\"}},\"body\":\"记录正文\"}}],\"preferBoard\":false}}}}。\n约束：\n1. {field_rule}\n2. patch.records.values 的 key 必须优先使用当前表格已有字段名；无法映射到已有字段的信息放进 body。\n3. 字段类型只能使用给定枚举；没有表格写入建议时可以省略 patch。\n4. 只输出 JSON，不要 Markdown 代码块或解释文字。",
        input.table_title.trim(),
        input.table_json.trim()
    );
    if !input.instruction.trim().is_empty() {
        prompt.push_str("\n\n用户补充内容或要求：\n");
        prompt.push_str(input.instruction.trim());
    }
    prompt
}

fn build_spreadsheet_action_prompt(input: &AiRunSpreadsheetActionInput) -> String {
    let instruction = match input.action_type {
        AiSpreadsheetActionType::CreateSheet => {
            "根据用户输入创建一个新的工作表候选。patch.sheets 必须包含 sheet 名称和二维数组 rows；第一行通常作为表头。"
        }
        AiSpreadsheetActionType::AppendRows => {
            "根据用户输入生成要追加到当前活动表末尾的行。patch.appendRows 必须是二维数组；不要输出完整 workbook。"
        }
        AiSpreadsheetActionType::SummarizeSpreadsheet => {
            "分析当前 Univer workbook 快照，生成工作簿摘要、数据质量问题和可操作建议。默认不要生成 patch。"
        }
    };
    let mut prompt = format!(
        "任务：{instruction}\n\n表格标题：{}\n\n当前 Univer workbook JSON：\n{}\n\n输出 JSON 结构必须为：{{\"title\":\"结果标题\",\"summary\":\"面向用户的预览摘要\",\"patch\":{{\"sheets\":[{{\"name\":\"工作表名\",\"rows\":[[\"表头1\",\"表头2\"],[\"值1\",\"值2\"]]}}],\"appendRows\":[[\"值1\",\"值2\"]]}}}}。\n约束：\n1. 只输出严格 JSON，不要 Markdown 代码块或解释文字。\n2. 不要返回完整 workbook；只返回候选 patch。\n3. 单元格值只能是字符串、数字、布尔值或 null。\n4. create-sheet 只输出 patch.sheets；append-rows 只输出 patch.appendRows；摘要动作默认省略 patch。",
        input.spreadsheet_title.trim(),
        input.workbook_json.trim()
    );
    if !input.instruction.trim().is_empty() {
        prompt.push_str("\n\n用户补充内容或要求：\n");
        prompt.push_str(input.instruction.trim());
    }
    prompt
}

fn parse_split_document_output(content: &str) -> AppResult<AiSplitDocumentOutput> {
    let json = extract_json_object(content)?;
    let mut output: AiSplitDocumentOutput = serde_json::from_str(json)
        .map_err(|error| AppError::Ai(format!("AI 拆分结果不是有效 JSON：{error}")))?;
    output.title = output.title.trim().to_string();
    output.parts = output
        .parts
        .into_iter()
        .map(|mut part| {
            part.title = part.title.trim().to_string();
            part.content = part.content.trim().to_string();
            part
        })
        .filter(|part| !part.title.is_empty() && !part.content.is_empty())
        .take(12)
        .collect();
    if output.title.is_empty() {
        output.title = "长文拆分方案".to_string();
    }
    if output.parts.len() < 2 {
        return Err(AppError::Ai("AI 拆分结果至少需要 2 个子文档".to_string()));
    }
    Ok(output)
}

fn parse_document_patch_output(content: &str) -> AppResult<AiDocumentPatch> {
    let json = extract_json_object(content)?;
    let patch: AiDocumentPatch = serde_json::from_str(json)
        .map_err(|error| AppError::Ai(format!("AI 文档修改结果不是有效 JSON：{error}")))?;
    let patch = normalize_document_patch(patch);
    if patch.operations.is_empty() {
        return Err(AppError::Ai("AI 文档修改结果没有可应用的操作".to_string()));
    }
    Ok(patch)
}

fn normalize_document_patch(mut patch: AiDocumentPatch) -> AiDocumentPatch {
    patch.summary = patch.summary.trim().to_string();
    patch.operations = patch
        .operations
        .into_iter()
        .filter_map(normalize_document_patch_operation)
        .take(20)
        .collect();
    patch
}

fn normalize_document_patch_operation(
    operation: AiDocumentPatchOperation,
) -> Option<AiDocumentPatchOperation> {
    match operation {
        AiDocumentPatchOperation::ReplaceSelection { markdown, summary } => {
            let markdown = markdown.trim().to_string();
            (!markdown.is_empty()).then_some(AiDocumentPatchOperation::ReplaceSelection {
                markdown,
                summary: summary.trim().to_string(),
            })
        }
        AiDocumentPatchOperation::InsertBefore {
            anchor,
            markdown,
            summary,
        } => {
            let anchor = anchor.trim().to_string();
            let markdown = markdown.trim().to_string();
            (!anchor.is_empty() && !markdown.is_empty()).then_some(
                AiDocumentPatchOperation::InsertBefore {
                    anchor,
                    markdown,
                    summary: summary.trim().to_string(),
                },
            )
        }
        AiDocumentPatchOperation::InsertAfter {
            anchor,
            markdown,
            summary,
        } => {
            let anchor = anchor.trim().to_string();
            let markdown = markdown.trim().to_string();
            (!anchor.is_empty() && !markdown.is_empty()).then_some(
                AiDocumentPatchOperation::InsertAfter {
                    anchor,
                    markdown,
                    summary: summary.trim().to_string(),
                },
            )
        }
        AiDocumentPatchOperation::ReplaceText {
            anchor,
            markdown,
            summary,
        } => {
            let anchor = anchor.trim().to_string();
            let markdown = markdown.trim().to_string();
            (!anchor.is_empty() && !markdown.is_empty()).then_some(
                AiDocumentPatchOperation::ReplaceText {
                    anchor,
                    markdown,
                    summary: summary.trim().to_string(),
                },
            )
        }
        AiDocumentPatchOperation::DeleteText { anchor, summary } => {
            let anchor = anchor.trim().to_string();
            (!anchor.is_empty()).then_some(AiDocumentPatchOperation::DeleteText {
                anchor,
                summary: summary.trim().to_string(),
            })
        }
        AiDocumentPatchOperation::PrependDocument { markdown, summary } => {
            let markdown = markdown.trim().to_string();
            (!markdown.is_empty()).then_some(AiDocumentPatchOperation::PrependDocument {
                markdown,
                summary: summary.trim().to_string(),
            })
        }
        AiDocumentPatchOperation::AppendDocument { markdown, summary } => {
            let markdown = markdown.trim().to_string();
            (!markdown.is_empty()).then_some(AiDocumentPatchOperation::AppendDocument {
                markdown,
                summary: summary.trim().to_string(),
            })
        }
    }
}

fn document_patch_preview_text(patch: &AiDocumentPatch) -> String {
    let mut lines = Vec::new();
    if !patch.summary.trim().is_empty() {
        lines.push(patch.summary.trim().to_string());
    }
    lines.extend(
        patch
            .operations
            .iter()
            .enumerate()
            .map(|(index, operation)| {
                format!(
                    "{}. {}",
                    index + 1,
                    document_patch_operation_summary(operation)
                )
            }),
    );
    lines.join("\n")
}

fn document_patch_operation_summary(operation: &AiDocumentPatchOperation) -> String {
    match operation {
        AiDocumentPatchOperation::ReplaceSelection { summary, .. }
        | AiDocumentPatchOperation::InsertBefore { summary, .. }
        | AiDocumentPatchOperation::InsertAfter { summary, .. }
        | AiDocumentPatchOperation::ReplaceText { summary, .. }
        | AiDocumentPatchOperation::DeleteText { summary, .. }
        | AiDocumentPatchOperation::PrependDocument { summary, .. }
        | AiDocumentPatchOperation::AppendDocument { summary, .. }
            if !summary.trim().is_empty() =>
        {
            summary.trim().to_string()
        }
        AiDocumentPatchOperation::ReplaceSelection { .. } => "替换当前选中区域".to_string(),
        AiDocumentPatchOperation::InsertBefore { anchor, .. } => {
            format!("在“{}”前插入内容", anchor)
        }
        AiDocumentPatchOperation::InsertAfter { anchor, .. } => {
            format!("在“{}”后插入内容", anchor)
        }
        AiDocumentPatchOperation::ReplaceText { anchor, .. } => {
            format!("替换“{}”", anchor)
        }
        AiDocumentPatchOperation::DeleteText { anchor, .. } => {
            format!("删除“{}”", anchor)
        }
        AiDocumentPatchOperation::PrependDocument { .. } => "在文档开头插入内容".to_string(),
        AiDocumentPatchOperation::AppendDocument { .. } => "在文档末尾追加内容".to_string(),
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTableActionOutput {
    title: String,
    summary: String,
    #[serde(default)]
    patch: Option<crate::models::AiTablePatch>,
}

fn parse_table_action_output(
    content: &str,
    allow_new_fields: bool,
) -> AppResult<AiRunTableActionOutput> {
    let json = extract_json_object(content)?;
    let mut generated: GeneratedTableActionOutput = serde_json::from_str(json)
        .map_err(|error| AppError::Ai(format!("AI 表格结果不是有效 JSON：{error}")))?;
    generated.title = generated.title.trim().to_string();
    generated.summary = generated.summary.trim().to_string();
    let patch = generated
        .patch
        .map(|patch| normalize_table_patch(patch, allow_new_fields))
        .filter(|patch| {
        !patch.fields.is_empty() || !patch.records.is_empty() || patch.prefer_board
    });
    Ok(AiRunTableActionOutput {
        action_type: AiTableActionType::SummarizeTable,
        title: if generated.title.is_empty() {
            "多维表格 AI 预览".to_string()
        } else {
            generated.title
        },
        summary: generated.summary,
        patch,
    })
}

fn normalize_table_patch(
    mut patch: crate::models::AiTablePatch,
    allow_new_fields: bool,
) -> crate::models::AiTablePatch {
    patch.fields = if allow_new_fields {
        patch
            .fields
            .into_iter()
            .filter_map(|mut field| {
                field.name = field.name.trim().to_string();
                field.options = field
                    .options
                    .into_iter()
                    .map(|option| option.trim().to_string())
                    .filter(|option| !option.is_empty())
                    .take(20)
                    .collect();
                (!field.name.is_empty()).then_some(field)
            })
            .take(40)
            .collect()
    } else {
        Vec::new()
    };
    patch.records = patch
        .records
        .into_iter()
        .filter_map(|mut record| {
            record.title = record.title.trim().to_string();
            record.body = record.body.trim().to_string();
            (!record.title.is_empty() || !record.values.is_empty() || !record.body.is_empty())
                .then_some(record)
        })
        .take(200)
        .collect();
    patch
}

fn table_action_allows_new_fields(input: &AiRunTableActionInput) -> bool {
    matches!(input.action_type, AiTableActionType::GenerateFields)
        || user_requested_table_fields(&input.instruction)
}

fn user_requested_table_fields(instruction: &str) -> bool {
    [
        "新增字段",
        "添加字段",
        "生成字段",
        "创建字段",
        "加字段",
        "补字段",
    ]
    .iter()
    .any(|keyword| instruction.contains(keyword))
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedSpreadsheetActionOutput {
    title: String,
    summary: String,
    #[serde(default)]
    patch: Option<crate::models::AiSpreadsheetPatch>,
}

fn parse_spreadsheet_action_output(content: &str) -> AppResult<AiRunSpreadsheetActionOutput> {
    let json = extract_json_object(content)?;
    let mut generated: GeneratedSpreadsheetActionOutput = serde_json::from_str(json)
        .map_err(|error| AppError::Ai(format!("AI 表格结果不是有效 JSON：{error}")))?;
    generated.title = generated.title.trim().to_string();
    generated.summary = generated.summary.trim().to_string();
    let patch = generated
        .patch
        .map(normalize_spreadsheet_patch)
        .filter(|patch| !patch.sheets.is_empty() || !patch.append_rows.is_empty());
    Ok(AiRunSpreadsheetActionOutput {
        action_type: AiSpreadsheetActionType::SummarizeSpreadsheet,
        title: if generated.title.is_empty() {
            "表格 AI 预览".to_string()
        } else {
            generated.title
        },
        summary: generated.summary,
        patch,
    })
}

fn normalize_spreadsheet_patch(
    mut patch: crate::models::AiSpreadsheetPatch,
) -> crate::models::AiSpreadsheetPatch {
    patch.sheets = patch
        .sheets
        .into_iter()
        .filter_map(|mut sheet| {
            sheet.name = sheet.name.trim().to_string();
            sheet.rows = normalize_spreadsheet_rows(sheet.rows);
            (!sheet.name.is_empty() && !sheet.rows.is_empty()).then_some(sheet)
        })
        .take(12)
        .collect();
    patch.append_rows = normalize_spreadsheet_rows(patch.append_rows);
    patch
}

fn normalize_spreadsheet_rows(rows: Vec<Vec<serde_json::Value>>) -> Vec<Vec<serde_json::Value>> {
    rows.into_iter()
        .filter_map(|row| {
            let cells: Vec<serde_json::Value> = row
                .into_iter()
                .take(100)
                .map(normalize_spreadsheet_cell_value)
                .collect();
            cells.iter().any(|cell| !cell.is_null()).then_some(cells)
        })
        .take(1000)
        .collect()
}

fn normalize_spreadsheet_cell_value(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::String(value) => serde_json::Value::String(value.trim().to_string()),
        serde_json::Value::Number(_) | serde_json::Value::Bool(_) | serde_json::Value::Null => value,
        other => serde_json::Value::String(other.to_string()),
    }
}

fn extract_json_object(content: &str) -> AppResult<&str> {
    let trimmed = content.trim();
    let fenced = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```JSON"))
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|value| value.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(trimmed);
    let start = fenced
        .find('{')
        .ok_or_else(|| AppError::Ai("AI 结果缺少 JSON 对象".to_string()))?;
    let end = fenced
        .rfind('}')
        .ok_or_else(|| AppError::Ai("AI 结果缺少 JSON 对象结束符".to_string()))?;
    if end < start {
        return Err(AppError::Ai("AI 结果 JSON 范围无效".to_string()));
    }
    Ok(&fenced[start..=end])
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_ai_settings, parse_document_patch_output, parse_split_document_output,
        parse_table_action_output,
    };
    use crate::models::{
        AiConfiguredModel, AiDocumentPatchOperation, AiInputModality, AiModelCapabilityType,
        AiModelProfile, AiProtocol, AiSettings, AiTableActionType,
    };

    #[test]
    fn vision_model_keeps_text_and_image_input_modalities() {
        let settings = normalize_ai_settings(AiSettings {
            active_model_id: Some("p:gpt-vision".to_string()),
            profiles: vec![AiModelProfile {
                id: "p".to_string(),
                name: "OpenAI".to_string(),
                protocol: AiProtocol::OpenaiResponses,
                base_url: "https://api.openai.com/v1".to_string(),
                enabled: true,
                has_api_key: true,
                models: vec![AiConfiguredModel {
                    id: "p:gpt-vision".to_string(),
                    profile_id: "p".to_string(),
                    model_id: "gpt-vision".to_string(),
                    display_name: "GPT Vision".to_string(),
                    protocol: AiProtocol::OpenaiResponses,
                    enabled: true,
                    capability_types: vec![AiModelCapabilityType::Vision],
                    supported_input_modalities: Vec::new(),
                }],
            }],
        })
        .unwrap();

        assert_eq!(
            settings.profiles[0].models[0].supported_input_modalities,
            vec![AiInputModality::Text, AiInputModality::Image]
        );
    }

    #[test]
    fn clears_active_model_when_model_is_disabled() {
        let settings = normalize_ai_settings(AiSettings {
            active_model_id: Some("p:gpt".to_string()),
            profiles: vec![AiModelProfile {
                id: "p".to_string(),
                name: "OpenAI".to_string(),
                protocol: AiProtocol::OpenaiResponses,
                base_url: "https://api.openai.com".to_string(),
                enabled: true,
                has_api_key: true,
                models: vec![AiConfiguredModel {
                    id: "p:gpt".to_string(),
                    profile_id: "p".to_string(),
                    model_id: "gpt".to_string(),
                    display_name: "GPT".to_string(),
                    protocol: AiProtocol::OpenaiResponses,
                    enabled: false,
                    capability_types: Vec::new(),
                    supported_input_modalities: Vec::new(),
                }],
            }],
        })
        .unwrap();

        assert_eq!(settings.active_model_id, None);
    }

    #[test]
    fn parses_split_document_json_from_fenced_output() {
        let output = parse_split_document_output(
            "```json\n{\"title\":\"拆分\",\"parts\":[{\"title\":\"上\",\"content\":\"A\"},{\"title\":\"下\",\"content\":\"B\"}]}\n```",
        )
        .unwrap();

        assert_eq!(output.title, "拆分");
        assert_eq!(output.parts.len(), 2);
    }

    #[test]
    fn parses_table_action_patch_and_trims_empty_candidates() {
        let output = parse_table_action_output(
            "{\"title\":\"任务\",\"summary\":\"摘要\",\"patch\":{\"fields\":[{\"name\":\"状态\",\"type\":\"singleSelect\",\"options\":[\"待办\",\"\"]}],\"records\":[{\"title\":\"任务一\",\"values\":{\"状态\":\"待办\"},\"body\":\"正文\"}],\"preferBoard\":true}}",
            true,
        )
        .unwrap();

        assert_eq!(output.action_type, AiTableActionType::SummarizeTable);
        let patch = output.patch.unwrap();
        assert_eq!(patch.fields[0].options, vec!["待办"]);
        assert_eq!(patch.records[0].title, "任务一");
        assert!(patch.prefer_board);
    }

    #[test]
    fn drops_table_fields_when_action_does_not_allow_new_fields() {
        let output = parse_table_action_output(
            "{\"title\":\"任务\",\"summary\":\"摘要\",\"patch\":{\"fields\":[{\"name\":\"状态\",\"type\":\"singleSelect\",\"options\":[\"待办\"]}],\"records\":[{\"title\":\"任务一\",\"values\":{\"状态\":\"待办\"},\"body\":\"正文\"}]}}",
            false,
        )
        .unwrap();

        let patch = output.patch.unwrap();
        assert!(patch.fields.is_empty());
        assert_eq!(patch.records[0].title, "任务一");
    }

    #[test]
    fn parses_document_patch_json_and_drops_empty_operations() {
        let patch = parse_document_patch_output(
            "{\"summary\":\"新增表格\",\"operations\":[{\"type\":\"append-document\",\"markdown\":\"| A | B |\",\"summary\":\"追加表格\"},{\"type\":\"insert-after\",\"anchor\":\"\",\"markdown\":\"无效\"}]}",
        )
        .unwrap();

        assert_eq!(patch.summary, "新增表格");
        assert_eq!(patch.operations.len(), 1);
        assert!(matches!(
            patch.operations[0],
            AiDocumentPatchOperation::AppendDocument { .. }
        ));
    }
}
