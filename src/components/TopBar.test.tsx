import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TopBar } from "./TopBar";

test("双击文档标题后可以提交新名称", async () => {
  const user = userEvent.setup();
  const onRenameDocument = vi.fn();

  render(
    <TopBar
      document={{
        id: "未命名文档.lake",
        path: "未命名文档.lake",
        name: "未命名文档",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onRenameDocument={onRenameDocument}
    />,
  );

  await user.dblClick(screen.getByRole("heading", { name: "未命名文档" }));
  const input = screen.getByLabelText("文档名称");
  await user.clear(input);
  await user.type(input, "新的文档{Enter}");

  expect(onRenameDocument).toHaveBeenCalledWith("新的文档");
});

test("右上角导出菜单可以选择文档导出格式", async () => {
  const user = userEvent.setup();
  const onExportDocument = vi.fn();

  render(
    <TopBar
      document={{
        id: "导出测试.lake",
        path: "导出测试.lake",
        name: "导出测试",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onExportDocument={onExportDocument}
    />,
  );

  await user.click(screen.getByRole("button", { name: "导出文档" }));
  await user.click(screen.getByRole("menuitem", { name: "PDF" }));

  expect(onExportDocument).toHaveBeenCalledWith("pdf", "bundle", 86400);
});

test("表格文档只显示 XLSX 另存入口", async () => {
  const user = userEvent.setup();
  const onExportSpreadsheet = vi.fn();

  render(
    <TopBar
      document={{
        id: "预算.xlsx",
        path: "预算.xlsx",
        name: "预算",
        parentPath: "",
        size: 1,
        kind: "spreadsheet",
      }}
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onExportDocument={vi.fn()}
      onExportSpreadsheet={onExportSpreadsheet}
    />,
  );

  await user.click(screen.getByRole("button", { name: "另存 XLSX" }));

  expect(onExportSpreadsheet).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "导出文档" })).not.toBeInTheDocument();
});
