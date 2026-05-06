import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { buildDocumentTree, flattenDocumentTree } from "../features/workspace/workspaceStore";
import { DocumentSidebar, resolvePointerIntent } from "./DocumentSidebar";

function renderSidebar(overrides: Partial<ComponentProps<typeof DocumentSidebar>> = {}) {
  const props: ComponentProps<typeof DocumentSidebar> = {
    workspaceRoot: "/tmp/kb",
    currentPath: "notes/a.lake",
    directories: [
      {
        id: "notes",
        path: "notes",
        name: "notes",
        parentPath: "",
      },
    ],
    order: [],
    onCreateDocument: vi.fn(),
    onCreateSpreadsheet: vi.fn(),
    onCreateDirectory: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onExportWorkspaceMarkdown: vi.fn(),
    onOpenDocument: vi.fn(),
    onRenameDocument: vi.fn(),
    onDeleteDocument: vi.fn(),
    onRenameDirectory: vi.fn(),
    onDeleteDirectory: vi.fn(),
    onMoveNode: vi.fn(),
    documents: [
      {
        id: "notes/a.lake",
        path: "notes/a.lake",
        name: "a",
        parentPath: "notes",
        size: 1,
        kind: "lake",
      },
    ],
    ...overrides,
  };

  return {
    props,
    ...render(<DocumentSidebar {...props} />),
  };
}

test("展示目录树并高亮当前文档", () => {
  renderSidebar();

  expect(screen.getByText("kb")).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /a/ })).toHaveClass("is-current");
});

test("目录树拖拽不再依赖原生 draggable 属性", () => {
  renderSidebar();

  expect(screen.getByRole("treeitem", { name: /a/ })).not.toHaveAttribute("draggable");
  expect(screen.getByRole("button", { name: "拖拽a" })).toBeInTheDocument();
});

test("目录支持展开和收起", () => {
  renderSidebar();

  fireEvent.click(screen.getByRole("button", { name: "收起目录 notes" }));

  expect(screen.queryByRole("treeitem", { name: /a/ })).not.toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /notes/ })).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(screen.getByRole("button", { name: "展开目录 notes" }));

  expect(screen.getByRole("treeitem", { name: /a/ })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /notes/ })).toHaveAttribute("aria-expanded", "true");
});

test("可以按文档名称搜索文档", async () => {
  const user = userEvent.setup();
  renderSidebar({
    currentPath: "notes/product.lake",
    directories: [
      {
        id: "notes",
        path: "notes",
        name: "notes",
        parentPath: "",
      },
      {
        id: "meeting",
        path: "meeting",
        name: "meeting",
        parentPath: "",
      },
    ],
    documents: [
      {
        id: "notes/product.lake",
        path: "notes/product.lake",
        name: "产品方案",
        parentPath: "notes",
        size: 1,
        kind: "lake",
      },
      {
        id: "meeting/record.lake",
        path: "meeting/record.lake",
        name: "会议记录",
        parentPath: "meeting",
        size: 1,
        kind: "lake",
      },
    ],
  });

  await user.type(screen.getByRole("searchbox", { name: "搜索文档" }), "会议");

  expect(screen.getByRole("treeitem", { name: /会议记录/ })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /meeting/ })).toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: /产品方案/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清空搜索" }));

  expect(screen.getByRole("treeitem", { name: /产品方案/ })).toBeInTheDocument();
});

test("表格文档可以搜索并通过目录入口创建", async () => {
  const user = userEvent.setup();
  const onCreateSpreadsheet = vi.fn();
  renderSidebar({
    currentPath: "notes/budget.json",
    onCreateSpreadsheet,
    documents: [
      {
        id: "notes/budget.json",
        path: "notes/budget.json",
        name: "预算表",
        parentPath: "notes",
        size: 1,
        kind: "spreadsheet",
      },
    ],
  });

  await user.type(screen.getByRole("searchbox", { name: "搜索文档" }), "预算");

  expect(screen.getByRole("treeitem", { name: /预算表/ })).toHaveClass("is-current");

  await user.click(screen.getAllByRole("button", { name: "新建表格" })[1]);

  expect(onCreateSpreadsheet).toHaveBeenCalledWith("notes");
});

test("按指针位置计算 after 和 inside 落点意图", () => {
  renderSidebar({
    currentPath: "a.lake",
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake", "folder:notes"],
  });
  const flatNodes = flattenDocumentTree(buildDocumentTree(
    [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    ["document:a.lake", "folder:notes"],
  ));
  const folderRow = screen.getByTestId("tree-row-folder:notes");
  vi.spyOn(folderRow, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 140,
    height: 40,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: 100,
    toJSON: () => undefined,
  });

  expect(resolvePointerIntent(flatNodes, "folder:notes", 136)).toEqual({
    placement: "after",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", 118)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", null)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
});

test("根目录末尾落点生成 root-end intent", () => {
  renderSidebar();

  const flatNodes = flattenDocumentTree(buildDocumentTree([], []));

  expect(resolvePointerIntent(flatNodes, "__workspace-root-end__", 200)).toEqual({
    placement: "root-end",
  });
});

test("点击行操作不会触发打开文档", () => {
  const onOpenDocument = vi.fn();
  const onDeleteDocument = vi.fn();
  renderSidebar({ onOpenDocument, onDeleteDocument });

  fireEvent.click(screen.getByRole("button", { name: "删除文档" }));

  expect(onDeleteDocument).toHaveBeenCalledTimes(1);
  expect(onOpenDocument).not.toHaveBeenCalled();
});
