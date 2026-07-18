import { beforeEach, describe, expect, test } from "vitest";

import {
  addAiModelToProfile,
  createLakeDocument,
  createWorkspaceRoot,
  forgetWorkspaceRoot,
  getAiSettings,
  getOssSettings,
  getRecentWorkspace,
  listKnownWorkspaces,
  listLakeDocuments,
  readLakeDocument,
  saveAiSettings,
  saveOssSettings,
  setActiveAiModel,
  setWorkspaceRoot,
  uploadImage,
  writeLakeDocument,
} from "./tauri";

describe("tauri browser workspace fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("从旧单知识库缓存迁移到已知知识库列表", async () => {
    window.localStorage.setItem(
      "yuque-lake-notes.browser-workspace",
      JSON.stringify({
        root: "/browser-preview/legacy",
        directories: [],
        documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", kind: "lake", size: 1 }],
        order: ["document:a.lake"],
      }),
    );

    const recent = await getRecentWorkspace();
    const known = await listKnownWorkspaces();

    expect(recent?.root).toBe("/browser-preview/legacy");
    expect(recent?.documents.map((document) => document.path)).toEqual(["a.lake"]);
    expect(known).toMatchObject([{ root: "/browser-preview/legacy", name: "legacy" }]);
  });

  test("支持添加和切换多个浏览器知识库", async () => {
    await setWorkspaceRoot("/browser-preview/work");
    await createLakeDocument("测试文件1", "");
    await setWorkspaceRoot("/browser-preview/life");
    await createLakeDocument("生活", "");

    const known = await listKnownWorkspaces();
    expect(known.map((workspace) => workspace.root)).toEqual([
      "/browser-preview/life",
      "/browser-preview/work",
    ]);

    await setWorkspaceRoot("/browser-preview/work");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["测试文件1.lake"]);

    await setWorkspaceRoot("/browser-preview/life");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["生活.lake"]);
  });

  test("新建知识库会创建新的 root 并激活", async () => {
    const workspace = await createWorkspaceRoot("/browser-preview", "测试 目录1");

    expect(workspace.root).toBe("/browser-preview/测试-目录1");
    expect((await getRecentWorkspace())?.root).toBe("/browser-preview/测试-目录1");
    expect(await listKnownWorkspaces()).toMatchObject([
      { root: "/browser-preview/测试-目录1", name: "测试-目录1" },
    ]);
  });

  test("不同知识库中的同名文档内容互不覆盖", async () => {
    await setWorkspaceRoot("/browser-preview/a");
    const first = await createLakeDocument("同名", "");
    await writeLakeDocument(first.createdDocument.path, "<p>a</p>");

    await setWorkspaceRoot("/browser-preview/b");
    const second = await createLakeDocument("同名", "");
    await writeLakeDocument(second.createdDocument.path, "<p>b</p>");

    await setWorkspaceRoot("/browser-preview/a");
    expect(await readLakeDocument("同名.lake")).toBe("<p>a</p>");

    await setWorkspaceRoot("/browser-preview/b");
    expect(await readLakeDocument("同名.lake")).toBe("<p>b</p>");
  });

  test("浏览器 fallback 支持在文档子级容器中新建文档", async () => {
    await setWorkspaceRoot("/browser-preview/work");
    await createLakeDocument("长文", "");
    const payload = await createLakeDocument("第一部分", "长文");

    expect(payload.createdDocument.path).toBe("长文/第一部分.lake");
    expect(payload.directories).toEqual([
      expect.objectContaining({ path: "长文", isDocumentChildContainer: true }),
    ]);
    expect(await readLakeDocument("长文/第一部分.lake")).toContain("ne-text");
  });

  test("从列表移除知识库不会影响其他知识库", async () => {
    await setWorkspaceRoot("/browser-preview/a");
    await createLakeDocument("A", "");
    await setWorkspaceRoot("/browser-preview/b");
    await createLakeDocument("B", "");

    const known = await forgetWorkspaceRoot("/browser-preview/b");

    expect(known.map((workspace) => workspace.root)).toEqual(["/browser-preview/a"]);
    expect(await getRecentWorkspace()).toBeNull();

    await setWorkspaceRoot("/browser-preview/a");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["A.lake"]);
  });

  test("旧浏览器 OSS 设置会补齐 provider 默认值", async () => {
    window.localStorage.setItem(
      "yuque-lake-notes.browser-oss-settings",
      JSON.stringify({
        endpoint: "https://s3.example.test",
        bucket: "legacy",
        region: "us-east-1",
        accessKeyId: "ak",
        secretAccessKey: "sk",
        forcePathStyle: true,
        imagePrefix: "images",
        filePrefix: "files",
        backupPrefix: "backups",
        defaultExportResourceStrategy: "bundle",
        defaultSignedUrlTtlSeconds: 86400,
        maxSignedUrlTtlSeconds: 604800,
        allowSignedUrlExport: true,
        resourcePreviewConcurrency: 6,
        imageOptimization: "balanced",
      }),
    );

    await expect(getOssSettings()).resolves.toMatchObject({
      activeProvider: "s3",
      bucket: "legacy",
      local: { storageId: "local" },
      webdav: { storageId: "webdav" },
    });
  });

  test("浏览器上传资源引用会使用当前 provider", async () => {
    await saveOssSettings({
      activeProvider: "local",
      endpoint: "",
      bucket: "",
      region: "us-east-1",
      accessKeyId: "",
      secretAccessKey: "",
      publicBaseUrl: "",
      forcePathStyle: true,
      imagePrefix: "images",
      filePrefix: "files",
      backupPrefix: "backups",
      defaultExportResourceStrategy: "bundle",
      defaultSignedUrlTtlSeconds: 86400,
      maxSignedUrlTtlSeconds: 604800,
      allowSignedUrlExport: true,
      resourcePreviewConcurrency: 6,
      imageOptimization: "balanced",
      local: { rootDirectory: "/tmp/storage", storageId: "local" },
      webdav: { endpoint: "", username: "", password: "", rootPath: "", storageId: "webdav" },
    });

    const output = await uploadImage({ bytes: [1, 2, 3], filename: "a.png", mimeType: "image/png" });

    expect(output.resourceRef).toContain("provider=local");
    expect(output.resourceRef).toContain("yuque-resource://local/images");
  });

  test("浏览器 AI 设置不会持久化明文 API Key", async () => {
    const saved = await saveAiSettings({
      settings: {
        profiles: [{
          id: "openai",
          name: "OpenAI",
          protocol: "openai-responses",
          baseUrl: "https://api.openai.com/v1",
          enabled: true,
          hasApiKey: false,
          models: [],
        }],
      },
      apiKeys: [{ profileId: "openai", apiKey: "sk-secret" }],
    });

    expect(saved.profiles[0].hasApiKey).toBe(true);
    expect(window.localStorage.getItem("yuque-lake-notes.browser-ai-settings")).not.toContain("sk-secret");
  });

  test("浏览器 AI 设置支持添加并启用模型", async () => {
    await saveAiSettings({
      settings: {
        profiles: [{
          id: "openai",
          name: "OpenAI",
          protocol: "openai-responses",
          baseUrl: "https://api.openai.com",
          enabled: true,
          hasApiKey: true,
          models: [],
        }],
      },
    });

    await addAiModelToProfile({
      profileId: "openai",
      modelId: "gpt-5.5",
      displayName: "gpt-5.5",
      capabilityTypes: ["vision", "reasoning"],
    });
    await setActiveAiModel({ configuredModelId: "openai:gpt-5.5" });

    await expect(getAiSettings()).resolves.toMatchObject({
      activeModelId: "openai:gpt-5.5",
      profiles: [{
        models: [{
          modelId: "gpt-5.5",
          supportedInputModalities: ["text", "image"],
        }],
      }],
    });
  });
});
