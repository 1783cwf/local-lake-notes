import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OssSettingsPanel } from "./OssSettingsPanel";

function renderPanel(overrides: Partial<Parameters<typeof OssSettingsPanel>[0]> = {}) {
  return render(
    <OssSettingsPanel
      open
      settings={null}
      onClose={vi.fn()}
      onSave={vi.fn()}
      backupKeyStatus={{ configured: false, needsKey: false }}
      backupRecords={[]}
      backupBusy={false}
      activeBackupOperation={null}
      onSetBackupKey={vi.fn()}
      onCreateBackup={vi.fn()}
      onRestoreBackup={vi.fn()}
      onDeleteBackup={vi.fn()}
      {...overrides}
    />,
  );
}

test("保存前校验 OSS 必填项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  renderPanel({ onSave });

  expect(screen.getByRole("button", { name: "上传配置" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("请填写 endpoint")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("点击设置面板外的遮罩关闭设置", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { container } = renderPanel({ onClose });

  await user.click(screen.getByLabelText("Endpoint"));
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
