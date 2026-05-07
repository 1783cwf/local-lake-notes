import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExcelJS from "exceljs";
import { CellValueType } from "@univerjs/core";
import { forwardRef, useEffect, useImperativeHandle, type Ref } from "react";

import type {
  CreateDocumentPayload,
  MoveWorkspaceItemInput,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import { AppController } from "./AppController";

const createLakeDocument = vi.fn<(title: string, parentPath?: string) => Promise<CreateDocumentPayload>>();
const createSpreadsheetDocument = vi.fn<(title: string, parentPath?: string) => Promise<CreateDocumentPayload>>();
const chooseExcelImportFile = vi.fn<() => Promise<{ path: string; name: string; bytes: Uint8Array } | null>>();
const createBackup = vi.fn<(input: { forceFull: boolean }) => Promise<{
  record: {
    id: string;
    backupType: "full" | "incremental";
    createdAt: string;
    keyFingerprint: string;
    encryptedSize: number;
    archiveHash: string;
    objectKey: string;
    canRestore: boolean;
  };
  warnings: string[];
}>>();
const deleteBackup = vi.fn<(input: { backupId: string }) => Promise<{ deletedBackupIds: string[] }>>();
const deleteLakeDocument = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const deleteSpreadsheetDocument = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const createTemporaryResourceUrl = vi.fn<(resourceRef: string, ttlSeconds: number, filename?: string) => Promise<string>>();
const downloadResourceFile = vi.fn<(input: { url: string; filename: string; resourceRef?: string }) => Promise<string | null>>();
const getDatabaseLocation = vi.fn(async () => ({
  directory: "/tmp/local-lake-db",
  databasePath: "/tmp/local-lake-db/yuque-lake-notes.sqlite3",
  custom: false,
}));
const getBackupKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false }));
const getResourceKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false, knownFingerprints: [] }));
const verifyBackupKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false }));
const verifyResourceKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false, knownFingerprints: [] }));
const getRecentWorkspace = vi.fn<() => Promise<WorkspacePayload | null>>(async () => null);
const listBackups = vi.fn(async () => [] as Array<{
  id: string;
  backupType: "full" | "incremental";
  createdAt: string;
  keyFingerprint: string;
  encryptedSize: number;
  archiveHash: string;
  objectKey: string;
  canRestore: boolean;
}>);
const moveWorkspaceItem = vi.fn<(input: MoveWorkspaceItemInput) => Promise<WorkspacePayload>>();
const readLakeDocument = vi.fn<(path: string) => Promise<string>>(async () => "<p>hello</p>");
const readSpreadsheetDocument = vi.fn<(path: string) => Promise<string>>(async () => "{\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\"}}}");
const restoreBackup = vi.fn<(input: { backupId: string; allowKeyMismatch?: boolean }) => Promise<{
  restoredBackupId: string;
  restoredAt: string;
  requiresRestart: boolean;
  warnings: string[];
}>>();
const saveBinaryExport = vi.fn<(defaultPath: string, bytes: Uint8Array, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const savePdfExport = vi.fn<(defaultPath: string, html: string, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const saveTextExport = vi.fn<(defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) => Promise<string | null>>();
const setWorkspaceRoot = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const writeLakeDocument = vi.fn<(path: string, content: string) => Promise<void>>();
const writeSpreadsheetDocument = vi.fn<(path: string, content: string) => Promise<void>>();

vi.mock("../components/DocumentSidebar", () => ({
  DocumentSidebar: ({
    workspaceRoot,
    documents,
    currentPath,
    onCreateDocument,
    onCreateSpreadsheet,
    onExportWorkspaceMarkdown,
    onOpenDocument,
    onDeleteDocument,
    onMoveNode,
  }: {
    workspaceRoot: string | null;
    documents: Array<{ path: string; name: string; parentPath: string; size: number }>;
    currentPath: string | null;
    onCreateDocument: (parentPath: string) => void;
    onCreateSpreadsheet: (parentPath: string) => void;
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
      <button type="button" onClick={() => onCreateSpreadsheet("")}>
        侧栏新建表格
      </button>
      <button type="button" onClick={onExportWorkspaceMarkdown}>
        导出知识库 ZIP
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

vi.mock("../features/spreadsheet/SpreadsheetEditor", () => ({
  SpreadsheetEditor: forwardRef(({
    document,
    content,
    manualSaveRequest,
    onSave,
    onSaveStatusChange,
    onRegisterSaveNow,
  }: {
    document: { path: string; name: string } | null;
    content: string;
    manualSaveRequest: number;
    onSave: (relativePath: string, content: string) => Promise<void>;
    onSaveStatusChange: (status: { state: "clean" | "saved" }) => void;
    onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
  }, ref: Ref<{
    importExcel: (file: File) => Promise<string>;
    exportExcel: () => Promise<File>;
  }>) => {
    useEffect(() => {
      onSaveStatusChange({ state: "clean" });
    }, [onSaveStatusChange]);
    useImperativeHandle(ref, () => ({
      importExcel: async (file: File) => {
        const nextContent = `{"sheetOrder":["sheet-0001"],"sheets":{"sheet-0001":{"id":"sheet-0001","name":"${file.name}"}}}`;
        if (document) {
          await onSave(document.path, nextContent);
        }
        return nextContent;
      },
      exportExcel: async () => {
        const buffer = new ArrayBuffer(3);
        new Uint8Array(buffer).set([7, 8, 9]);
        return new File([buffer], "budget.xlsx");
      },
    }), [document, onSave]);
    useEffect(() => {
      const saveNow = async () => {
        if (document) {
          await onSave(document.path, content);
        }
      };
      onRegisterSaveNow?.(saveNow);
      return () => onRegisterSaveNow?.(null);
    }, [content, document, onRegisterSaveNow, onSave]);
    useEffect(() => {
      if (manualSaveRequest > 0 && document) {
        void onSave(document.path, content);
      }
    }, [content, document, manualSaveRequest, onSave]);
    return <div data-testid="spreadsheet-editor">表格编辑器 {document?.name}</div>;
  }),
}));

vi.mock("../lib/tauri", () => ({
  chooseExcelImportFile: () => chooseExcelImportFile(),
  chooseDatabaseDirectory: vi.fn(async () => "/tmp/selected-db"),
  chooseWorkspaceDirectory: vi.fn(async () => "/tmp/kb"),
  createLakeDirectory: vi.fn(),
  createBackup: (input: { forceFull: boolean }) => createBackup(input),
  createLakeDocument: (title: string, parentPath?: string) => createLakeDocument(title, parentPath),
  createSpreadsheetDocument: (title: string, parentPath?: string) => createSpreadsheetDocument(title, parentPath),
  createTemporaryResourceUrl: (resourceRef: string, ttlSeconds: number, filename?: string) => (
    createTemporaryResourceUrl(resourceRef, ttlSeconds, filename)
  ),
  deleteLakeDirectory: vi.fn(),
  deleteBackup: (input: { backupId: string }) => deleteBackup(input),
  deleteLakeDocument: (path: string) => deleteLakeDocument(path),
  deleteSpreadsheetDocument: (path: string) => deleteSpreadsheetDocument(path),
  downloadResourceFile: (input: { url: string; filename: string; resourceRef?: string }) => downloadResourceFile(input),
  getDatabaseLocation: () => getDatabaseLocation(),
  getOssSettings: vi.fn(async () => null),
  getBackupKeyStatus: () => getBackupKeyStatus(),
  getResourceKeyStatus: () => getResourceKeyStatus(),
  verifyBackupKeyStatus: () => verifyBackupKeyStatus(),
  verifyResourceKeyStatus: () => verifyResourceKeyStatus(),
  getRecentWorkspace: () => getRecentWorkspace(),
  listBackups: () => listBackups(),
  moveWorkspaceItem: (input: MoveWorkspaceItemInput) => moveWorkspaceItem(input),
  openExternalUrl: vi.fn(),
  prepareResourcePreview: vi.fn(async (resourceRef: string) => resourceRef),
  readLakeDocument: (path: string) => readLakeDocument(path),
  readSpreadsheetDocument: (path: string) => readSpreadsheetDocument(path),
  renameLakeDirectory: vi.fn(),
  renameLakeDocument: vi.fn(),
  renameSpreadsheetDocument: vi.fn(),
  renameWorkspace: vi.fn(),
  saveOssSettings: vi.fn(),
  saveBinaryExport: (defaultPath: string, bytes: Uint8Array, filters: Array<{ name: string; extensions: string[] }>) => saveBinaryExport(defaultPath, bytes, filters),
  savePdfExport: (defaultPath: string, html: string, filters: Array<{ name: string; extensions: string[] }>) => savePdfExport(defaultPath, html, filters),
  saveTextExport: (defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) => saveTextExport(defaultPath, content, filters),
  saveDatabaseLocation: vi.fn(async (directory: string) => ({
    directory,
    databasePath: `${directory}/yuque-lake-notes.sqlite3`,
    custom: true,
  })),
  resetBackupKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "fingerprint" })),
  resetResourceKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "resource-fingerprint", knownFingerprints: ["resource-fingerprint"] })),
  restoreBackup: (input: { backupId: string; allowKeyMismatch?: boolean }) => restoreBackup(input),
  readResourceBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  saveWorkspaceOrder: vi.fn(),
  setBackupKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "fingerprint" })),
  setResourceKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "resource-fingerprint", knownFingerprints: ["resource-fingerprint"] })),
  setWorkspaceRoot: (path: string) => setWorkspaceRoot(path),
  uploadFile: vi.fn(),
  uploadImage: vi.fn(),
  writeLakeDocument: (path: string, content: string) => writeLakeDocument(path, content),
  writeSpreadsheetDocument: (path: string, content: string) => writeSpreadsheetDocument(path, content),
}));

beforeEach(() => {
  chooseExcelImportFile.mockReset();
  chooseExcelImportFile.mockResolvedValue(null);
  createSpreadsheetDocument.mockReset();
  createBackup.mockReset();
  createBackup.mockResolvedValue({
    record: {
      id: "backup",
      backupType: "full",
      createdAt: new Date().toISOString(),
      keyFingerprint: "fingerprint",
      encryptedSize: 1,
      archiveHash: "hash",
      objectKey: "backup.ylbackup",
      canRestore: true,
    },
    warnings: [],
  });
  deleteBackup.mockReset();
  deleteBackup.mockResolvedValue({ deletedBackupIds: ["backup"] });
  createLakeDocument.mockReset();
  createTemporaryResourceUrl.mockReset();
  createTemporaryResourceUrl.mockImplementation(async (resourceRef, ttlSeconds) => `${resourceRef}&ttl=${ttlSeconds}`);
  deleteLakeDocument.mockReset();
  deleteSpreadsheetDocument.mockReset();
  downloadResourceFile.mockReset();
  downloadResourceFile.mockResolvedValue("/tmp/attachment.pdf");
  getDatabaseLocation.mockReset();
  getDatabaseLocation.mockResolvedValue({
    directory: "/tmp/local-lake-db",
    databasePath: "/tmp/local-lake-db/yuque-lake-notes.sqlite3",
    custom: false,
  });
  getBackupKeyStatus.mockReset();
  getBackupKeyStatus.mockResolvedValue({ configured: false, needsKey: false });
  getResourceKeyStatus.mockReset();
  getResourceKeyStatus.mockResolvedValue({ configured: false, needsKey: false, knownFingerprints: [] });
  verifyBackupKeyStatus.mockReset();
  verifyBackupKeyStatus.mockResolvedValue({ configured: false, needsKey: false });
  verifyResourceKeyStatus.mockReset();
  verifyResourceKeyStatus.mockResolvedValue({ configured: false, needsKey: false, knownFingerprints: [] });
  getRecentWorkspace.mockResolvedValue(null);
  listBackups.mockReset();
  listBackups.mockResolvedValue([]);
  moveWorkspaceItem.mockReset();
  readLakeDocument.mockReset();
  readLakeDocument.mockResolvedValue("<p>hello</p>");
  readSpreadsheetDocument.mockReset();
  readSpreadsheetDocument.mockResolvedValue("{\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\"}}}");
  restoreBackup.mockReset();
  restoreBackup.mockResolvedValue({
    restoredBackupId: "backup",
    restoredAt: new Date().toISOString(),
    requiresRestart: false,
    warnings: [],
  });
  saveBinaryExport.mockReset();
  saveBinaryExport.mockResolvedValue("/tmp/export.zip");
  savePdfExport.mockReset();
  savePdfExport.mockResolvedValue("/tmp/export.pdf");
  saveTextExport.mockReset();
  saveTextExport.mockResolvedValue("/tmp/export.md");
  setWorkspaceRoot.mockReset();
  writeLakeDocument.mockResolvedValue(undefined);
  writeSpreadsheetDocument.mockReset();
  writeSpreadsheetDocument.mockResolvedValue(undefined);
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
        kind: "lake",
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

test("启动时只读取备份密钥元数据，不触发钥匙串验证", async () => {
  getBackupKeyStatus.mockResolvedValue({ configured: true, needsKey: false });

  render(<AppController />);

  await waitFor(() => expect(getBackupKeyStatus).toHaveBeenCalled());
  expect(verifyBackupKeyStatus).not.toHaveBeenCalled();
});

test("移动当前打开文档后绑定到后端返回的新路径", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake", "folder:notes"],
  });
  moveWorkspaceItem.mockResolvedValue({
    root: "/tmp/kb",
    directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
    documents: [{ id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1, kind: "lake" }],
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
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
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
    documents: [{ id: "old.lake", path: "old.lake", name: "old", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:old.lake"],
  };
  const createdWorkspace: CreateDocumentPayload = {
    ...initialWorkspace,
    documents: [
      initialWorkspace.documents[0],
      { id: "未命名文档.lake", path: "未命名文档.lake", name: "未命名文档", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:old.lake", "document:未命名文档.lake"],
    createdDocument: { id: "未命名文档.lake", path: "未命名文档.lake", name: "未命名文档", parentPath: "", size: 1, kind: "lake" },
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

test("可以新建表格并打开表格编辑器", async () => {
  const user = userEvent.setup();
  const payload: CreateDocumentPayload = {
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "未命名表格.json", path: "未命名表格.json", name: "未命名表格", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:未命名表格.json"],
    createdDocument: { id: "未命名表格.json", path: "未命名表格.json", name: "未命名表格", parentPath: "", size: 1, kind: "spreadsheet" },
  };
  getRecentWorkspace.mockResolvedValue({ root: "/tmp/kb", directories: [], documents: [], order: [] });
  createSpreadsheetDocument.mockResolvedValue(payload);
  readSpreadsheetDocument.mockResolvedValue("{\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\"}}}");

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "侧栏新建表格" }));

  await waitFor(() => {
    expect(createSpreadsheetDocument).toHaveBeenCalledWith("未命名表格", "");
    expect(readSpreadsheetDocument).toHaveBeenCalledWith("未命名表格.json");
    expect(screen.getByTestId("current-path")).toHaveTextContent("未命名表格.json");
    expect(screen.getByTestId("spreadsheet-editor")).toHaveTextContent("表格编辑器 未命名表格");
  });
});

test("打开表格时读取 Univer 快照内容且不展示文档导出入口", async () => {
  const user = userEvent.setup();
  const spreadsheetContent = "{\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\"}}}";
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "budget.json", path: "budget.json", name: "budget", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:budget.json"],
  });
  readSpreadsheetDocument.mockResolvedValue(spreadsheetContent);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "budget" }));

  await waitFor(() => {
    expect(readSpreadsheetDocument).toHaveBeenCalledWith("budget.json");
    expect(screen.getByTestId("spreadsheet-editor")).toHaveTextContent("表格编辑器 budget");
    expect(screen.queryByRole("button", { name: "导出文档" })).not.toBeInTheDocument();
  });
});

test("保存表格时写入当前 Univer 快照内容", async () => {
  const user = userEvent.setup();
  const spreadsheetContent = "{\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\"}}}";
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "budget.json", path: "budget.json", name: "budget", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:budget.json"],
  });
  readSpreadsheetDocument.mockResolvedValue(spreadsheetContent);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "budget" }));
  await user.click(await screen.findByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(writeSpreadsheetDocument).toHaveBeenCalledWith("budget.json", spreadsheetContent);
    expect(saveBinaryExport).not.toHaveBeenCalled();
  });
});

test("表格文档可以导入 Excel 并写入当前表格快照", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "budget.json", path: "budget.json", name: "budget", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:budget.json"],
  });
  chooseExcelImportFile.mockResolvedValue({
    path: "/tmp/import.xlsx",
    name: "import.xlsx",
    bytes: new Uint8Array([1, 2, 3]),
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "budget" }));
  await user.click(await screen.findByRole("button", { name: "Excel 导入导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导入 Excel" }));

  await waitFor(() => {
    expect(chooseExcelImportFile).toHaveBeenCalled();
    expect(writeSpreadsheetDocument).toHaveBeenCalledWith("budget.json", expect.stringContaining("import.xlsx"));
    expect(screen.queryByText("正在导入 Excel")).not.toBeInTheDocument();
  });
});

test("表格文档可以导出当前快照为 Excel 文件", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "budget.json", path: "budget.json", name: "budget", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:budget.json"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "budget" }));
  await user.click(await screen.findByRole("button", { name: "Excel 导入导出" }));
  await user.click(screen.getByRole("menuitem", { name: "导出 Excel" }));

  await waitFor(() => {
    expect(saveBinaryExport).toHaveBeenCalledWith(
      "budget.xlsx",
      new Uint8Array([7, 8, 9]),
      [{ name: "Excel", extensions: ["xlsx"] }],
    );
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

test("可以导出整个知识库 ZIP，表格文档会转换为 Excel", async () => {
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
    documents: [
      { id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1, kind: "lake" },
      { id: "notes/budget.json", path: "notes/budget.json", name: "budget", parentPath: "notes", size: 1, kind: "spreadsheet" },
    ],
    order: ["folder:notes", "document:notes/a.lake", "document:notes/budget.json"],
  });
  readLakeDocument.mockResolvedValue("<h1>hello</h1><p>world</p>");
  readSpreadsheetDocument.mockResolvedValue(JSON.stringify({
    name: "budget",
    sheetOrder: ["sheet-0001"],
    styles: {},
    sheets: {
      "sheet-0001": {
        id: "sheet-0001",
        name: "预算",
        cellData: {
          0: {
            0: { v: "收入", t: CellValueType.STRING },
            1: { v: 100, t: CellValueType.NUMBER },
          },
        },
      },
    },
  }));

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "导出知识库 ZIP" }));

  let zipEntries: Array<{ path: string; bytes: Uint8Array; content: string }> = [];
  await waitFor(() => {
    expect(saveBinaryExport).toHaveBeenCalledWith(
      "kb.zip",
      expect.any(Uint8Array),
      expect.any(Array),
    );
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<h1>hello</h1><p>world</p>");
    expect(editor.getDocument).toHaveBeenCalledWith("text/markdown");
    expect(editor.destroy).toHaveBeenCalled();
    expect(readLakeDocument).toHaveBeenCalledTimes(1);
    expect(readSpreadsheetDocument).toHaveBeenCalledWith("notes/budget.json");
  });
  zipEntries = readStoredZipEntries(saveBinaryExport.mock.calls[0][1]);
  const workbook = new ExcelJS.Workbook();
  const spreadsheetEntry = zipEntries.find((entry) => entry.path === "notes/budget.xlsx");
  expect(spreadsheetEntry).toBeTruthy();
  await workbook.xlsx.load(spreadsheetEntry?.bytes.buffer.slice(
    spreadsheetEntry.bytes.byteOffset,
    spreadsheetEntry.bytes.byteOffset + spreadsheetEntry.bytes.byteLength,
  ) as ArrayBuffer);

  expect(zipEntries.map((entry) => entry.path)).toEqual(["notes/", "notes/a.md", "notes/budget.xlsx"]);
  expect(zipEntries.find((entry) => entry.path === "notes/a.md")?.content).toContain("![图片](file:///tmp/a.png)");
  expect(workbook.getWorksheet("预算")?.getCell("A1").value).toBe("收入");
  expect(workbook.getWorksheet("预算")?.getCell("B1").value).toBe(100);
});

test("创建备份前先保存当前打开文档的最新内容", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>已有文档新增内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake"],
  });
  readLakeDocument.mockResolvedValue("<p>备份前旧内容</p>");

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await waitFor(() => expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>备份前旧内容</p>"));
  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.click(screen.getByRole("button", { name: "立即备份" }));

  await waitFor(() => {
    expect(writeLakeDocument).toHaveBeenCalledWith("a.lake", "<p>已有文档新增内容</p>");
    expect(createBackup).toHaveBeenCalledWith({ forceFull: false });
  });
  expect(writeLakeDocument.mock.invocationCallOrder[0]).toBeLessThan(createBackup.mock.invocationCallOrder[0]);
});

test("恢复备份后刷新当前打开文档内容", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>恢复前显示内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const workspace: WorkspacePayload = {
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake"],
  };
  getRecentWorkspace.mockResolvedValue(workspace);
  listBackups.mockResolvedValue([
    {
      id: "incremental-backup",
      backupType: "incremental",
      createdAt: "2026-05-04T01:07:23Z",
      keyFingerprint: "fingerprint",
      encryptedSize: 1024,
      archiveHash: "hash",
      objectKey: "backup.ylbackup",
      canRestore: true,
    },
  ]);
  readLakeDocument
    .mockResolvedValueOnce("<p>恢复前旧内容</p>")
    .mockResolvedValueOnce("<p>恢复后新增内容</p>");
  vi.spyOn(window, "confirm").mockReturnValue(true);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await waitFor(() => expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>恢复前旧内容</p>"));
  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.click(await screen.findByRole("button", { name: "恢复" }));

  await waitFor(() => {
    expect(restoreBackup).toHaveBeenCalledWith({ backupId: "incremental-backup", allowKeyMismatch: false });
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>恢复后新增内容</p>");
  });
});

test("可以删除备份并刷新备份列表", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [],
    order: [],
  });
  listBackups
    .mockResolvedValueOnce([{
      id: "backup-1",
      backupType: "full",
      createdAt: "2026-05-04T01:07:23Z",
      keyFingerprint: "fingerprint",
      encryptedSize: 1024,
      archiveHash: "hash",
      objectKey: "backup.ylbackup",
      canRestore: true,
    }])
    .mockResolvedValueOnce([]);
  vi.spyOn(window, "confirm").mockReturnValue(true);

  render(<AppController />);

  await user.click(screen.getByRole("button", { name: "设置" }));
  await user.click(screen.getByRole("button", { name: "备份恢复" }));
  await user.click(await screen.findByRole("button", { name: /删除备份/ }));
  await user.click(await screen.findByRole("button", { name: "确认删除" }));

  await waitFor(() => {
    expect(deleteBackup).toHaveBeenCalledWith({ backupId: "backup-1" });
    expect(screen.getByText("暂无备份")).toBeInTheDocument();
  });
});

function readStoredZipEntries(bytes: Uint8Array): Array<{ path: string; bytes: Uint8Array; content: string }> {
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Array<{ path: string; bytes: Uint8Array; content: string }> = [];
  let offset = 0;

  while (offset < bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressedSize = view.getUint32(offset + 18, true);
    const pathLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const pathStart = offset + 30;
    const contentStart = pathStart + pathLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    const contentBytes = bytes.slice(contentStart, contentEnd);
    entries.push({
      path: decoder.decode(bytes.slice(pathStart, pathStart + pathLength)),
      bytes: contentBytes,
      content: decoder.decode(contentBytes),
    });
    offset = contentEnd;
  }

  return entries;
}
