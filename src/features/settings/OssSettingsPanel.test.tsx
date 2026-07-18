import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ResourceMigrationRunOutput } from "../../app/appState";
import { OssSettingsPanel } from "./OssSettingsPanel";

function renderPanel(overrides: Partial<Parameters<typeof OssSettingsPanel>[0]> = {}) {
  return render(
    <OssSettingsPanel
      open
      settings={null}
      typographySettings={{ fontFamily: "system-ui", defaultFontSize: 19 }}
      aiSettings={{ profiles: [] }}
      databaseLocation={{
        directory: "/tmp/local-lake-db",
        databasePath: "/tmp/local-lake-db/yuque-lake-notes.sqlite3",
        custom: false,
      }}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onSaveTypographySettings={vi.fn(async (settings) => settings)}
      onSaveAiSettings={vi.fn(async (input) => input.settings)}
      onListAiModels={vi.fn(async () => [])}
      onAddAiModel={vi.fn(async () => ({ profiles: [] }))}
      onSetActiveAiModel={vi.fn(async () => ({ profiles: [] }))}
      onChooseDatabaseDirectory={vi.fn(async () => "/tmp/new-db")}
      onChooseStorageDirectory={vi.fn(async () => "/tmp/file-storage")}
      onSaveDatabaseLocation={vi.fn()}
      backupKeyStatus={{ configured: false, needsKey: false }}
      resourceKeyStatus={{ configured: false, needsKey: false, knownFingerprints: [] }}
      backupRecords={[]}
      backupBusy={false}
      resourceKeyBusy={false}
      activeBackupOperation={null}
      onSetBackupKey={vi.fn()}
      onSetResourceKey={vi.fn()}
      onVerifyResourceKey={vi.fn()}
      onCreateBackup={vi.fn()}
      onRestoreBackup={vi.fn()}
      onDeleteBackup={vi.fn()}
      onTestStorageConnection={vi.fn(async (settings) => ({
        provider: settings.activeProvider,
        storageId: settings.activeProvider === "local"
          ? settings.local.storageId
          : settings.activeProvider === "webdav"
            ? settings.webdav.storageId
            : settings.bucket,
        ok: true,
        message: "连接测试成功",
      }))}
      onAnalyzeResourceMigration={vi.fn(async () => ({
        totalReferences: 0,
        uniqueResources: 0,
        documentCount: 0,
        totalBytes: 0,
        migratedResources: [],
        skippedResources: [],
        unreadableResources: [],
        conflictResources: [],
      }))}
      onRunResourceMigration={vi.fn()}
      {...overrides}
    />,
  );
}

test("保存前校验 OSS 必填项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  renderPanel({ onSave });

  expect(screen.getByRole("button", { name: "文件存储" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("请填写 S3 Endpoint")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("点击设置面板外的遮罩关闭设置", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { container } = renderPanel({ onClose });

  await user.click(screen.getByLabelText("S3 Endpoint"));
  expect(onClose).not.toHaveBeenCalled();

  const backdrop = container.querySelector(".settings-backdrop");
  expect(backdrop).toBeInTheDocument();
  await user.click(backdrop!);

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("可以切换到备份恢复并设置密钥", async () => {
  const user = userEvent.setup();
  const onSetBackupKey = vi.fn().mockResolvedValue(undefined);
  const onSave = vi.fn();

  renderPanel({ onSetBackupKey, onSave });

  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.type(screen.getByLabelText("加密密钥"), "test-secret-key");
  await user.click(screen.getByRole("button", { name: "设置密钥" }));

  expect(onSetBackupKey).toHaveBeenCalledWith("test-secret-key", false);
  expect(onSave).not.toHaveBeenCalled();
});

test("可以保存全局字体设置且不触发文件存储保存", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onSaveTypographySettings = vi.fn(async (settings) => settings);

  renderPanel({ onSave, onSaveTypographySettings });

  await user.click(screen.getByRole("button", { name: "外观" }));
  await user.clear(screen.getByLabelText("全局字体"));
  await user.type(screen.getByLabelText("全局字体"), "Songti SC, serif");
  await user.selectOptions(screen.getByLabelText("默认字号"), "22");
  await user.click(screen.getByRole("button", { name: "保存外观设置" }));

  expect(onSaveTypographySettings).toHaveBeenCalledWith({
    fontFamily: "Songti SC, serif",
    defaultFontSize: 22,
  });
  expect(onSave).not.toHaveBeenCalled();
});

test("可以切换到资源加密并设置资源密钥", async () => {
  const user = userEvent.setup();
  const onSetResourceKey = vi.fn().mockResolvedValue(undefined);

  renderPanel({ onSetResourceKey });

  await user.click(screen.getByRole("button", { name: "资源加密" }));
  await user.type(screen.getByLabelText("资源加密密钥"), "resource-secret-key");
  await user.click(screen.getByRole("button", { name: "设置资源密钥" }));

  expect(onSetResourceKey).toHaveBeenCalledWith("resource-secret-key", false);
  expect(screen.getAllByText("tmp/exports/").length).toBeGreaterThan(0);
});

test("可以手动重新读取本地资源密钥", async () => {
  const user = userEvent.setup();
  const onVerifyResourceKey = vi.fn().mockResolvedValue({
    configured: true,
    needsKey: false,
    fingerprint: "resource-fingerprint",
    knownFingerprints: ["resource-fingerprint"],
  });

  renderPanel({
    onVerifyResourceKey,
    resourceKeyStatus: {
      configured: true,
      needsKey: false,
      fingerprint: "resource-fingerprint",
      knownFingerprints: ["resource-fingerprint"],
    },
  });

  await user.click(screen.getByRole("button", { name: "资源加密" }));
  await user.click(screen.getByRole("button", { name: "重新读取密钥" }));

  expect(onVerifyResourceKey).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("本地资源密钥读取成功")).toBeInTheDocument();
});

test("可以选择并保存数据库目录", async () => {
  const user = userEvent.setup();
  const onChooseDatabaseDirectory = vi.fn(async () => "/tmp/new-db");
  const onSaveDatabaseLocation = vi.fn().mockResolvedValue(undefined);

  renderPanel({ onChooseDatabaseDirectory, onSaveDatabaseLocation });

  await user.click(screen.getByRole("button", { name: "数据存储" }));
  expect(screen.getByDisplayValue("/tmp/local-lake-db")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "选择" }));
  await user.click(screen.getByRole("button", { name: "保存目录" }));

  expect(onChooseDatabaseDirectory).toHaveBeenCalledTimes(1);
  expect(onSaveDatabaseLocation).toHaveBeenCalledWith("/tmp/new-db");
  expect(await screen.findByText("数据库目录已保存并切换")).toBeInTheDocument();
});

test("删除备份前需要二次确认并提示依赖增量备份", async () => {
  const user = userEvent.setup();
  const onDeleteBackup = vi.fn().mockResolvedValue(undefined);

  renderPanel({
    onDeleteBackup,
    backupRecords: [
      {
        id: "backup-2",
        backupType: "incremental",
        baseBackupId: "backup-1",
        createdAt: "2026-05-04T01:08:23Z",
        keyFingerprint: "fingerprint",
        encryptedSize: 2048,
        archiveHash: "hash-2",
        objectKey: "backup-2.ylbackup",
        canRestore: true,
      },
      {
        id: "backup-1",
        backupType: "full",
        createdAt: "2026-05-04T01:07:23Z",
        keyFingerprint: "fingerprint",
        encryptedSize: 1024,
        archiveHash: "hash",
        objectKey: "backup.ylbackup",
        canRestore: true,
      },
    ],
  });

  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.click(screen.getAllByRole("button", { name: /删除备份/ })[1]);

  expect(onDeleteBackup).not.toHaveBeenCalled();
  expect(screen.getByText("删除当前备份会同时删除以下依赖增量备份：")).toBeInTheDocument();
  expect(screen.getByText(/增量 ·/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(onDeleteBackup).toHaveBeenCalledWith("backup-1");
});

test("备份任务执行中展示 loading 状态", async () => {
  renderPanel({
    backupBusy: true,
    activeBackupOperation: "create-incremental",
  });

  await userEvent.click(screen.getByRole("button", { name: "备份恢复" }));

  expect(screen.getByText("正在创建增量备份...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "备份中" })).toBeDisabled();
});

test("本地存储可以选择目录并保存 provider 配置", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onChooseStorageDirectory = vi.fn(async () => "/tmp/file-storage");

  renderPanel({ onSave, onChooseStorageDirectory });

  await user.click(screen.getByRole("button", { name: "本地" }));
  await user.click(screen.getByRole("button", { name: "选择" }));
  await user.click(screen.getByRole("button", { name: "设为当前激活" }));
  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(onChooseStorageDirectory).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    activeProvider: "local",
    local: expect.objectContaining({ rootDirectory: "/tmp/file-storage" }),
  }));
});

test("WebDAV 存储缺少地址时保存失败", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  renderPanel({ onSave });

  await user.click(screen.getByRole("button", { name: "WebDAV" }));
  await user.click(screen.getByRole("button", { name: "设为当前激活" }));
  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("请填写 WebDAV 地址")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("切换存储配置页签不会直接改变当前激活存储", async () => {
  const user = userEvent.setup();

  renderPanel();

  expect(screen.getByText("当前激活存储")).toBeInTheDocument();
  expect(screen.getByText("S3 / 未设置")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "本地" }));

  expect(screen.getByText("S3 / 未设置")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "设为当前激活" })).toBeInTheDocument();
});

test("文件存储顶部展示明确的保存按钮", () => {
  renderPanel();

  expect(screen.getByRole("button", { name: "保存存储设置" })).toBeInTheDocument();
});

test("AI 已配置模型会明确展示当前使用模型并支持删除", async () => {
  const user = userEvent.setup();
  const onSaveAiSettings = vi.fn(async (input) => input.settings);

  renderPanel({
    aiSettings: {
      activeModelId: "openai:gpt-4o",
      profiles: [{
        id: "openai",
        name: "OpenAI",
        protocol: "openai-responses",
        baseUrl: "https://api.openai.com",
        enabled: true,
        hasApiKey: true,
        models: [
          {
            id: "openai:gpt-4o",
            profileId: "openai",
            modelId: "gpt-4o",
            displayName: "gpt-4o",
            protocol: "openai-responses",
            enabled: true,
            capabilityTypes: ["vision"],
            supportedInputModalities: ["text", "image"],
          },
          {
            id: "openai:gpt-4o-mini",
            profileId: "openai",
            modelId: "gpt-4o-mini",
            displayName: "gpt-4o-mini",
            protocol: "openai-responses",
            enabled: true,
            capabilityTypes: [],
            supportedInputModalities: ["text"],
          },
        ],
      }],
    },
    onSaveAiSettings,
  });

  await user.click(screen.getByRole("button", { name: "AI 模型" }));

  expect(screen.getByRole("button", { name: "当前使用 gpt-4o" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("当前使用")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "删除模型 gpt-4o" }));
  await user.click(screen.getByRole("button", { name: "保存 AI 设置" }));

  expect(onSaveAiSettings).toHaveBeenCalledWith(expect.objectContaining({
    settings: expect.objectContaining({
      activeModelId: undefined,
      profiles: [expect.objectContaining({
        models: [expect.objectContaining({ id: "openai:gpt-4o-mini" })],
      })],
    }),
  }));
});

test("S3 和 WebDAV 页签内都可以配置资源预览策略", async () => {
  const user = userEvent.setup();

  renderPanel();

  expect(screen.getByLabelText("资源并发访问请求数")).toHaveValue(6);
  expect(screen.getByLabelText("图片体积优化")).toHaveValue("original");

  await user.clear(screen.getByLabelText("资源并发访问请求数"));
  await user.type(screen.getByLabelText("资源并发访问请求数"), "8");
  await user.selectOptions(screen.getByLabelText("图片体积优化"), "compact");
  await user.click(screen.getByRole("button", { name: "WebDAV" }));

  expect(screen.getByLabelText("资源并发访问请求数")).toHaveValue(8);
  expect(screen.getByLabelText("图片体积优化")).toHaveValue("compact");
});

test("连接测试使用当前正在编辑的存储配置", async () => {
  const user = userEvent.setup();
  const onTestStorageConnection = vi.fn(async (settings) => ({
    provider: settings.activeProvider,
    storageId: settings.webdav.storageId,
    ok: true,
    message: "连接测试成功",
  }));

  renderPanel({
    onTestStorageConnection,
    settings: {
      activeProvider: "s3",
      endpoint: "https://s3.example",
      bucket: "notes",
      region: "us-east-1",
      accessKeyId: "ak",
      secretAccessKey: "sk",
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
      local: { rootDirectory: "", storageId: "local" },
      webdav: {
        endpoint: "https://dav.example/webdav",
        username: "user",
        password: "pass",
        rootPath: "yuque",
        storageId: "webdav",
      },
    },
  });

  await user.click(screen.getByRole("button", { name: "WebDAV" }));
  await user.click(screen.getByRole("button", { name: "连接测试" }));

  expect(onTestStorageConnection).toHaveBeenCalledWith(expect.objectContaining({
    activeProvider: "webdav",
    webdav: expect.objectContaining({
      endpoint: "https://dav.example/webdav",
      rootPath: "yuque",
    }),
  }));
  expect(await screen.findByText("连接成功：WebDAV / webdav 可用")).toBeInTheDocument();
});

test("连接测试失败时在按钮附近显示失败原因", async () => {
  const user = userEvent.setup();

  renderPanel();

  await user.click(screen.getByRole("button", { name: "连接测试" }));

  expect(await screen.findByText("连接失败：请填写 S3 Endpoint")).toBeInTheDocument();
});

test("资源迁移先执行 dry-run 清点", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onAnalyzeResourceMigration = vi.fn(async () => ({
    totalReferences: 2,
    uniqueResources: 1,
    documentCount: 1,
    totalBytes: 12,
    migratedResources: [],
    skippedResources: [],
    unreadableResources: [],
    conflictResources: [],
  }));

  renderPanel({
    settings: {
      activeProvider: "local",
      endpoint: "",
      bucket: "notes",
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
      local: { rootDirectory: "/tmp/file-storage", storageId: "local" },
      webdav: { endpoint: "", username: "", password: "", rootPath: "", storageId: "webdav" },
    },
    onSave,
    onAnalyzeResourceMigration,
  });

  await user.type(screen.getByLabelText("旧存储标识"), "-old");
  await user.click(screen.getByRole("button", { name: "Dry-run 清点" }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    activeProvider: "local",
    local: expect.objectContaining({ rootDirectory: "/tmp/file-storage" }),
  }));
  expect(onAnalyzeResourceMigration).toHaveBeenCalledWith({
    source: { provider: "s3", storageId: "notes-old" },
    target: { provider: "local", storageId: "local" },
  });
  expect(await screen.findByText("待迁移资源：1")).toBeInTheDocument();
});

test("执行资源迁移时展示进行中和成功提示", async () => {
  const user = userEvent.setup();
  let resolveRun!: () => void;
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onAnalyzeResourceMigration = vi.fn(async () => ({
    totalReferences: 2,
    uniqueResources: 1,
    documentCount: 1,
    totalBytes: 12,
    migratedResources: [],
    skippedResources: [],
    unreadableResources: [],
    conflictResources: [],
  }));
  const onRunResourceMigration = vi.fn(() => new Promise<ResourceMigrationRunOutput>((resolve) => {
    resolveRun = () => {
      resolve({
        analysis: {
          totalReferences: 2,
          uniqueResources: 1,
          documentCount: 1,
          totalBytes: 12,
          migratedResources: [],
          skippedResources: [],
          unreadableResources: [],
          conflictResources: [],
        },
        rewrittenDocuments: ["a.lake"],
        copiedResources: 1,
      });
    };
  }));

  renderPanel({
    settings: {
      activeProvider: "local",
      endpoint: "",
      bucket: "notes",
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
      local: { rootDirectory: "/tmp/file-storage", storageId: "local" },
      webdav: { endpoint: "", username: "", password: "", rootPath: "", storageId: "webdav" },
    },
    onSave,
    onAnalyzeResourceMigration,
    onRunResourceMigration,
  });

  await user.click(screen.getByRole("button", { name: "Dry-run 清点" }));
  await screen.findByText("待迁移资源：1");
  await user.click(screen.getByRole("button", { name: "执行迁移" }));

  expect(await screen.findByText("正在复制资源并重写引用...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "迁移中" })).toBeDisabled();

  resolveRun();

  expect(await screen.findByText("迁移成功：已复制 1 个资源，重写 1 个文档")).toBeInTheDocument();
});
