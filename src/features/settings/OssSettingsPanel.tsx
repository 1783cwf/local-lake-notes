import type { FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { Check, CloudUpload, DatabaseBackup, ShieldCheck, X } from "lucide-react";

import type { BackupKeyStatus, BackupRecord, OssSettings, RestoreBackupOutput, ResourceKeyStatus } from "../../app/appState";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { mergeOssSettings, validateOssSettings } from "./ossSettingsStore";
import { ResourceSecurityPanel } from "./ResourceSecurityPanel";

interface OssSettingsPanelProps {
  open: boolean;
  settings: OssSettings | null;
  onClose: () => void;
  onSave: (settings: OssSettings) => Promise<void>;
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
}

export function OssSettingsPanel({
  open,
  settings,
  onClose,
  onSave,
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
}: OssSettingsPanelProps) {
  const [draft, setDraft] = useState(() => mergeOssSettings(settings));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "security" | "backup">("upload");

  useEffect(() => {
    if (open) {
      setDraft(mergeOssSettings(settings));
      setError(null);
      setActiveTab("upload");
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const update = (key: keyof OssSettings, value: string | boolean | number) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
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
              className={`settings-menu__item${activeTab === "upload" ? " is-active" : ""}`}
              onClick={() => setActiveTab("upload")}
            >
              <CloudUpload size={16} />
              上传配置
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

          {activeTab === "upload" ? <form className="settings-content" onSubmit={submit} aria-labelledby="upload-settings-title">
            <h3 id="upload-settings-title">上传配置</h3>

            <label>
              Endpoint
              <input value={draft.endpoint} onChange={(event) => update("endpoint", event.target.value)} />
            </label>
            <label>
              Bucket
              <input value={draft.bucket} onChange={(event) => update("bucket", event.target.value)} />
            </label>
            <label>
              Region
              <input value={draft.region} onChange={(event) => update("region", event.target.value)} />
            </label>
            <label>
              Access Key
              <input value={draft.accessKeyId} onChange={(event) => update("accessKeyId", event.target.value)} />
            </label>
            <label>
              Secret Key
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
                <option value="signed-url">短时签名链接</option>
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
                checked={draft.forcePathStyle}
                onChange={(event) => update("forcePathStyle", event.target.checked)}
              />
              Path-style endpoint
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.allowSignedUrlExport}
                onChange={(event) => update("allowSignedUrlExport", event.target.checked)}
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
