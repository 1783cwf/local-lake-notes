import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OssSettingsPanel } from "./OssSettingsPanel";

test("保存前校验 OSS 必填项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  render(<OssSettingsPanel open settings={null} onClose={vi.fn()} onSave={onSave} />);

  expect(screen.getByRole("button", { name: "上传配置" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("请填写 endpoint")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("点击设置面板外的遮罩关闭设置", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const { container } = render(<OssSettingsPanel open settings={null} onClose={onClose} onSave={vi.fn()} />);

  await user.click(screen.getByLabelText("Endpoint"));
  expect(onClose).not.toHaveBeenCalled();

  const backdrop = container.querySelector(".settings-backdrop");
  expect(backdrop).toBeInTheDocument();
  await user.click(backdrop!);

  expect(onClose).toHaveBeenCalledTimes(1);
});
