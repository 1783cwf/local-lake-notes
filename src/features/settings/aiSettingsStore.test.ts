import { describe, expect, test } from "vitest";

import { createAiProfile, inputModalitiesForCapabilities, mergeAiSettings } from "./aiSettingsStore";

describe("aiSettingsStore", () => {
  test("视觉能力模型可以处理文本和图片输入", () => {
    expect(inputModalitiesForCapabilities(["vision"])).toEqual(["text", "image"]);
  });

  test("补齐模型配置默认值", () => {
    const profile = createAiProfile("anthropic-messages");
    const settings = mergeAiSettings({
      profiles: [{
        ...profile,
        baseUrl: "",
        models: [{
          id: "",
          profileId: profile.id,
          modelId: "claude-sonnet-4-5",
          displayName: "",
          protocol: "anthropic-messages",
          enabled: true,
          capabilityTypes: ["reasoning"],
          supportedInputModalities: [],
        }],
      }],
    });

    expect(settings.profiles[0].baseUrl).toBe("https://api.anthropic.com");
    expect(settings.profiles[0].models[0]).toMatchObject({
      id: `${profile.id}:claude-sonnet-4-5`,
      displayName: "claude-sonnet-4-5",
      supportedInputModalities: ["text"],
    });
  });

  test("支持创建 OpenAI Chat Completions 配置", () => {
    const profile = createAiProfile("openai-chat-completions");
    const settings = mergeAiSettings({ profiles: [profile] });

    expect(profile.name).toBe("OpenAI");
    expect(settings.profiles[0]).toMatchObject({
      protocol: "openai-chat-completions",
      baseUrl: "https://api.openai.com",
    });
  });
});
