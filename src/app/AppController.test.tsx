import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  CreateDocumentPayload,
  MoveWorkspaceItemInput,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import { AppController } from "./AppController";

const createLakeDocument = vi.fn<(title: string, parentPath?: string) => Promise<CreateDocumentPayload>>();
const deleteLakeDocument = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const downloadExternalFile = vi.fn<(url: string, filename: string) => Promise<string | null>>();
const getRecentWorkspace = vi.fn<() => Promise<WorkspacePayload | null>>(async () => null);
const moveWorkspaceItem = vi.fn<(input: MoveWorkspaceItemInput) => Promise<WorkspacePayload>>();
const readLakeDocument = vi.fn<(path: string) => Promise<string>>(async () => "<p>hello</p>");
const saveBinaryExport = vi.fn<(defaultPath: string, bytes: Uint8Array, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const savePdfExport = vi.fn<(defaultPath: string, html: string, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const saveTextExport = vi.fn<(defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const setWorkspaceRoot = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const writeLakeDocument = vi.fn<(path: string, content: string) => Promise<void>>();

vi.mock("../components/DocumentSidebar", () => ({
  DocumentSidebar: ({
    workspaceRoot,
    documents,
    currentPath,
    onCreateDocument,
    onExportWorkspaceMarkdown,
    onOpenDocument,
    onDeleteDocument,
    onMoveNode,
  }: {
    workspaceRoot: string | null;
    documents: Array<{ path: string; name: string; parentPath: string; size: number }>;
    currentPath: string | null;
    onCreateDocument: (parentPath: string) => void;
    onExportWorkspaceMarkdown: () => void;
    onOpenDocument: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onDeleteDocument: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onMoveNode: (sourceId: string, intent: { placement: "inside"; targetId: string }) => void;
  }) => (
    <div>
      <div>{workspaceRoot ? workspaceRoot.split("/").pop() : "未选择目录"}</div>
      <div data-testid="current-path">{currentPath ?? ""}</div>
      <button type="button" onClick={() => onCreateDocument("")}>
        侧栏新建文档
      </button>
      <button type="button" onClick={onExportWorkspaceMarkdown}>
        导出知识库 Markdown ZIP
      </button>
      {documents.map((document) => (
        <div key={document.path}>
          <button
            type="button"
            role="treeitem"
            onClick={() => onOpenDocument(document)}
          >
            {document.name}
          </button>
          <button type="button" onClick={() => onDeleteDocument(document)}>
            删除 {document.name}
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onMoveNode("document:a.lake", { placement: "inside", targetId: "folder:notes" })}
      >
        移入目录
      </button>
    </div>
  ),
}));

vi.mock("../lib/tauri", () => ({
  chooseWorkspaceDirectory: vi.fn(async () => "/tmp/kb"),
  createLakeDirectory: vi.fn(),
  createLakeDocument: (title: string, parentPath?: string) => createLakeDocument(title, parentPath),
  deleteLakeDirectory: vi.fn(),
  deleteLakeDocument: (path: string) => deleteLakeDocument(path),
  downloadExternalFile: (url: string, filename: string) => downloadExternalFile(url, filename),
  getOssSettings: vi.fn(async () => null),
  getRecentWorkspace: () => getRecentWorkspace(),
  moveWorkspaceItem: (input: MoveWorkspaceItemInput) => moveWorkspaceItem(input),
  openExternalUrl: vi.fn(),
  readLakeDocument: (path: string) => readLakeDocument(path),
  renameLakeDirectory: vi.fn(),
  renameLakeDocument: vi.fn(),
  renameWorkspace: vi.fn(),
  saveOssSettings: vi.fn(),
  saveBinaryExport: (defaultPath: string, bytes: Uint8Array, filters: Array<{ name: string; extensions: string[] }>) => saveBinaryExport(defaultPath, bytes, filters),
  savePdfExport: (defaultPath: string, html: string, filters: Array<{ name: string; extensions: string[] }>) => savePdfExport(defaultPath, html, filters),
  saveTextExport: (defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) => saveTextExport(defaultPath, content, filters),
  saveWorkspaceOrder: vi.fn(),
  setWorkspaceRoot: (path: string) => setWorkspaceRoot(path),
  uploadFile: vi.fn(),
  uploadImage: vi.fn(),
  writeLakeDocument: (path: string, content: string) => writeLakeDocument(path, content),
}));

beforeEach(() => {
  createLakeDocument.mockReset();
  deleteLakeDocument.mockReset();
  downloadExternalFile.mockReset();
  downloadExternalFile.mockResolvedValue("/tmp/attachment.pdf");
  getRecentWorkspace.mockResolvedValue(null);
  moveWorkspaceItem.mockReset();
  readLakeDocument.mockResolvedValue("<p>hello</p>");
  saveBinaryExport.mockReset();
  saveBinaryExport.mockResolvedValue("/tmp/export.zip");
  savePdfExport.mockReset();
  savePdfExport.mockResolvedValue("/tmp/export.pdf");
  saveTextExport.mockReset();
  saveTextExport.mockResolvedValue("/tmp/export.md");
  setWorkspaceRoot.mockReset();
  writeLakeDocument.mockResolvedValue(undefined);
});

afterEach(() => {
  window.Doc = undefined;
  vi.restoreAllMocks();
});

test("选择目录后展示 workspace 文档", async () => {
  const user = userEvent.setup();
  setWorkspaceRoot.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      {
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
      },
    ],
    order: [],
  });

  render(<AppController />);

  await user.click(screen.getByRole("button", { name: "选择目录" }));

  await waitFor(() => {
    expect(screen.getByText("kb")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /a/ })).toBeInTheDocument();
  });
});

test("移动当前打开文档后绑定到后端返回的新路径", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1 }],
    order: ["document:a.lake", "folder:notes"],
  });
  moveWorkspaceItem.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1 }],
    order: ["folder:notes", "document:notes/a.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake"));
  await user.click(screen.getByRole("button", { name: "移入目录" }));

  await waitFor(() => {
    expect(moveWorkspaceItem).toHaveBeenCalledWith({
      sourceId: "document:a.lake",
      targetParentPath: "notes",
      order: ["folder:notes", "document:a.lake"],
    });
    expect(screen.getByTestId("current-path")).toHaveTextContent("notes/a.lake");
  });
});

test("后端移动失败时回滚 workspace 并展示错误", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1 }],
    order: ["document:a.lake", "folder:notes"],
  });
  moveWorkspaceItem.mockRejectedValue(new Error("目标位置已存在同名项目：notes/a.lake"));

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(screen.getByRole("button", { name: "移入目录" }));

  await waitFor(() => {
    expect(screen.getByText("目标位置已存在同名项目：notes/a.lake")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake");
    expect(screen.getByRole("treeitem", { name: "a" })).toBeInTheDocument();
  });
});

test("删除当前新建文档后仍可打开已有文档", async () => {
  const user = userEvent.setup();
  const initialWorkspace: WorkspacePayload = {
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "old.lake", path: "old.lake", name: "old", parentPath: "", size: 1 }],
    order: ["document:old.lake"],
  };
  const createdWorkspace: CreateDocumentPayload = {
    ...initialWorkspace,
    documents: [
      initialWorkspace.documents[0],
      { id: "未命名文档.lake", path: "未命名文档.lake", name: "未命名文档", parentPath: "", size: 1 },
    ],
    order: ["document:old.lake", "document:未命名文档.lake"],
    createdDocument: { id: "未命名文档.lake", path: "未命名文档.lake", name: "未命名文档", parentPath: "", size: 1 },
  };
  getRecentWorkspace.mockResolvedValue(initialWorkspace);
  createLakeDocument.mockResolvedValue(createdWorkspace);
  deleteLakeDocument.mockResolvedValue(initialWorkspace);
  readLakeDocument.mockImplementation(async (path) => `<p>${path}</p>`);
  writeLakeDocument.mockRejectedValue(new Error("写入失败"));
  vi.spyOn(window, "confirm").mockReturnValue(true);

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "侧栏新建文档" }));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("未命名文档.lake"));

  await user.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("写入失败");

  await user.click(screen.getByRole("button", { name: "删除 未命名文档" }));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent(""));

  await user.click(screen.getByRole("treeitem", { name: "old" }));

  await waitFor(() => {
    expect(screen.getByTestId("current-path")).toHaveTextContent("old.lake");
    expect(screen.queryByText("当前文档保存失败，请先处理后再切换")).not.toBeInTheDocument();
  });
});

test("可以收起并展开目录侧栏", async () => {
  const user = userEvent.setup();
  const { container } = render(<AppController />);
  const shell = container.querySelector(".app-shell");

  await user.click(screen.getByRole("button", { name: "收起目录侧栏" }));

  expect(shell).toHaveAttribute("style", expect.stringContaining("0px 12px"));
  expect(screen.getByRole("button", { name: "展开目录侧栏" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "展开目录侧栏" }));

  expect(shell).toHaveAttribute("style", expect.stringContaining("296px 12px"));
  expect(screen.getByRole("button", { name: "收起目录侧栏" })).toBeInTheDocument();
});

test("可以导出整个知识库 Markdown ZIP", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "![图片](file:///tmp/a.png)\n"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1 }],
    order: ["folder:notes", "document:notes/a.lake"],
  });
  readLakeDocument.mockResolvedValue("<h1>hello</h1><p>world</p>");

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "导出知识库 Markdown ZIP" }));

  await waitFor(() => {
    expect(saveBinaryExport).toHaveBeenCalledWith(
      "kb.zip",
      expect.any(Uint8Array),
      expect.any(Array),
    );
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<h1>hello</h1><p>world</p>");
    expect(editor.getDocument).toHaveBeenCalledWith("text/markdown");
    expect(editor.destroy).toHaveBeenCalled();
  });
});
