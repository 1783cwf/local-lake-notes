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

test("表格文档显示 Excel 导入导出菜单", async () => {
  const user = userEvent.setup();
  const onImportSpreadsheetExcel = vi.fn();
  const onExportSpreadsheetExcel = vi.fn();

  render(
    <TopBar
      document={{
        id: "预算.json",
        path: "预算.json",
        name: "预算",
        parentPath: "",
        size: 1,
        kind: "spreadsheet",
      }}
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onExportDocument={vi.fn()}
      onImportSpreadsheetExcel={onImportSpreadsheetExcel}
      onExportSpreadsheetExcel={onExportSpreadsheetExcel}
    />,
  );

  expect(screen.queryByRole("button", { name: "导出文档" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Excel 导入导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导入 Excel" }));
  expect(onImportSpreadsheetExcel).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "Excel 导入导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导出 Excel" }));
  expect(onExportSpreadsheetExcel).toHaveBeenCalledTimes(1);
});

test("多维表格只显示保存和分享，不显示文档或 Excel 导出菜单", () => {
  render(
    <TopBar
      document={{
        id: "上线记录.dbtable.json",
        path: "上线记录.dbtable.json",
        name: "上线记录",
        parentPath: "",
        size: 1,
        kind: "multidimensional-table",
      }}
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onExportDocument={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "上线记录" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "导出文档" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Excel 导入导出" })).not.toBeInTheDocument();
});
