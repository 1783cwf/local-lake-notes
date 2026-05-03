import type { FormEvent } from "react";
import { useState } from "react";
import { DatabaseBackup, KeyRound, RotateCcw } from "lucide-react";

import type { BackupKeyStatus, BackupRecord, RestoreBackupOutput } from "../../app/appState";

interface BackupSettingsPanelProps {
  keyStatus: BackupKeyStatus;
  backups: BackupRecord[];
  busy: boolean;
  onSetKey: (secret: string, reset: boolean) => Promise<void>;
  onCreateBackup: (forceFull: boolean) => Promise<void>;
  onRestoreBackup: (backupId: string, allowKeyMismatch: boolean) => Promise<RestoreBackupOutput>;
}

export function BackupSettingsPanel({
  keyStatus,
  backups,
  busy,
  onSetKey,
  onCreateBackup,
  onRestoreBackup,
}: BackupSettingsPanelProps) {
  const [secret, setSecret] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  const submitKey = async (event: FormEvent, reset: boolean) => {
    event.preventDefault();
    setPanelError(null);
    setPanelMessage(null);
    try {
      await onSetKey(secret, reset);
      setSecret("");
      setPanelMessage(reset ? "备份密钥已重置" : "备份密钥已设置");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    }
  };

  const createBackup = async (forceFull: boolean) => {
    setPanelError(null);
    setPanelMessage(null);
    try {
      await onCreateBackup(forceFull);
      setPanelMessage(forceFull ? "全量备份已完成" : "备份已完成");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    }
  };

  const restore = async (record: BackupRecord) => {
    if (!window.confirm(`恢复备份「${formatDate(record.createdAt)}」？该操作会覆盖本地应用数据。`)) {
      return;
    }
    setPanelError(null);
    setPanelMessage(null);
    try {
      const output = await onRestoreBackup(record.id, !record.canRestore);
      setPanelMessage(output.requiresRestart ? "恢复已完成，请重启应用后继续使用" : "恢复已完成");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="settings-content backup-settings" aria-labelledby="backup-settings-title">
      <h3 id="backup-settings-title">备份恢复</h3>

      <div className="settings-card">
        <div className="settings-card__title">
          <KeyRound size={16} />
          备份密钥
        </div>
        <p className="settings-card__text">
          {keyStatus.configured
            ? `已设置：${keyStatus.fingerprint ?? "unknown"}`
            : keyStatus.needsKey
              ? "本机密钥缺失，旧备份需要原密钥才能恢复"
              : "未设置备份密钥"}
        </p>
        {keyStatus.createdAt ? <p className="settings-card__muted">创建时间：{formatDate(keyStatus.createdAt)}</p> : null}
        <form className="backup-key-form" onSubmit={(event) => submitKey(event, keyStatus.configured)}>
          <label>
            加密密钥
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="至少 12 个字符，保存后不可查看"
            />
          </label>
          <div className="backup-inline-actions">
            <button type="submit" className="secondary-button" disabled={busy || !secret}>
              {keyStatus.configured ? <RotateCcw size={15} /> : <KeyRound size={15} />}
              {keyStatus.configured ? "重置密钥" : "设置密钥"}
            </button>
          </div>
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card__title">
          <DatabaseBackup size={16} />
          手动备份
        </div>
        <div className="backup-inline-actions">
          <button type="button" className="primary-button" disabled={busy} onClick={() => createBackup(false)}>
            立即备份
          </button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => createBackup(true)}>
            强制全量
          </button>
        </div>
      </div>

      <div className="settings-card backup-list">
        <div className="settings-card__title">备份列表</div>
        {backups.length === 0 ? (
          <p className="settings-card__text">暂无备份</p>
        ) : (
          backups.map((record) => (
            <div className="backup-record" key={record.id}>
              <div>
                <strong>{record.backupType === "full" ? "全量" : "增量"}</strong>
                <span>{formatDate(record.createdAt)}</span>
                <small>{formatSize(record.encryptedSize)} · {record.keyFingerprint}</small>
              </div>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => restore(record)}>
                {record.canRestore ? "恢复" : "尝试恢复"}
              </button>
            </div>
          ))
        )}
      </div>

      {panelError ? <p className="settings-error">{panelError}</p> : null}
      {panelMessage ? <p className="settings-success">{panelMessage}</p> : null}
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSize(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
