import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { buildDocumentTree, flattenDocumentTree } from "../features/workspace/workspaceStore";
import { DocumentSidebar, resolvePointerIntent, staticTreeSortingStrategy } from "./DocumentSidebar";

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
    onCreateMultidimensionalTable: vi.fn(),
    onCreateDirectory: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onExportWorkspaceMarkdown: vi.fn(),
    onOpenDocument: vi.fn(),
    onOpenDocumentReadOnly: vi.fn(),
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

test("拖拽期间树节点保持静止，不自动挤开目标行", () => {
  expect(staticTreeSortingStrategy({
    activeIndex: 0,
    index: 1,
    overIndex: 1,
    activeNodeRect: null,
    rects: [],
  })).toBeNull();
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

test("有子级的文档支持展开和收起", () => {
  renderSidebar({
    currentPath: "a/child.lake",
    directories: [
      {
        id: "a",
        path: "a",
        name: "a",
        parentPath: "",
      },
    ],
    documents: [
      {
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
        kind: "lake",
      },
      {
        id: "a/child.lake",
        path: "a/child.lake",
        name: "child",
        parentPath: "a",
        size: 1,
        kind: "lake",
      },
    ],
    order: ["document:a.lake", "document:a/child.lake"],
  });

  expect(screen.getByRole("treeitem", { name: /a/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("treeitem", { name: /child/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "收起子文档 a" }));

  expect(screen.queryByRole("treeitem", { name: /child/ })).not.toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /a/ })).toHaveAttribute("aria-expanded", "false");
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
        name: "测试文件1",
        parentPath: "notes",
        size: 1,
        kind: "lake",
      },
      {
        id: "meeting/record.lake",
        path: "meeting/record.lake",
        name: "测试文件2",
        parentPath: "meeting",
        size: 1,
        kind: "lake",
      },
    ],
  });

  await user.type(screen.getByRole("searchbox", { name: "搜索文档" }), "测试文件2");

  expect(screen.getByRole("treeitem", { name: /测试文件2/ })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /meeting/ })).toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: /测试文件1/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清空搜索" }));

  expect(screen.getByRole("treeitem", { name: /测试文件1/ })).toBeInTheDocument();
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
        name: "测试表格1",
        parentPath: "notes",
        size: 1,
        kind: "spreadsheet",
      },
    ],
  });

  await user.type(screen.getByRole("searchbox", { name: "搜索文档" }), "测试表格1");

  expect(screen.getByRole("treeitem", { name: /测试表格1/ })).toHaveClass("is-current");

  await user.click(screen.getAllByRole("button", { name: "新建表格" })[1]);

  expect(onCreateSpreadsheet).toHaveBeenCalledWith("notes");
});

test("多维表格文档可以搜索并通过目录入口创建", async () => {
  const user = userEvent.setup();
  const onCreateMultidimensionalTable = vi.fn();
  renderSidebar({
    currentPath: "notes/project.dbtable.json",
    onCreateMultidimensionalTable,
    documents: [
      {
        id: "notes/project.dbtable.json",
        path: "notes/project.dbtable.json",
        name: "测试表格2",
        parentPath: "notes",
        size: 1,
        kind: "multidimensional-table",
      },
    ],
  });

  await user.type(screen.getByRole("searchbox", { name: "搜索文档" }), "测试表格2");

  expect(screen.getByRole("treeitem", { name: /测试表格2/ })).toHaveClass("is-current");

  await user.click(screen.getAllByRole("button", { name: "新建多维表格" })[1]);

  expect(onCreateMultidimensionalTable).toHaveBeenCalledWith("notes");
});

test("按指针位置计算 before、inside 和 after 落点意图", () => {
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

  expect(resolvePointerIntent(flatNodes, "folder:notes", 104)).toEqual({
    placement: "before",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", 108)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", 120)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", 132)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", 136)).toEqual({
    placement: "after",
    targetId: "folder:notes",
  });
  expect(resolvePointerIntent(flatNodes, "folder:notes", null)).toEqual({
    placement: "inside",
    targetId: "folder:notes",
  });
});

test("文档行中部也可作为拖入子级落点", () => {
  renderSidebar({
    currentPath: "a.lake",
    documents: [{ id: "a.lake", path: "a.lake", name: "测试文件1", parentPath: "", size: 1, kind: "lake" }],
  });
  const flatNodes = flattenDocumentTree(buildDocumentTree(
    [{ id: "a.lake", path: "a.lake", name: "测试文件1", parentPath: "", size: 1, kind: "lake" }],
    [],
  ));
  const documentRow = screen.getByTestId("tree-row-document:a.lake");
  vi.spyOn(documentRow, "getBoundingClientRect").mockReturnValue({
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

  expect(resolvePointerIntent(flatNodes, "document:a.lake", 104)).toEqual({
    placement: "before",
    targetId: "document:a.lake",
  });
  expect(resolvePointerIntent(flatNodes, "document:a.lake", 108)).toEqual({
    placement: "inside",
    targetId: "document:a.lake",
  });
  expect(resolvePointerIntent(flatNodes, "document:a.lake", 120)).toEqual({
    placement: "inside",
    targetId: "document:a.lake",
  });
  expect(resolvePointerIntent(flatNodes, "document:a.lake", 132)).toEqual({
    placement: "inside",
    targetId: "document:a.lake",
  });
  expect(resolvePointerIntent(flatNodes, "document:a.lake", 136)).toEqual({
    placement: "after",
    targetId: "document:a.lake",
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

test("Lake 文档行可以通过小眼睛入口按阅读模式打开", async () => {
  const user = userEvent.setup();
  const onOpenDocument = vi.fn();
  const onOpenDocumentReadOnly = vi.fn();
  const { props } = renderSidebar({ onOpenDocument, onOpenDocumentReadOnly });

  await user.click(screen.getByRole("button", { name: "阅读文档" }));

  expect(onOpenDocumentReadOnly).toHaveBeenCalledWith(props.documents[0]);
  expect(onOpenDocument).not.toHaveBeenCalled();
});

test("非 Lake 文档不显示阅读模式入口", () => {
  renderSidebar({
    currentPath: "notes/budget.json",
    documents: [
      {
        id: "notes/budget.json",
        path: "notes/budget.json",
        name: "budget",
        parentPath: "notes",
        size: 1,
        kind: "spreadsheet",
      },
    ],
  });

  expect(screen.queryByRole("button", { name: "阅读文档" })).not.toBeInTheDocument();
});

test("目录区域右键可以新建目录、文档、表格和多维表格", async () => {
  const user = userEvent.setup();
  const onCreateDirectory = vi.fn();
  const onCreateDocument = vi.fn();
  const onCreateSpreadsheet = vi.fn();
  const onCreateMultidimensionalTable = vi.fn();
  renderSidebar({
    onCreateDirectory,
    onCreateDocument,
    onCreateSpreadsheet,
    onCreateMultidimensionalTable,
  });

  fireEvent.contextMenu(screen.getByRole("treeitem", { name: /notes/ }), { clientX: 120, clientY: 180 });
  const folderMenu = screen.getByRole("menu", { name: "目录右键菜单" });

  await user.click(within(folderMenu).getByRole("menuitem", { name: "新建表格" }));
  expect(onCreateSpreadsheet).toHaveBeenCalledWith("notes");

  fireEvent.contextMenu(screen.getByRole("treeitem", { name: /notes/ }), { clientX: 120, clientY: 180 });
  await user.click(within(screen.getByRole("menu", { name: "目录右键菜单" })).getByRole("menuitem", { name: "新建多维表格" }));
  expect(onCreateMultidimensionalTable).toHaveBeenCalledWith("notes");

  fireEvent.contextMenu(document.querySelector(".sidebar-section")!, { clientX: 120, clientY: 180 });
  const rootMenu = screen.getByRole("menu", { name: "目录右键菜单" });
  await user.click(within(rootMenu).getByRole("menuitem", { name: "新建文档" }));
  expect(onCreateDocument).toHaveBeenCalledWith("");

  fireEvent.contextMenu(document.querySelector(".sidebar-section")!, { clientX: 120, clientY: 180 });
  await user.click(within(screen.getByRole("menu", { name: "目录右键菜单" })).getByRole("menuitem", { name: "新建目录" }));
  expect(onCreateDirectory).toHaveBeenCalledWith("");
});

test("文档右键菜单支持重命名、删除并可点击外部关闭", async () => {
  const user = userEvent.setup();
  const onRenameDocument = vi.fn();
  const onDeleteDocument = vi.fn();
  const { props } = renderSidebar({ onRenameDocument, onDeleteDocument });

  fireEvent.contextMenu(screen.getByRole("treeitem", { name: /a/ }), { clientX: 120, clientY: 180 });
  const documentMenu = screen.getByRole("menu", { name: "目录右键菜单" });

  await user.click(within(documentMenu).getByRole("menuitem", { name: "重命名文档" }));
  expect(onRenameDocument).toHaveBeenCalledWith(props.documents[0]);
  expect(screen.queryByRole("menu", { name: "目录右键菜单" })).not.toBeInTheDocument();

  fireEvent.contextMenu(screen.getByRole("treeitem", { name: /a/ }), { clientX: 120, clientY: 180 });
  await user.click(within(screen.getByRole("menu", { name: "目录右键菜单" })).getByRole("menuitem", { name: "删除文档" }));
  expect(onDeleteDocument).toHaveBeenCalledWith(props.documents[0]);

  fireEvent.contextMenu(screen.getByRole("treeitem", { name: /a/ }), { clientX: 120, clientY: 180 });
  expect(screen.getByRole("menu", { name: "目录右键菜单" })).toBeInTheDocument();
  await user.click(screen.getByRole("treeitem", { name: /notes/ }));
  expect(screen.queryByRole("menu", { name: "目录右键菜单" })).not.toBeInTheDocument();
});
