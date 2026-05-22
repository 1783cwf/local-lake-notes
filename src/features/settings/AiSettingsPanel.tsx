import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Circle, Eye, Globe2, Plus, RefreshCw, Sparkles, Wrench, X } from "lucide-react";

import type {
  AiFetchedModel,
  AiModelCapabilityType,
  AiModelProfile,
  AiProtocol,
  AiSettings,
  SaveAiSettingsInput,
} from "../../app/appState";
import {
  aiCapabilityOptions,
  aiProtocolOptions,
  createAiProfile,
  mergeAiSettings,
  validateAiSettings,
} from "./aiSettingsStore";

interface AiSettingsPanelProps {
  settings: AiSettings;
  onSave: (input: SaveAiSettingsInput) => Promise<AiSettings>;
  onListModels: (profileId: string) => Promise<AiFetchedModel[]>;
  onAddModel: (profileId: string, model: AiFetchedModel, capabilityTypes: AiModelCapabilityType[]) => Promise<AiSettings>;
  onSetActiveModel: (configuredModelId: string) => Promise<AiSettings>;
}

export function AiSettingsPanel({
  settings,
  onSave,
  onListModels,
  onAddModel,
  onSetActiveModel,
}: AiSettingsPanelProps) {
  const [draft, setDraft] = useState(() => mergeAiSettings(settings));
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(settings.profiles[0]?.id ?? null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [deletedProfileIds, setDeletedProfileIds] = useState<string[]>([]);
  const [fetchedModels, setFetchedModels] = useState<AiFetchedModel[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Record<string, AiModelCapabilityType[]>>({});
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextSettings = mergeAiSettings(settings);
    setDraft(nextSettings);
    setSelectedProfileId((current) => current && nextSettings.profiles.some((profile) => profile.id === current)
      ? current
      : nextSettings.profiles[0]?.id ?? null);
    setApiKeys({});
    setDeletedProfileIds([]);
    setFetchedModels([]);
    setSelectedCapabilities({});
    setMessage(null);
    setError(null);
  }, [settings]);

  const selectedProfile = useMemo(
    () => draft.profiles.find((profile) => profile.id === selectedProfileId) ?? draft.profiles[0] ?? null,
    [draft.profiles, selectedProfileId],
  );

  const updateProfile = (profileId: string, updater: (profile: AiModelProfile) => AiModelProfile) => {
    setDraft((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === profileId ? updater(profile) : profile),
    }));
    setMessage(null);
    setError(null);
  };

  const addProfile = (protocol: AiProtocol) => {
    const profile = createAiProfile(protocol);
    setDraft((current) => ({
      ...current,
      profiles: [...current.profiles, profile],
    }));
    setSelectedProfileId(profile.id);
    setFetchedModels([]);
  };

  const removeProfile = (profileId: string) => {
    setDraft((current) => {
      const profiles = current.profiles.filter((profile) => profile.id !== profileId);
      const removedModelIds = new Set(current.profiles.find((profile) => profile.id === profileId)?.models.map((model) => model.id) ?? []);
      return {
        activeModelId: removedModelIds.has(current.activeModelId ?? "") ? undefined : current.activeModelId,
        profiles,
      };
    });
    setDeletedProfileIds((current) => [...new Set([...current, profileId])]);
    setSelectedProfileId((current) => current === profileId ? null : current);
    setFetchedModels([]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = mergeAiSettings(draft);
    const validationError = validateAiSettings(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await onSave({
        settings: normalized,
        apiKeys: Object.entries(apiKeys)
          .filter(([, apiKey]) => apiKey.trim())
          .map(([profileId, apiKey]) => ({ profileId, apiKey })),
        deletedProfileIds,
      });
      setDraft(saved);
      setApiKeys({});
      setDeletedProfileIds([]);
      setMessage("AI 模型设置已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const fetchModels = async () => {
    if (!selectedProfile) {
      return;
    }
    setLoadingModels(true);
    setError(null);
    setMessage(null);
    try {
      setFetchedModels(await onListModels(selectedProfile.id));
      setMessage("模型列表已更新");
    } catch (listError) {
      setError(listError instanceof Error ? listError.message : String(listError));
    } finally {
      setLoadingModels(false);
    }
  };

  const addFetchedModel = async (model: AiFetchedModel) => {
    if (!selectedProfile) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await onAddModel(
        selectedProfile.id,
        model,
        selectedCapabilities[model.modelId] ?? model.capabilityTypes ?? [],
      );
      setDraft(saved);
      setMessage("模型已添加");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setSaving(false);
    }
  };

  const setActiveModel = async (configuredModelId: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      setDraft(await onSetActiveModel(configuredModelId));
      setMessage("当前模型已切换");
    } catch (activeError) {
      setError(activeError instanceof Error ? activeError.message : String(activeError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-content ai-settings" onSubmit={submit} aria-labelledby="ai-settings-title">
      <div className="settings-content__heading">
        <h3 id="ai-settings-title">AI 模型</h3>
        <button type="submit" className="primary-button settings-content__save" disabled={saving}>
          <Check size={16} />
          {saving ? "保存中" : "保存 AI 设置"}
        </button>
      </div>

      <div className="ai-settings__toolbar">
        {aiProtocolOptions.map((option) => (
          <button key={option.value} type="button" className="secondary-button" onClick={() => addProfile(option.value)}>
            <Plus size={15} />
            {option.label}
          </button>
        ))}
      </div>

      {draft.profiles.length === 0 ? (
        <div className="settings-card">
          <div className="settings-card__title">
            <Bot size={16} />
            未配置模型
          </div>
          <p className="settings-card__text">添加 OpenAI Responses 或 Anthropic Messages 配置后即可获取模型列表。</p>
        </div>
      ) : (
        <div className="ai-settings__layout">
          <div className="ai-settings__profiles" role="list" aria-label="模型配置">
            {draft.profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={`ai-settings__profile${selectedProfile?.id === profile.id ? " is-active" : ""}`}
                onClick={() => {
                  setSelectedProfileId(profile.id);
                  setFetchedModels([]);
                }}
              >
                <span>{profile.name}</span>
                <small>{protocolLabel(profile.protocol)}</small>
              </button>
            ))}
          </div>

          {selectedProfile ? (
            <div className="ai-settings__detail">
              <div className="settings-provider-fields">
                <label>
                  配置名称
                  <input
                    value={selectedProfile.name}
                    onChange={(event) => updateProfile(selectedProfile.id, (profile) => ({ ...profile, name: event.target.value }))}
                  />
                </label>
                <label>
                  协议
                  <select
                    value={selectedProfile.protocol}
                    onChange={(event) => updateProfile(selectedProfile.id, (profile) => ({
                      ...profile,
                      protocol: event.target.value as AiProtocol,
                    }))}
                  >
                    {aiProtocolOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  API 地址
                  <input
                    value={selectedProfile.baseUrl}
                    onChange={(event) => updateProfile(selectedProfile.id, (profile) => ({ ...profile, baseUrl: event.target.value }))}
                  />
                </label>
                <label>
                  API Key
                  <input
                    type="password"
                    placeholder={selectedProfile.hasApiKey ? "已保存，留空表示不更新" : "保存后才可获取模型列表"}
                    value={apiKeys[selectedProfile.id] ?? ""}
                    onChange={(event) => setApiKeys((current) => ({ ...current, [selectedProfile.id]: event.target.value }))}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedProfile.enabled}
                    onChange={(event) => updateProfile(selectedProfile.id, (profile) => ({ ...profile, enabled: event.target.checked }))}
                  />
                  启用该配置
                </label>
              </div>

              <div className="ai-settings__actions">
                <button type="button" className="secondary-button" onClick={fetchModels} disabled={loadingModels || saving}>
                  <RefreshCw size={15} className={loadingModels ? "spin-icon" : undefined} />
                  {loadingModels ? "获取中" : "获取模型列表"}
                </button>
                <button type="button" className="secondary-button" onClick={() => removeProfile(selectedProfile.id)} disabled={saving}>
                  <X size={15} />
                  删除配置
                </button>
              </div>

              <section className="ai-settings__models" aria-label="已配置模型">
                <h4>已配置模型</h4>
                {selectedProfile.models.length === 0 ? (
                  <p className="settings-card__muted">暂无模型</p>
                ) : selectedProfile.models.map((model) => (
                  <div key={model.id} className="ai-settings__model">
                    <button
                      type="button"
                      className={`ai-settings__active${draft.activeModelId === model.id ? " is-active" : ""}`}
                      onClick={() => setActiveModel(model.id)}
                      aria-label={`启用 ${model.displayName}`}
                    >
                      <Circle size={12} />
                    </button>
                    <div>
                      <strong>{model.displayName}</strong>
                      <small>{model.modelId}</small>
                    </div>
                    <CapabilityTags capabilities={model.capabilityTypes} />
                  </div>
                ))}
              </section>

              <section className="ai-settings__models" aria-label="可添加模型">
                <h4>可添加模型</h4>
                {fetchedModels.length === 0 ? (
                  <p className="settings-card__muted">获取模型列表后可添加模型并标记能力。</p>
                ) : fetchedModels.map((model) => (
                  <div key={model.modelId} className="ai-settings__fetched-model">
                    <div>
                      <strong>{model.displayName}</strong>
                      <small>{model.modelId}</small>
                    </div>
                    <CapabilitySelector
                      value={selectedCapabilities[model.modelId] ?? model.capabilityTypes}
                      onChange={(capabilities) => setSelectedCapabilities((current) => ({
                        ...current,
                        [model.modelId]: capabilities,
                      }))}
                    />
                    <button type="button" className="secondary-button" onClick={() => addFetchedModel(model)} disabled={saving}>
                      <Plus size={15} />
                      添加
                    </button>
                  </div>
                ))}
              </section>
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="settings-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </form>
  );
}

function CapabilitySelector({
  value,
  onChange,
}: {
  value: AiModelCapabilityType[];
  onChange: (value: AiModelCapabilityType[]) => void;
}) {
  return (
    <div className="ai-capability-selector" aria-label="模型能力">
      {aiCapabilityOptions.map((option) => {
        const checked = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={checked ? "is-active" : ""}
            onClick={() => onChange(checked
              ? value.filter((capability) => capability !== option.value)
              : [...value, option.value])}
            aria-pressed={checked}
          >
            {capabilityIcon(option.value)}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CapabilityTags({ capabilities }: { capabilities: AiModelCapabilityType[] }) {
  if (capabilities.length === 0) {
    return <span className="ai-capability-tags">文本</span>;
  }
  return (
    <div className="ai-capability-tags">
      {capabilities.map((capability) => (
        <span key={capability}>{capabilityLabel(capability)}</span>
      ))}
    </div>
  );
}

function capabilityIcon(capability: AiModelCapabilityType) {
  switch (capability) {
    case "vision":
      return <Eye size={14} />;
    case "web":
      return <Globe2 size={14} />;
    case "reasoning":
      return <Sparkles size={14} />;
    case "tool":
      return <Wrench size={14} />;
    default:
      return <Bot size={14} />;
  }
}

function capabilityLabel(capability: AiModelCapabilityType): string {
  return aiCapabilityOptions.find((option) => option.value === capability)?.label ?? capability;
}

function protocolLabel(protocol: AiProtocol): string {
  return aiProtocolOptions.find((option) => option.value === protocol)?.label ?? protocol;
}
