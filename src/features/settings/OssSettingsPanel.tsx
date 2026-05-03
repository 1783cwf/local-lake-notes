import type { FormEvent, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { Check, CloudUpload, X } from "lucide-react";

import type { OssSettings } from "../../app/appState";
import { mergeOssSettings, validateOssSettings } from "./ossSettingsStore";

interface OssSettingsPanelProps {
  open: boolean;
  settings: OssSettings | null;
  onClose: () => void;
  onSave: (settings: OssSettings) => Promise<void>;
}

export function OssSettingsPanel({ open, settings, onClose, onSave }: OssSettingsPanelProps) {
  const [draft, setDraft] = useState(() => mergeOssSettings(settings));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(mergeOssSettings(settings));
      setError(null);
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
      <form className="settings-panel" onSubmit={submit} aria-label="设置">
        <div className="settings-panel__header">
          <h2>设置</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="settings-panel__body">
          <nav className="settings-menu" aria-label="设置菜单">
            <button type="button" className="settings-menu__item is-active">
              <CloudUpload size={16} />
              上传配置
            </button>
          </nav>

          <section className="settings-content" aria-labelledby="upload-settings-title">
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
          </section>
        </div>
      </form>
    </div>
  );
}
