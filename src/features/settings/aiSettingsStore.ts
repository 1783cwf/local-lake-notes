import type {
  AiConfiguredModel,
  AiInputModality,
  AiModelCapabilityType,
  AiModelProfile,
  AiProtocol,
  AiSettings,
} from "../../app/appState";

export const aiCapabilityOptions: Array<{ value: AiModelCapabilityType; label: string }> = [
  { value: "vision", label: "视觉" },
  { value: "web", label: "联网" },
  { value: "reasoning", label: "推理" },
  { value: "tool", label: "工具" },
  { value: "rerank", label: "重排" },
  { value: "embedding", label: "嵌入" },
];

export const aiProtocolOptions: Array<{ value: AiProtocol; label: string }> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-chat-completions", label: "OpenAI Chat Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
];

export const defaultAiBaseUrls: Record<AiProtocol, string> = {
  "openai-responses": "https://api.openai.com",
  "openai-chat-completions": "https://api.openai.com",
  "anthropic-messages": "https://api.anthropic.com",
};

export const emptyAiSettings: AiSettings = {
  activeModelId: undefined,
  profiles: [],
};

export function mergeAiSettings(settings: AiSettings | null | undefined): AiSettings {
  const profiles = (settings?.profiles ?? []).map(normalizeAiProfile);
  const activeModelId = profiles.some((profile) => profile.models.some((model) => model.id === settings?.activeModelId))
    ? settings?.activeModelId
    : undefined;

  return {
    activeModelId,
    profiles,
  };
}

export function createAiProfile(protocol: AiProtocol = "openai-responses"): AiModelProfile {
  const id = `ai-${Date.now().toString(36)}`;
  return {
    id,
    name: protocol.startsWith("openai-") ? "OpenAI" : "Anthropic",
    protocol,
    baseUrl: defaultAiBaseUrls[protocol],
    enabled: true,
    models: [],
    hasApiKey: false,
  };
}

export function normalizeAiProfile(profile: AiModelProfile): AiModelProfile {
  const protocol = isAiProtocol(profile.protocol) ? profile.protocol : "openai-responses";
  const id = profile.id.trim() || `ai-${Date.now().toString(36)}`;
  return {
    ...profile,
    id,
    name: profile.name.trim() || "自定义模型",
    protocol,
    baseUrl: profile.baseUrl.trim() || defaultAiBaseUrls[protocol],
    enabled: profile.enabled ?? true,
    hasApiKey: Boolean(profile.hasApiKey),
    models: (profile.models ?? []).map((model) => normalizeAiModel({ ...model, profileId: id, protocol })),
  };
}

export function normalizeAiModel(model: AiConfiguredModel): AiConfiguredModel {
  const modelId = model.modelId.trim();
  const capabilityTypes = uniqueCapabilityTypes(model.capabilityTypes ?? []);
  return {
    ...model,
    id: model.id.trim() || `${model.profileId}:${modelId}`,
    modelId,
    displayName: model.displayName.trim() || modelId,
    enabled: model.enabled ?? true,
    capabilityTypes,
    supportedInputModalities: inputModalitiesForCapabilities(capabilityTypes),
  };
}

export function inputModalitiesForCapabilities(capabilities: AiModelCapabilityType[]): AiInputModality[] {
  return capabilities.includes("vision") ? ["text", "image"] : ["text"];
}

export function validateAiSettings(settings: AiSettings): string | null {
  const profileIds = new Set<string>();
  const modelIds = new Set<string>();

  for (const profile of settings.profiles) {
    if (!profile.id.trim()) {
      return "模型配置 ID 不能为空";
    }
    if (profileIds.has(profile.id)) {
      return "模型配置 ID 不能重复";
    }
    profileIds.add(profile.id);
    if (!profile.baseUrl.trim()) {
      return "请填写模型服务地址";
    }
    for (const model of profile.models) {
      if (!model.modelId.trim()) {
        return "模型 ID 不能为空";
      }
      if (modelIds.has(model.id)) {
        return "模型不能重复";
      }
      modelIds.add(model.id);
    }
  }

  return null;
}

function isAiProtocol(value: unknown): value is AiProtocol {
  return value === "openai-responses" || value === "openai-chat-completions" || value === "anthropic-messages";
}

function uniqueCapabilityTypes(capabilities: AiModelCapabilityType[]): AiModelCapabilityType[] {
  const allowed = new Set(aiCapabilityOptions.map((option) => option.value));
  return [...new Set(capabilities)].filter((capability) => allowed.has(capability));
}
