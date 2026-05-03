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
      onSetBackupKey={vi.fn()}
      onCreateBackup={vi.fn()}
      onRestoreBackup={vi.fn()}
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

  renderPanel({ onSetBackupKey });

  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.type(screen.getByLabelText("加密密钥"), "test-secret-key");
  await user.click(screen.getByRole("button", { name: "设置密钥" }));

  expect(onSetBackupKey).toHaveBeenCalledWith("test-secret-key", false);
});
