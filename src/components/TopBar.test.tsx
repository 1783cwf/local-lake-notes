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

test("顶部栏可以渲染多个文档标签并激活非当前标签", async () => {
  const user = userEvent.setup();
  const onActivateTab = vi.fn();

  render(
    <TopBar
      document={{
        id: "b.lake",
        path: "b.lake",
        name: "b",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      openTabs={[
        {
          id: "a.lake",
          path: "a.lake",
          locked: true,
          document: { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        },
        {
          id: "b.lake",
          path: "b.lake",
          locked: false,
          document: { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
        },
      ]}
      activeTabId="b.lake"
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onActivateTab={onActivateTab}
    />,
  );

  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.getByRole("tab", { name: "b" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("已锁定")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "a，已锁定" }));

  expect(onActivateTab).toHaveBeenCalledWith("a.lake");
});

test("标签右键菜单支持锁定和解除锁定", async () => {
  const user = userEvent.setup();
  const onToggleTabLocked = vi.fn();

  const { rerender } = render(
    <TopBar
      document={{
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      openTabs={[
        {
          id: "a.lake",
          path: "a.lake",
          locked: false,
          document: { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        },
      ]}
      activeTabId="a.lake"
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onToggleTabLocked={onToggleTabLocked}
    />,
  );

  await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));

  expect(onToggleTabLocked).toHaveBeenCalledWith("a.lake");

  rerender(
    <TopBar
      document={{
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      openTabs={[
        {
          id: "a.lake",
          path: "a.lake",
          locked: true,
          document: { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        },
      ]}
      activeTabId="a.lake"
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onToggleTabLocked={onToggleTabLocked}
    />,
  );

  await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: "a，已锁定" }) });
  await user.click(screen.getByRole("menuitem", { name: "解除锁定" }));

  expect(onToggleTabLocked).toHaveBeenCalledTimes(2);
});

test("未锁定活动标签可以点击关闭按钮", async () => {
  const user = userEvent.setup();
  const onCloseTab = vi.fn();

  render(
    <TopBar
      document={{
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
        kind: "lake",
      }}
      openTabs={[
        {
          id: "a.lake",
          path: "a.lake",
          locked: false,
          document: { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        },
      ]}
      activeTabId="a.lake"
      saveStatus={{ state: "clean" }}
      onManualSave={vi.fn()}
      onCloseTab={onCloseTab}
    />,
  );

  await user.click(screen.getByRole("button", { name: "关闭 a" }));

  expect(onCloseTab).toHaveBeenCalledWith("a.lake");
});
