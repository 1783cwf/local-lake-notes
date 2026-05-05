import type { FormEvent } from "react";
import { useState } from "react";
import { KeyRound, Loader2, RotateCcw, ShieldCheck } from "lucide-react";

import type { ResourceKeyStatus } from "../../app/appState";

interface ResourceSecurityPanelProps {
  keyStatus: ResourceKeyStatus;
  busy: boolean;
  onSetKey: (secret: string, reset: boolean) => Promise<void>;
  onVerifyKey: () => Promise<ResourceKeyStatus>;
}

export function ResourceSecurityPanel({
  keyStatus,
  busy,
  onSetKey,
  onVerifyKey,
}: ResourceSecurityPanelProps) {
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
      setPanelMessage(reset ? "资源密钥已重置，新上传资源将使用新密钥" : "资源密钥已设置");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    }
  };

  const verifyKey = async () => {
    setPanelError(null);
    setPanelMessage(null);
    try {
      const status = await onVerifyKey();
      setPanelMessage(status.configured ? "本地资源密钥读取成功" : "本机仍缺少资源密钥，请重新设置");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="settings-content resource-security-settings" aria-labelledby="resource-security-title">
      <h3 id="resource-security-title">资源加密</h3>

      <div className="settings-card">
        <div className="settings-card__title">
          <ShieldCheck size={16} />
          图片和附件上传加密
        </div>
        <p className="settings-card__text">
          {keyStatus.configured
            ? `已启用：${keyStatus.fingerprint ?? "unknown"}`
            : keyStatus.needsKey
              ? "本机资源密钥缺失，旧资源需要原密钥才能预览和下载"
              : "未设置资源密钥，上传图片和附件前需要先设置"}
        </p>
        {keyStatus.createdAt ? <p className="settings-card__muted">创建时间：{formatDate(keyStatus.createdAt)}</p> : null}
        {keyStatus.knownFingerprints.length > 0 ? (
          <p className="settings-card__muted">已知密钥版本：{keyStatus.knownFingerprints.join("、")}</p>
        ) : null}
        {(keyStatus.configured || keyStatus.needsKey) ? (
          <div className="backup-inline-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={verifyKey}>
              {busy ? <Loader2 size={15} className="spin-icon" /> : <KeyRound size={15} />}
              重新读取密钥
            </button>
          </div>
        ) : null}
        <form className="backup-key-form" onSubmit={(event) => submitKey(event, keyStatus.configured)}>
          <label>
            资源加密密钥
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
              {keyStatus.configured ? "重置资源密钥" : "设置资源密钥"}
            </button>
          </div>
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card__title">短时链接导出</div>
        <p className="settings-card__text">
          加密资源导出为短时链接时，会先解密并上传到 <code>tmp/exports/</code> 临时明文目录，再生成限时链接。
        </p>
        <p className="settings-card__muted">
          建议在对象存储里为 <code>tmp/exports/</code> 前缀配置生命周期自动删除，避免临时明文长期残留。
        </p>
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
