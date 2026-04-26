import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OssSettingsPanel } from "./OssSettingsPanel";

test("保存前校验 OSS 必填项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();

  render(<OssSettingsPanel open settings={null} onClose={vi.fn()} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("请填写 endpoint")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});
