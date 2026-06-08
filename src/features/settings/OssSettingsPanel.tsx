import type { FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { Bot, Check, CloudUpload, Database, DatabaseBackup, FolderOpen, Palette, ShieldCheck, X } from "lucide-react";

import type {
  AiFetchedModel,
  AiModelCapabilityType,
  AiSettings,
  BackupKeyStatus,
  BackupRecord,
  DatabaseLocationSettings,
  GlobalTypographySettings,
  OssSettings,
  ResourceMigrationAnalysisOutput,
  ResourceMigrationInput,
  ResourceMigrationRunOutput,
  RestoreBackupOutput,
  ResourceKeyStatus,
  SaveAiSettingsInput,
  StorageConnectionTestOutput,
  StorageProviderKind,
} from "../../app/appState";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { mergeOssSettings, validateOssSettings } from "./ossSettingsStore";
import { ResourceSecurityPanel } from "./ResourceSecurityPanel";
import {
  mergeTypographySettings,
  supportedDefaultFontSizes,
  validateTypographySettings,
} from "./typographySettingsStore";

type StorageConnectionNotice = {
  type: "success" | "error" | "pending";
  message: string;
} | null;

interface OssSettingsPanelProps {
  open: boolean;
  settings: OssSettings | null;
  typographySettings: GlobalTypographySettings;
  aiSettings: AiSettings;
  databaseLocation: DatabaseLocationSettings | null;
  onClose: () => void;
  onSave: (settings: OssSettings) => Promise<void>;
  onSaveTypographySettings: (settings: GlobalTypographySettings) => Promise<GlobalTypographySettings>;
  onSaveAiSettings: (input: SaveAiSettingsInput) => Promise<AiSettings>;
  onListAiModels: (profileId: string) => Promise<AiFetchedModel[]>;
  onAddAiModel: (profileId: string, model: AiFetchedModel, capabilityTypes: AiModelCapabilityType[]) => Promise<AiSettings>;
  onSetActiveAiModel: (configuredModelId: string) => Promise<AiSettings>;
  onChooseDatabaseDirectory: () => Promise<string | null>;
  onChooseStorageDirectory: () => Promise<string | null>;
  onSaveDatabaseLocation: (directory: string) => Promise<void>;
  backupKeyStatus: BackupKeyStatus;
  resourceKeyStatus: ResourceKeyStatus;
  backupRecords: BackupRecord[];
  backupBusy: boolean;
  resourceKeyBusy: boolean;
  activeBackupOperation: string | null;
  onSetBackupKey: (secret: string, reset: boolean) => Promise<void>;
  onSetResourceKey: (secret: string, reset: boolean) => Promise<void>;
  onVerifyResourceKey: () => Promise<ResourceKeyStatus>;
  onCreateBackup: (forceFull: boolean) => Promise<void>;
  onRestoreBackup: (backupId: string, allowKeyMismatch: boolean) => Promise<RestoreBackupOutput>;
  onDeleteBackup: (backupId: string) => Promise<void>;
  onTestStorageConnection: (settings: OssSettings) => Promise<StorageConnectionTestOutput>;
  onAnalyzeResourceMigration: (input: ResourceMigrationInput) => Promise<ResourceMigrationAnalysisOutput>;
  onRunResourceMigration: (input: ResourceMigrationInput) => Promise<ResourceMigrationRunOutput>;
}

export function OssSettingsPanel({
  open,
  settings,
  typographySettings,
  aiSettings,
  databaseLocation,
  onClose,
  onSave,
  onSaveTypographySettings,
  onSaveAiSettings,
  onListAiModels,
  onAddAiModel,
  onSetActiveAiModel,
  onChooseDatabaseDirectory,
  onChooseStorageDirectory,
  onSaveDatabaseLocation,
  backupKeyStatus,
  resourceKeyStatus,
  backupRecords,
  backupBusy,
  resourceKeyBusy,
  activeBackupOperation,
  onSetBackupKey,
  onSetResourceKey,
  onVerifyResourceKey,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onTestStorageConnection,
  onAnalyzeResourceMigration,
  onRunResourceMigration,
}: OssSettingsPanelProps) {
  const [draft, setDraft] = useState(() => mergeOssSettings(settings));
  const [selectedProvider, setSelectedProvider] = useState<StorageProviderKind>(() => mergeOssSettings(settings).activeProvider);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<StorageConnectionNotice>(null);
  const [databaseDirectory, setDatabaseDirectory] = useState(databaseLocation?.directory ?? "");
  const [databaseSaving, setDatabaseSaving] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [databaseMessage, setDatabaseMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"appearance" | "ai" | "upload" | "storage" | "security" | "backup">("upload");

  useEffect(() => {
    if (open) {
      const nextSettings = mergeOssSettings(settings);
      setDraft(nextSettings);
      setSelectedProvider(nextSettings.activeProvider);
      setDatabaseDirectory(databaseLocation?.directory ?? "");
      setError(null);
      setConnectionNotice(null);
      setDatabaseError(null);
      setDatabaseMessage(null);
      setActiveTab("upload");
    }
  }, [databaseLocation, open, settings]);

  if (!open) {
    return null;
  }

  const update = (key: keyof OssSettings, value: string | boolean | number) => {
    setConnectionNotice(null);
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };
  const selectProvider = (provider: StorageProviderKind) => {
    setSelectedProvider(provider);
    setConnectionNotice(null);
    setError(null);
  };
  const activateProvider = (provider: StorageProviderKind) => {
    setDraft((current) => ({
      ...current,
      activeProvider: provider,
      // 本地和 WebDAV 没有 S3 presign 等价能力，激活时直接回到本地资源包，避免保存后导出失败。
      defaultExportResourceStrategy: provider === "s3" ? current.defaultExportResourceStrategy : "bundle",
    }));
    setError(null);
    setConnectionNotice(null);
  };
  const updateLocal = (key: keyof OssSettings["local"], value: string) => {
    setConnectionNotice(null);
    setDraft((current) => ({
      ...current,
      local: {
        ...current.local,
        [key]: value,
      },
    }));
  };
  const updateWebdav = (key: keyof OssSettings["webdav"], value: string) => {
    setConnectionNotice(null);
    setDraft((current) => ({
      ...current,
      webdav: {
        ...current.webdav,
        [key]: value,
      },
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateOssSettings(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };
  const closeWhenBackdropClicked = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
  const chooseDatabaseDirectory = async () => {
    const selected = await onChooseDatabaseDirectory();
    if (selected) {
      setDatabaseDirectory(selected);
      setDatabaseError(null);
      setDatabaseMessage(null);
    }
  };
  const chooseStorageDirectory = async () => {
    const selected = await onChooseStorageDirectory();
    if (selected) {
      updateLocal("rootDirectory", selected);
      setError(null);
      setConnectionNotice(null);
    }
  };
  const settingsForProvider = (provider: StorageProviderKind): OssSettings => ({
    ...draft,
    activeProvider: provider,
    // 连接测试以当前编辑页签为准；非 S3 测试时避免被短时签名导出策略校验拦住。
    defaultExportResourceStrategy: provider === "s3" ? draft.defaultExportResourceStrategy : "bundle",
  });
  const testSelectedStorageConnection = async () => {
    const candidate = settingsForProvider(selectedProvider);
    const validationError = validateOssSettings(candidate);
    if (validationError) {
      setError(null);
      setConnectionNotice({ type: "error", message: `连接失败：${validationError}` });
      return;
    }

    setTestingConnection(true);
    setError(null);
    setConnectionNotice({ type: "pending", message: "正在测试连接..." });
    try {
      const output = await onTestStorageConnection(candidate);
      setConnectionNotice({
        type: "success",
        message: `连接成功：${providerLabel(output.provider)} / ${output.storageId || "未设置"} 可用`,
      });
    } catch (testError) {
      setConnectionNotice({
        type: "error",
        message: `连接失败：${testError instanceof Error ? testError.message : String(testError)}`,
      });
    } finally {
      setTestingConnection(false);
    }
  };
  const submitDatabaseLocation = async (event: FormEvent) => {
    event.preventDefault();
    const directory = databaseDirectory.trim();
    if (!directory) {
      setDatabaseError("请选择数据库目录");
      return;
    }

    setDatabaseSaving(true);
    setDatabaseError(null);
    setDatabaseMessage(null);
    try {
      await onSaveDatabaseLocation(directory);
      setDatabaseMessage("数据库目录已保存并切换");
    } catch (saveError) {
      setDatabaseError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setDatabaseSaving(false);
    }
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={closeWhenBackdropClicked}>
      <div className="settings-panel" role="dialog" aria-label="设置">
        <div className="settings-panel__header">
          <h2>设置</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="settings-panel__body">
          <nav className="settings-menu" aria-label="设置菜单">
            <button
              type="button"
              className={`settings-menu__item${activeTab === "appearance" ? " is-active" : ""}`}
              onClick={() => setActiveTab("appearance")}
            >
              <Palette size={16} />
              外观
            </button>
            <button
              type="button"
              className={`settings-menu__item${activeTab === "ai" ? " is-active" : ""}`}
              onClick={() => setActiveTab("ai")}
            >
              <Bot size={16} />
              AI 模型
            </button>
            <button
              type="button"
              className={`settings-menu__item${activeTab === "upload" ? " is-active" : ""}`}
              onClick={() => setActiveTab("upload")}
            >
              <CloudUpload size={16} />
              文件存储
            </button>
            <button
              type="button"
              className={`settings-menu__item${activeTab === "storage" ? " is-active" : ""}`}
              onClick={() => setActiveTab("storage")}
            >
              <Database size={16} />
              数据存储
            </button>
            <button
              type="button"
              className={`settings-menu__item${activeTab === "backup" ? " is-active" : ""}`}
              onClick={() => setActiveTab("backup")}
            >
              <DatabaseBackup size={16} />
              备份恢复
            </button>
            <button
              type="button"
              className={`settings-menu__item${activeTab === "security" ? " is-active" : ""}`}
              onClick={() => setActiveTab("security")}
            >
              <ShieldCheck size={16} />
              资源加密
            </button>
          </nav>

          {activeTab === "appearance" ? (
            <TypographySettingsForm
              settings={typographySettings}
              onSave={onSaveTypographySettings}
              onClose={onClose}
            />
          ) : activeTab === "ai" ? (
            <AiSettingsPanel
              settings={aiSettings}
              onSave={onSaveAiSettings}
              onListModels={onListAiModels}
              onAddModel={onAddAiModel}
              onSetActiveModel={onSetActiveAiModel}
            />
          ) : activeTab === "upload" ? <form className="settings-content" onSubmit={submit} aria-labelledby="upload-settings-title">
            <div className="settings-content__heading">
              <h3 id="upload-settings-title">文件存储</h3>
              <button type="submit" className="primary-button settings-content__save" disabled={saving}>
                <Check size={16} />
                {saving ? "保存中" : "保存存储设置"}
              </button>
            </div>

            <div className="settings-provider-switch" role="radiogroup" aria-label="文件存储类型">
              <button
                type="button"
                className={selectedProvider === "s3" ? "is-active" : ""}
                onClick={() => selectProvider("s3")}
                aria-pressed={selectedProvider === "s3"}
              >
                S3
              </button>
              <button
                type="button"
                className={selectedProvider === "local" ? "is-active" : ""}
                onClick={() => selectProvider("local")}
                aria-pressed={selectedProvider === "local"}
              >
                本地
              </button>
              <button
                type="button"
                className={selectedProvider === "webdav" ? "is-active" : ""}
                onClick={() => selectProvider("webdav")}
                aria-pressed={selectedProvider === "webdav"}
              >
                WebDAV
              </button>
            </div>

            <ActiveStorageStatus
              activeProvider={draft.activeProvider}
              selectedProvider={selectedProvider}
              settings={draft}
              onActivate={activateProvider}
              onTest={testSelectedStorageConnection}
              testing={testingConnection}
              notice={connectionNotice}
            />

            {selectedProvider === "s3" ? (
              <div className="settings-provider-fields">
                <label>
                  S3 Endpoint
                  <input value={draft.endpoint} onChange={(event) => update("endpoint", event.target.value)} />
                </label>
                <label>
                  S3 Bucket
                  <input value={draft.bucket} onChange={(event) => update("bucket", event.target.value)} />
                </label>
                <label>
                  S3 Region
                  <input value={draft.region} onChange={(event) => update("region", event.target.value)} />
                </label>
                <label>
                  S3 Access Key
                  <input value={draft.accessKeyId} onChange={(event) => update("accessKeyId", event.target.value)} />
                </label>
                <label>
                  S3 Secret Key
                  <input
                    type="password"
                    value={draft.secretAccessKey}
                    onChange={(event) => update("secretAccessKey", event.target.value)}
                  />
                </label>
                <label>
                  公开访问 URL（兼容旧链接，可选）
                  <input value={draft.publicBaseUrl} onChange={(event) => update("publicBaseUrl", event.target.value)} />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.forcePathStyle}
                    onChange={(event) => update("forcePathStyle", event.target.checked)}
                  />
                  Path-style endpoint
                </label>
              </div>
            ) : selectedProvider === "local" ? (
              <div className="settings-provider-fields">
                <label>
                  本地存储目录
                  <div className="settings-path-row">
                    <input
                      value={draft.local.rootDirectory}
                      readOnly
                      placeholder="选择加密资源和备份对象保存目录"
                    />
                    <button type="button" className="secondary-button" onClick={chooseStorageDirectory}>
                      <FolderOpen size={15} />
                      选择
                    </button>
                  </div>
                </label>
                <label>
                  存储标识
                  <input value={draft.local.storageId} onChange={(event) => updateLocal("storageId", event.target.value)} />
                </label>
              </div>
            ) : (
              <div className="settings-provider-fields">
                <label>
                  WebDAV 地址
                  <input value={draft.webdav.endpoint} onChange={(event) => updateWebdav("endpoint", event.target.value)} />
                </label>
                <label>
                  WebDAV 用户名
                  <input value={draft.webdav.username} onChange={(event) => updateWebdav("username", event.target.value)} />
                </label>
                <label>
                  WebDAV 密码
                  <input
                    type="password"
                    value={draft.webdav.password}
                    onChange={(event) => updateWebdav("password", event.target.value)}
                  />
                </label>
                <label>
                  WebDAV 根路径
                  <input value={draft.webdav.rootPath} onChange={(event) => updateWebdav("rootPath", event.target.value)} />
                </label>
                <label>
                  存储标识
                  <input value={draft.webdav.storageId} onChange={(event) => updateWebdav("storageId", event.target.value)} />
                </label>
              </div>
            )}

            <StoragePolicyFields
              resourcePreviewConcurrency={draft.resourcePreviewConcurrency}
              onChange={(value) => update("resourcePreviewConcurrency", value)}
            />

            <ResourceMigrationCard
              settings={draft}
              onSaveSettings={onSave}
              onAnalyze={onAnalyzeResourceMigration}
              onRun={onRunResourceMigration}
            />

            <label>
              图片目录
              <input value={draft.imagePrefix} onChange={(event) => update("imagePrefix", event.target.value)} />
            </label>
            <label>
              附件目录
              <input value={draft.filePrefix} onChange={(event) => update("filePrefix", event.target.value)} />
            </label>
            <label>
              备份目录
              <input value={draft.backupPrefix} onChange={(event) => update("backupPrefix", event.target.value)} />
            </label>
            <label>
              默认导出资源策略
              <select
                value={draft.defaultExportResourceStrategy}
                onChange={(event) => update("defaultExportResourceStrategy", event.target.value)}
              >
                <option value="bundle">本地资源包</option>
                <option value="signed-url" disabled={draft.activeProvider !== "s3"}>短时签名链接</option>
              </select>
            </label>
            <label>
              默认签名有效期（秒）
              <input
                type="number"
                min={1}
                value={draft.defaultSignedUrlTtlSeconds}
                onChange={(event) => update("defaultSignedUrlTtlSeconds", Number(event.target.value))}
              />
            </label>
            <label>
              最大签名有效期（秒）
              <input
                type="number"
                min={1}
                value={draft.maxSignedUrlTtlSeconds}
                onChange={(event) => update("maxSignedUrlTtlSeconds", Number(event.target.value))}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.allowSignedUrlExport}
                onChange={(event) => update("allowSignedUrlExport", event.target.checked)}
                disabled={draft.activeProvider !== "s3"}
              />
              允许导出短时签名链接
            </label>

            {error ? <p className="settings-error">{error}</p> : null}

            <div className="settings-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                <Check size={16} />
                保存
              </button>
            </div>
          </form> : activeTab === "backup" ? (
            <BackupSettingsPanel
              keyStatus={backupKeyStatus}
              backups={backupRecords}
              busy={backupBusy}
              activeOperation={activeBackupOperation}
              onSetKey={onSetBackupKey}
              onCreateBackup={onCreateBackup}
              onRestoreBackup={onRestoreBackup}
              onDeleteBackup={onDeleteBackup}
            />
          ) : activeTab === "storage" ? (
            <form className="settings-content" onSubmit={submitDatabaseLocation} aria-labelledby="storage-settings-title">
              <h3 id="storage-settings-title">数据存储</h3>
              <div className="settings-card">
                <div className="settings-card__title">
                  <Database size={16} />
                  SQLite 数据库目录
                </div>
                <p className="settings-card__text">
                  应用会在该目录下保存 <code>yuque-lake-notes.sqlite3</code>。切换到空目录时会复制当前数据库。
                </p>
                {databaseLocation?.databasePath ? (
                  <p className="settings-card__muted">当前数据库：{databaseLocation.databasePath}</p>
                ) : null}
                <label>
                  数据库目录
                  <div className="settings-path-row">
                    <input
                      value={databaseDirectory}
                      readOnly
                      placeholder="选择 SQLite 数据库所在目录"
                    />
                    <button type="button" className="secondary-button" onClick={chooseDatabaseDirectory}>
                      <FolderOpen size={15} />
                      选择
                    </button>
                  </div>
                </label>
                <p className="settings-card__muted">
                  目录配置保存在独立配置文件中，不依赖 SQLite；已有目标数据库时会直接切换使用。
                </p>
              </div>

              {databaseError ? <p className="settings-error">{databaseError}</p> : null}
              {databaseMessage ? <p className="settings-success">{databaseMessage}</p> : null}

              <div className="settings-actions">
                <button type="button" className="secondary-button" onClick={onClose}>
                  取消
                </button>
                <button type="submit" className="primary-button" disabled={databaseSaving || !databaseDirectory.trim()}>
                  <Check size={16} />
                  保存目录
                </button>
              </div>
            </form>
          ) : (
            <ResourceSecurityPanel
              keyStatus={resourceKeyStatus}
              busy={resourceKeyBusy}
              onSetKey={onSetResourceKey}
              onVerifyKey={onVerifyResourceKey}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveStorageStatus({
  activeProvider,
  selectedProvider,
  settings,
  onActivate,
  onTest,
  testing,
  notice,
}: {
  activeProvider: StorageProviderKind;
  selectedProvider: StorageProviderKind;
  settings: OssSettings;
  onActivate: (provider: StorageProviderKind) => void;
  onTest: () => Promise<void>;
  testing: boolean;
  notice: StorageConnectionNotice;
}) {
  const activeTarget = storageTargetFromSettings(settings);
  const activeStorageId = activeTarget.storageId.trim() || "未设置";
  const isEditingActiveProvider = activeProvider === selectedProvider;

  return (
    <div className="settings-active-storage">
      <div className="settings-active-storage__info">
        <span>当前激活存储</span>
        <strong>{providerLabel(activeProvider)} / {activeStorageId}</strong>
      </div>
      <div className="settings-active-storage__actions">
        {isEditingActiveProvider ? (
          <span className="settings-active-storage__badge">正在编辑</span>
        ) : (
          <button type="button" className="secondary-button" onClick={() => onActivate(selectedProvider)}>
            设为当前激活
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onTest} disabled={testing}>
          {testing ? "测试中" : "连接测试"}
        </button>
      </div>
      {notice ? (
        <div className={`settings-active-storage__notice is-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}

function StoragePolicyFields({
  resourcePreviewConcurrency,
  onChange,
}: {
  resourcePreviewConcurrency: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-provider-fields storage-policy-fields">
      <label>
        资源并发访问请求数
        <input
          type="number"
          min={4}
          max={8}
          value={resourcePreviewConcurrency}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <p className="settings-card__muted">
        打开含多张图片或附件的文档时，同时请求 4-8 个资源预览，文档内容会先显示。
      </p>
    </div>
  );
}

function TypographySettingsForm({
  settings,
  onSave,
  onClose,
}: {
  settings: GlobalTypographySettings;
  onSave: (settings: GlobalTypographySettings) => Promise<GlobalTypographySettings>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => mergeTypographySettings(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(mergeTypographySettings(settings));
    setError(null);
  }, [settings]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateTypographySettings(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await onSave(draft);
      setDraft(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="settings-content" onSubmit={submit} aria-labelledby="appearance-settings-title">
      <div className="settings-content__heading">
        <h3 id="appearance-settings-title">外观</h3>
        <button type="submit" className="primary-button settings-content__save" disabled={saving}>
          <Check size={16} />
          {saving ? "保存中" : "保存外观设置"}
        </button>
      </div>

      <div className="settings-card">
        <div className="settings-card__title">
          <Palette size={16} />
          字体
        </div>
        <p className="settings-card__text">
          全局字体会作为后续新建 Lake 文档的初始字体；已有文档仅在没有文档级设置时按全局设置显示。
        </p>
        <div className="settings-provider-fields">
          <label>
            全局字体
            <input
              value={draft.fontFamily}
              placeholder="例如 Songti SC, serif"
              onChange={(event) => setDraft((current) => ({ ...current, fontFamily: event.target.value }))}
            />
          </label>
          <label>
            默认字号
            <select
              value={draft.defaultFontSize}
              onChange={(event) => setDraft((current) => ({ ...current, defaultFontSize: Number(event.target.value) }))}
            >
              {supportedDefaultFontSizes.map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <p className="settings-error">{error}</p> : null}

      <div className="settings-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          <Check size={16} />
          保存
        </button>
      </div>
    </form>
  );
}

function ResourceMigrationCard({
  settings,
  onSaveSettings,
  onAnalyze,
  onRun,
}: {
  settings: OssSettings;
  onSaveSettings: (settings: OssSettings) => Promise<void>;
  onAnalyze: (input: ResourceMigrationInput) => Promise<ResourceMigrationAnalysisOutput>;
  onRun: (input: ResourceMigrationInput) => Promise<ResourceMigrationRunOutput>;
}) {
  const [sourceProvider, setSourceProvider] = useState<StorageProviderKind>("s3");
  const [sourceStorageId, setSourceStorageId] = useState(settings.bucket || "notes");
  const [analysis, setAnalysis] = useState<ResourceMigrationAnalysisOutput | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<"analyze" | "run" | null>(null);

  const target = storageTargetFromSettings(settings);
  const analyzing = operation === "analyze";
  const running = operation === "run";
  const busy = operation !== null;
  const buildInput = (): ResourceMigrationInput => ({
    source: {
      provider: sourceProvider,
      storageId: sourceStorageId.trim(),
    },
    target,
  });
  const saveSettingsBeforeMigration = async () => {
    const validationError = validateOssSettings(settings);
    if (validationError) {
      throw new Error(validationError);
    }
    // 迁移命令在 Tauri 后端重新读取已保存配置，执行前必须先落库，避免目标存储仍是旧配置。
    await onSaveSettings(settings);
  };
  const canRun = analysis
    && analysis.uniqueResources > 0
    && analysis.unreadableResources.length === 0
    && analysis.conflictResources.length === 0;
  const analyze = async () => {
    setOperation("analyze");
    setError(null);
    setMessage("正在清点资源，请稍候...");
    try {
      await saveSettingsBeforeMigration();
      const output = await onAnalyze(buildInput());
      setAnalysis(output);
      setMessage("文件存储配置已保存，资源迁移清点完成");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : String(analysisError));
    } finally {
      setOperation(null);
    }
  };
  const run = async () => {
    setOperation("run");
    setError(null);
    setMessage("正在执行迁移，请不要关闭设置窗口...");
    try {
      await saveSettingsBeforeMigration();
      const output = await onRun(buildInput());
      setAnalysis(output.analysis);
      setMessage(`迁移成功：已复制 ${output.copiedResources} 个资源，重写 ${output.rewrittenDocuments.length} 个文档`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setOperation(null);
    }
  };

  return (
    <div className="settings-card resource-migration-card">
      <div className="settings-card__title">资源迁移</div>
      <p className="settings-card__text">
        迁移当前知识库中引用的资源到当前激活存储，执行前会先 dry-run 清点，不会删除旧存储对象。
      </p>
      <div className="resource-migration-grid">
        <label>
          旧存储类型
          <select value={sourceProvider} onChange={(event) => setSourceProvider(event.target.value as StorageProviderKind)}>
            <option value="s3">S3</option>
            <option value="local">本地</option>
            <option value="webdav">WebDAV</option>
          </select>
        </label>
        <label>
          旧存储标识
          <input value={sourceStorageId} onChange={(event) => setSourceStorageId(event.target.value)} />
        </label>
        <label>
          目标存储
          <input value={`${target.provider} / ${target.storageId}`} readOnly />
        </label>
      </div>
      <div className="backup-inline-actions">
        <button type="button" className="secondary-button" disabled={busy || !sourceStorageId.trim()} onClick={analyze}>
          {analyzing ? "清点中" : "Dry-run 清点"}
        </button>
        <button type="button" className="primary-button" disabled={busy || !canRun} onClick={run}>
          {running ? "迁移中" : "执行迁移"}
        </button>
      </div>
      {operation ? (
        <div className="resource-migration-progress" role="status" aria-live="polite">
          <div className="resource-migration-progress__bar" />
          <span>{operation === "run" ? "正在复制资源并重写引用..." : "正在读取资源并检查冲突..."}</span>
        </div>
      ) : null}
      {analysis ? (
        <div className="resource-migration-summary">
          <span>待迁移资源：{analysis.uniqueResources}</span>
          <span>引用次数：{analysis.totalReferences}</span>
          <span>涉及文档：{analysis.documentCount}</span>
          <span>总大小：{formatMigrationSize(analysis.totalBytes)}</span>
          <span>不可读：{analysis.unreadableResources.length}</span>
          <span>冲突：{analysis.conflictResources.length}</span>
        </div>
      ) : null}
      {error ? <p className="settings-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}
    </div>
  );
}

function storageTargetFromSettings(settings: OssSettings): ResourceMigrationInput["target"] {
  if (settings.activeProvider === "local") {
    return { provider: "local", storageId: settings.local.storageId.trim() || "local" };
  }
  if (settings.activeProvider === "webdav") {
    return { provider: "webdav", storageId: settings.webdav.storageId.trim() || "webdav" };
  }
  return { provider: "s3", storageId: settings.bucket.trim() };
}

function providerLabel(provider: StorageProviderKind): string {
  if (provider === "local") {
    return "本地";
  }
  if (provider === "webdav") {
    return "WebDAV";
  }
  return "S3";
}

function formatMigrationSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
