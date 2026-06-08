import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExcelJS from "exceljs";
import { CellValueType } from "@univerjs/core";
import { forwardRef, useEffect, useImperativeHandle, type Ref } from "react";

import type {
  CreateDocumentPayload,
  KnownWorkspace,
  MoveWorkspaceItemInput,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import type { DocumentTabGroup, GlobalTypographySettings, OssSettings } from "./appState";
import { AppController } from "./AppController";

const defaultTestTypography: GlobalTypographySettings = { fontFamily: "system-ui", defaultFontSize: 19 };
const createLakeDocument = vi.fn<(title: string, parentPath?: string, typography?: GlobalTypographySettings) => Promise<CreateDocumentPayload>>();
const createSpreadsheetDocument = vi.fn<(title: string, parentPath?: string) => Promise<CreateDocumentPayload>>();
const createMultidimensionalTableDocument = vi.fn<(title: string, parentPath?: string) => Promise<CreateDocumentPayload>>();
const createWorkspaceRoot = vi.fn<(parentPath: string, name: string) => Promise<WorkspacePayload>>();
const chooseExcelImportFile = vi.fn<() => Promise<{ path: string; name: string; bytes: Uint8Array } | null>>();
const createLakeDirectory = vi.fn<(parentPath: string, name: string) => Promise<WorkspacePayload>>();
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
const deleteLakeDirectory = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const deleteSpreadsheetDocument = vi.fn<(path: string) => Promise<WorkspacePayload>>();
const createTemporaryResourceUrl = vi.fn<(resourceRef: string, ttlSeconds: number, filename?: string) => Promise<string>>();
const downloadResourceFile = vi.fn<(input: { url: string; filename: string; resourceRef?: string }) => Promise<string | null>>();
const getDatabaseLocation = vi.fn(async () => ({
  directory: "/tmp/local-lake-db",
  databasePath: "/tmp/local-lake-db/yuque-lake-notes.sqlite3",
  custom: false,
}));
const getOssSettings = vi.fn<() => Promise<OssSettings | null>>(async () => null);
const getTypographySettings = vi.fn<() => Promise<GlobalTypographySettings>>(async () => defaultTestTypography);
const saveTypographySettings = vi.fn(async (settings: GlobalTypographySettings) => settings);
const getDocumentTabGroups = vi.fn<() => Promise<DocumentTabGroup[]>>(async () => []);
const saveDocumentTabGroups = vi.fn<(groups: DocumentTabGroup[]) => Promise<DocumentTabGroup[]>>(async (groups) => groups);
const getBackupKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false }));
const getAiSettings = vi.fn(async () => ({ profiles: [] }));
const listAiModels = vi.fn<(input: { profileId: string }) => Promise<{ profileId: string; models: [] }>>(
  async (input) => ({ profileId: input.profileId, models: [] }),
);
const runAiDocumentAction = vi.fn<(input: unknown) => Promise<{
  actionType: "summarize-document" | "rewrite" | "custom-edit";
  title: string;
  content: string;
  previewMode: "informational" | "replace-document" | "patch";
  contentScope?: "document" | "selection";
  patch?: {
    summary?: string;
    operations: Array<
      | { type: "append-document"; markdown: string; summary?: string }
      | { type: "prepend-document"; markdown: string; summary?: string }
      | { type: "insert-after"; anchor: string; markdown: string; summary?: string }
      | { type: "replace-selection"; markdown: string; summary?: string }
    >;
  };
}>>(async () => ({
  actionType: "summarize-document",
  title: "文档总结",
  content: "AI 总结",
  previewMode: "informational",
}));
const runAiSplitDocument = vi.fn<(input: unknown) => Promise<{
  title: string;
  parts: Array<{ title: string; content: string }>;
}>>(async () => ({
  title: "拆分方案",
  parts: [
    { title: "第一部分", content: "# 第一部分" },
    { title: "第二部分", content: "# 第二部分" },
  ],
}));
const runAiTableAction = vi.fn<(input: unknown) => Promise<{
  actionType: "generate-fields";
  title: string;
  summary: string;
  patch?: {
    fields?: Array<{ name: string; type: "text"; options?: string[] }>;
    records?: Array<{ title?: string; values?: Record<string, string>; body?: string }>;
    preferBoard?: boolean;
  };
}>>(async () => ({
  actionType: "generate-fields",
  title: "字段建议",
  summary: "建议新增字段",
  patch: { fields: [{ name: "优先级", type: "text" }] },
}));
const runAiSpreadsheetAction = vi.fn<(input: unknown) => Promise<{
  actionType: "create-sheet";
  title: string;
  summary: string;
  patch?: {
    sheets?: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }>;
    appendRows?: Array<Array<string | number | boolean | null>>;
  };
}>>(async () => ({
  actionType: "create-sheet",
  title: "工作表建议",
  summary: "建议新增工作表",
  patch: { sheets: [{ name: "AI 表", rows: [["标题", "状态"], ["任务", "待办"]] }] },
}));
const saveAiSettings = vi.fn(async (input: { settings: { profiles: unknown[] } }) => input.settings);
const addAiModelToProfile = vi.fn<(input: unknown) => Promise<{ profiles: [] }>>(async () => ({ profiles: [] }));
const setActiveAiModel = vi.fn<(input: { configuredModelId: string }) => Promise<{ profiles: [] }>>(
  async () => ({ profiles: [] }),
);
const getResourceKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false, knownFingerprints: [] }));
const verifyBackupKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false }));
const verifyResourceKeyStatus = vi.fn(async () => ({ configured: false, needsKey: false, knownFingerprints: [] }));
const getRecentWorkspace = vi.fn<() => Promise<WorkspacePayload | null>>(async () => null);
const listKnownWorkspaces = vi.fn<() => Promise<KnownWorkspace[]>>(async () => []);
const forgetWorkspaceRoot = vi.fn<(path: string) => Promise<KnownWorkspace[]>>(async () => []);
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
const readMultidimensionalTableDocument = vi.fn<(path: string) => Promise<string>>(async () => "{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}");
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
const renameLakeDirectory = vi.fn<(path: string, name: string) => Promise<WorkspacePayload>>();
const renameLakeDocument = vi.fn<(path: string, name: string) => Promise<WorkspacePayload>>();
const renameMultidimensionalTableDocument = vi.fn<(path: string, name: string) => Promise<WorkspacePayload>>();
const renameSpreadsheetDocument = vi.fn<(path: string, name: string) => Promise<WorkspacePayload>>();
const writeLakeDocument = vi.fn<(path: string, content: string) => Promise<void>>();
const writeSpreadsheetDocument = vi.fn<(path: string, content: string) => Promise<void>>();
const writeMultidimensionalTableDocument = vi.fn<(path: string, content: string) => Promise<void>>();

const s3SignedUrlOssSettings: OssSettings = {
  activeProvider: "s3",
  endpoint: "https://s3.example.test",
  bucket: "yuque",
  region: "us-east-1",
  accessKeyId: "key",
  secretAccessKey: "",
  publicBaseUrl: "https://oss.example.test/yuque",
  forcePathStyle: true,
  imagePrefix: "images",
  filePrefix: "files",
  backupPrefix: "backups",
  defaultExportResourceStrategy: "signed-url",
  defaultSignedUrlTtlSeconds: 3600,
  maxSignedUrlTtlSeconds: 7 * 24 * 60 * 60,
  allowSignedUrlExport: true,
  resourcePreviewConcurrency: 6,
  local: {
    rootDirectory: "",
    storageId: "local",
  },
  webdav: {
    endpoint: "",
    username: "",
    password: "",
    rootPath: "",
    storageId: "webdav",
  },
};

vi.mock("../components/DocumentSidebar", () => ({
  DocumentSidebar: ({
    workspaceRoot,
    directories,
    documents,
    currentPath,
    onCreateDirectory,
    onCreateDocument,
    onCreateSpreadsheet,
    onCreateMultidimensionalTable,
    onExportWorkspaceMarkdown,
    onOpenDocument,
    onOpenDocumentReadOnly,
    onDeleteDocument,
    onRenameDocument,
    onDeleteDirectory,
    onMoveNode,
  }: {
    workspaceRoot: string | null;
    directories: Array<{ path: string; name: string; parentPath: string }>;
    documents: Array<{ path: string; name: string; parentPath: string; size: number }>;
    currentPath: string | null;
    onCreateDirectory: (parentPath: string) => void;
    onCreateDocument: (parentPath: string) => void;
    onCreateSpreadsheet: (parentPath: string) => void;
    onCreateMultidimensionalTable: (parentPath: string) => void;
    onExportWorkspaceMarkdown: () => void;
    onOpenDocument: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onOpenDocumentReadOnly: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onDeleteDocument: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onRenameDocument: (document: { path: string; name: string; parentPath: string; size: number }) => void;
    onDeleteDirectory: (directory: { path: string; name: string; parentPath: string }) => void;
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
      <button type="button" onClick={() => onCreateMultidimensionalTable("")}>
        侧栏新建多维表格
      </button>
      <button type="button" onClick={onExportWorkspaceMarkdown}>
        导出知识库 ZIP
      </button>
      <button type="button" onClick={() => onCreateDirectory("")}>
        根目录新建目录
      </button>
      {directories.map((directory) => (
        <div key={directory.path}>
          <span>{directory.name}</span>
          <button type="button" onClick={() => onCreateDirectory(directory.path)}>
            在 {directory.name} 下新建目录
          </button>
          <button type="button" onClick={() => onCreateDocument(directory.path)}>
            在 {directory.name} 下新建文档
          </button>
          <button type="button" onClick={() => onDeleteDirectory(directory)}>
            删除目录 {directory.name}
          </button>
        </div>
      ))}
      {documents.map((document) => (
        <div key={document.path}>
          <button
            type="button"
            role="treeitem"
            onClick={() => onOpenDocument(document)}
          >
            {document.name}
          </button>
          <button type="button" onClick={() => onOpenDocumentReadOnly(document)}>
            阅读 {document.name}
          </button>
          <button type="button" onClick={() => onDeleteDocument(document)}>
            删除 {document.name}
          </button>
          <button type="button" onClick={() => onRenameDocument(document)}>
            重命名 {document.name}
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

vi.mock("../components/AppRail", () => ({
  AppRail: ({
    knownWorkspaces = [],
    activeWorkspaceRoot,
    onChooseWorkspace,
    onCreateWorkspace,
    onSwitchWorkspace,
    onForgetWorkspace,
    onCreateDocument,
    tabGroups = [],
    lockedTabCount = 0,
    onSaveCurrentTabGroup,
    onOpenTabGroup,
    onDeleteTabGroup,
    onOpenSettings,
  }: {
    knownWorkspaces?: KnownWorkspace[];
    activeWorkspaceRoot?: string | null;
    onChooseWorkspace: () => void;
    onCreateWorkspace?: () => void;
    onSwitchWorkspace?: (root: string) => void;
    onForgetWorkspace?: (root: string) => void;
    onCreateDocument: () => void;
    tabGroups?: Array<{ id: string; name: string }>;
    lockedTabCount?: number;
    onSaveCurrentTabGroup?: (name: string) => void;
    onOpenTabGroup?: (groupId: string) => void;
    onDeleteTabGroup?: (groupId: string) => void;
    onOpenSettings: () => void;
  }) => (
    <nav aria-label="应用导航">
      <button type="button" onClick={onChooseWorkspace}>选择目录</button>
      <button type="button" onClick={onCreateWorkspace}>新建知识库</button>
      <button type="button" onClick={onCreateDocument}>新建文档</button>
      <button type="button" onClick={() => onSaveCurrentTabGroup?.("工作标签组")} disabled={lockedTabCount === 0}>保存标签组</button>
      <button type="button" onClick={onOpenSettings}>设置</button>
      <div data-testid="active-workspace-root">{activeWorkspaceRoot ?? ""}</div>
      {knownWorkspaces.map((workspace) => (
        <div key={workspace.root}>
          <button type="button" onClick={() => onSwitchWorkspace?.(workspace.root)}>
            切换 {workspace.name}
          </button>
          <button type="button" onClick={() => onForgetWorkspace?.(workspace.root)}>
            移除 {workspace.name}
          </button>
        </div>
      ))}
      {tabGroups.map((group) => (
        <div key={group.id}>
          <button type="button" onClick={() => onOpenTabGroup?.(group.id)}>
            打开标签组 {group.name}
          </button>
          <button type="button" onClick={() => onDeleteTabGroup?.(group.id)}>
            删除标签组 {group.name}
          </button>
        </div>
      ))}
    </nav>
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
    onRegisterReadWorkbook,
    aiWorkbookSnapshot,
    aiWorkbookSnapshotRequestId,
    onAiWorkbookSnapshotApplied,
  }: {
    document: { path: string; name: string } | null;
    content: string;
    manualSaveRequest: number;
    onSave: (relativePath: string, content: string) => Promise<void>;
    onSaveStatusChange: (status: { state: "clean" | "saved" }) => void;
    onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
    onRegisterReadWorkbook?: (readWorkbook: (() => unknown) | null) => void;
    aiWorkbookSnapshot?: unknown;
    aiWorkbookSnapshotRequestId?: number;
    onAiWorkbookSnapshotApplied?: () => void;
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
      onRegisterReadWorkbook?.(() => JSON.parse(content));
      return () => onRegisterReadWorkbook?.(null);
    }, [content, onRegisterReadWorkbook]);
    useEffect(() => {
      if (aiWorkbookSnapshot && aiWorkbookSnapshotRequestId && document) {
        void onSave(document.path, JSON.stringify(aiWorkbookSnapshot));
        onAiWorkbookSnapshotApplied?.();
      }
    }, [aiWorkbookSnapshot, aiWorkbookSnapshotRequestId, document, onAiWorkbookSnapshotApplied, onSave]);
    useEffect(() => {
      if (manualSaveRequest > 0 && document) {
        void onSave(document.path, content);
      }
    }, [content, document, manualSaveRequest, onSave]);
    return <div data-testid="spreadsheet-editor">表格编辑器 {document?.name}</div>;
  }),
}));

vi.mock("../features/multidimensional-table/MultidimensionalTableEditor", () => ({
  MultidimensionalTableEditor: forwardRef(({
    document,
    content,
    manualSaveRequest,
    onSave,
    onSaveStatusChange,
    onRegisterSaveNow,
    onRegisterReadTable,
    aiTablePatch,
    aiTablePatchRequestId,
    onAiTablePatchApplied,
  }: {
    document: { path: string; name: string } | null;
    content: string;
    manualSaveRequest: number;
    onSave: (relativePath: string, content: string) => Promise<void>;
    onSaveStatusChange: (status: { state: "clean" | "saved" }) => void;
    onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
    onRegisterReadTable?: (readTable: (() => unknown) | null) => void;
    aiTablePatch?: unknown;
    aiTablePatchRequestId?: number;
    onAiTablePatchApplied?: () => void;
  }, ref: Ref<{ saveNow: () => Promise<void> }>) => {
    useEffect(() => {
      onSaveStatusChange({ state: "clean" });
    }, [onSaveStatusChange]);
    useImperativeHandle(ref, () => ({
      saveNow: async () => {
        if (document) {
          await onSave(document.path, content);
        }
      },
    }), [content, document, onSave]);
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
      onRegisterReadTable?.(() => JSON.parse(content));
      return () => onRegisterReadTable?.(null);
    }, [content, onRegisterReadTable]);
    useEffect(() => {
      if (aiTablePatch && aiTablePatchRequestId && document) {
        void onSave(document.path, JSON.stringify({ appliedPatch: aiTablePatch }));
        onAiTablePatchApplied?.();
      }
    }, [aiTablePatch, aiTablePatchRequestId, document, onAiTablePatchApplied, onSave]);
    useEffect(() => {
      if (manualSaveRequest > 0 && document) {
        void onSave(document.path, content);
      }
    }, [content, document, manualSaveRequest, onSave]);
    return <div data-testid="multitable-editor">多维表格编辑器 {document?.name}</div>;
  }),
}));

vi.mock("../lib/tauri", () => ({
  analyzeResourceMigration: vi.fn(async () => ({
    totalReferences: 0,
    uniqueResources: 0,
    documentCount: 0,
    totalBytes: 0,
    migratedResources: [],
    skippedResources: [],
    unreadableResources: [],
    conflictResources: [],
  })),
  chooseExcelImportFile: () => chooseExcelImportFile(),
  chooseDatabaseDirectory: vi.fn(async () => "/tmp/selected-db"),
  chooseStorageDirectory: vi.fn(async () => "/tmp/file-storage"),
  chooseWorkspaceDirectory: vi.fn(async () => "/tmp/kb"),
  createLakeDirectory: (parentPath: string, name: string) => createLakeDirectory(parentPath, name),
  createBackup: (input: { forceFull: boolean }) => createBackup(input),
  createLakeDocument: (title: string, parentPath?: string, typography?: GlobalTypographySettings) => createLakeDocument(title, parentPath, typography),
  createMultidimensionalTableDocument: (title: string, parentPath?: string) => createMultidimensionalTableDocument(title, parentPath),
  createSpreadsheetDocument: (title: string, parentPath?: string) => createSpreadsheetDocument(title, parentPath),
  createWorkspaceRoot: (parentPath: string, name: string) => createWorkspaceRoot(parentPath, name),
  createTemporaryResourceUrl: (resourceRef: string, ttlSeconds: number, filename?: string) => (
    createTemporaryResourceUrl(resourceRef, ttlSeconds, filename)
  ),
  deleteLakeDirectory: (path: string) => deleteLakeDirectory(path),
  deleteBackup: (input: { backupId: string }) => deleteBackup(input),
  deleteLakeDocument: (path: string) => deleteLakeDocument(path),
  deleteMultidimensionalTableDocument: vi.fn(),
  deleteSpreadsheetDocument: (path: string) => deleteSpreadsheetDocument(path),
  downloadResourceFile: (input: { url: string; filename: string; resourceRef?: string }) => downloadResourceFile(input),
  getDatabaseLocation: () => getDatabaseLocation(),
  getAiSettings: () => getAiSettings(),
  getOssSettings: () => getOssSettings(),
  getTypographySettings: () => getTypographySettings(),
  getDocumentTabGroups: () => getDocumentTabGroups(),
  getBackupKeyStatus: () => getBackupKeyStatus(),
  getResourceKeyStatus: () => getResourceKeyStatus(),
  verifyBackupKeyStatus: () => verifyBackupKeyStatus(),
  verifyResourceKeyStatus: () => verifyResourceKeyStatus(),
  getRecentWorkspace: () => getRecentWorkspace(),
  listKnownWorkspaces: () => listKnownWorkspaces(),
  forgetWorkspaceRoot: (path: string) => forgetWorkspaceRoot(path),
  listBackups: () => listBackups(),
  moveWorkspaceItem: (input: MoveWorkspaceItemInput) => moveWorkspaceItem(input),
  openExternalUrl: vi.fn(),
  prepareResourcePreview: vi.fn(async (resourceRef: string) => resourceRef),
  readLakeDocument: (path: string) => readLakeDocument(path),
  readMultidimensionalTableDocument: (path: string) => readMultidimensionalTableDocument(path),
  readSpreadsheetDocument: (path: string) => readSpreadsheetDocument(path),
  renameLakeDirectory: (path: string, name: string) => renameLakeDirectory(path, name),
  renameLakeDocument: (path: string, name: string) => renameLakeDocument(path, name),
  renameMultidimensionalTableDocument: (path: string, name: string) => renameMultidimensionalTableDocument(path, name),
  renameSpreadsheetDocument: (path: string, name: string) => renameSpreadsheetDocument(path, name),
  renameWorkspace: vi.fn(),
  saveAiSettings: (input: { settings: { profiles: unknown[] } }) => saveAiSettings(input),
  saveOssSettings: vi.fn(),
  saveTypographySettings: (settings: GlobalTypographySettings) => saveTypographySettings(settings),
  saveDocumentTabGroups: (groups: DocumentTabGroup[]) => saveDocumentTabGroups(groups),
  saveBinaryExport: (defaultPath: string, bytes: Uint8Array, filters: Array<{ name: string; extensions: string[] }>) => saveBinaryExport(defaultPath, bytes, filters),
  savePdfExport: (defaultPath: string, html: string, filters: Array<{ name: string; extensions: string[] }>) => savePdfExport(defaultPath, html, filters),
  saveTextExport: (defaultPath: string, content: string, filters: Array<{ name: string; extensions: string[] }>) => saveTextExport(defaultPath, content, filters),
  saveDatabaseLocation: vi.fn(async (directory: string) => ({
    directory,
    databasePath: `${directory}/yuque-lake-notes.sqlite3`,
    custom: true,
  })),
  testStorageConnection: vi.fn(async () => ({
    provider: "s3",
    storageId: "notes",
    ok: true,
    message: "连接测试成功",
  })),
  resetBackupKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "fingerprint" })),
  resetResourceKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "resource-fingerprint", knownFingerprints: ["resource-fingerprint"] })),
  restoreBackup: (input: { backupId: string; allowKeyMismatch?: boolean }) => restoreBackup(input),
  runResourceMigration: vi.fn(async () => ({
    analysis: {
      totalReferences: 0,
      uniqueResources: 0,
      documentCount: 0,
      totalBytes: 0,
      migratedResources: [],
      skippedResources: [],
      unreadableResources: [],
      conflictResources: [],
    },
    rewrittenDocuments: [],
    copiedResources: 0,
  })),
  runAiDocumentAction: (input: unknown) => runAiDocumentAction(input),
  runAiSplitDocument: (input: unknown) => runAiSplitDocument(input),
  runAiSpreadsheetAction: (input: unknown) => runAiSpreadsheetAction(input),
  runAiTableAction: (input: unknown) => runAiTableAction(input),
  readResourceBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  saveWorkspaceOrder: vi.fn(),
  setBackupKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "fingerprint" })),
  setActiveAiModel: (input: { configuredModelId: string }) => setActiveAiModel(input),
  addAiModelToProfile: (input: unknown) => addAiModelToProfile(input),
  listAiModels: (input: { profileId: string }) => listAiModels(input),
  setResourceKey: vi.fn(async () => ({ configured: true, needsKey: false, fingerprint: "resource-fingerprint", knownFingerprints: ["resource-fingerprint"] })),
  setWorkspaceRoot: (path: string) => setWorkspaceRoot(path),
  uploadFile: vi.fn(),
  uploadImage: vi.fn(),
  writeLakeDocument: (path: string, content: string) => writeLakeDocument(path, content),
  writeMultidimensionalTableDocument: (path: string, content: string) => writeMultidimensionalTableDocument(path, content),
  writeSpreadsheetDocument: (path: string, content: string) => writeSpreadsheetDocument(path, content),
}));

beforeEach(() => {
  chooseExcelImportFile.mockReset();
  chooseExcelImportFile.mockResolvedValue(null);
  createSpreadsheetDocument.mockReset();
  createMultidimensionalTableDocument.mockReset();
  createWorkspaceRoot.mockReset();
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
  createLakeDirectory.mockReset();
  createLakeDocument.mockReset();
  createTemporaryResourceUrl.mockReset();
  createTemporaryResourceUrl.mockImplementation(async (resourceRef, ttlSeconds) => `${resourceRef}&ttl=${ttlSeconds}`);
  deleteLakeDirectory.mockReset();
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
  getAiSettings.mockReset();
  getAiSettings.mockResolvedValue({ profiles: [] });
  listAiModels.mockReset();
  listAiModels.mockResolvedValue({ profileId: "openai", models: [] });
  runAiDocumentAction.mockReset();
  runAiDocumentAction.mockResolvedValue({
    actionType: "summarize-document",
    title: "文档总结",
    content: "AI 总结",
    previewMode: "informational",
  });
  runAiSplitDocument.mockReset();
  runAiSplitDocument.mockResolvedValue({
    title: "拆分方案",
    parts: [
      { title: "第一部分", content: "# 第一部分" },
      { title: "第二部分", content: "# 第二部分" },
    ],
  });
  runAiTableAction.mockReset();
  runAiTableAction.mockResolvedValue({
    actionType: "generate-fields",
    title: "字段建议",
    summary: "建议新增字段",
    patch: { fields: [{ name: "优先级", type: "text" }] },
  });
  runAiSpreadsheetAction.mockReset();
  runAiSpreadsheetAction.mockResolvedValue({
    actionType: "create-sheet",
    title: "工作表建议",
    summary: "建议新增工作表",
    patch: { sheets: [{ name: "AI 表", rows: [["标题", "状态"], ["任务", "待办"]] }] },
  });
  saveAiSettings.mockReset();
  saveAiSettings.mockImplementation(async (input) => input.settings);
  addAiModelToProfile.mockReset();
  addAiModelToProfile.mockResolvedValue({ profiles: [] });
  setActiveAiModel.mockReset();
  setActiveAiModel.mockResolvedValue({ profiles: [] });
  getResourceKeyStatus.mockReset();
  getResourceKeyStatus.mockResolvedValue({ configured: false, needsKey: false, knownFingerprints: [] });
  getOssSettings.mockReset();
  getOssSettings.mockResolvedValue(null);
  getTypographySettings.mockReset();
  getTypographySettings.mockResolvedValue(defaultTestTypography);
  saveTypographySettings.mockReset();
  saveTypographySettings.mockImplementation(async (settings) => settings);
  getDocumentTabGroups.mockReset();
  getDocumentTabGroups.mockResolvedValue([]);
  saveDocumentTabGroups.mockReset();
  saveDocumentTabGroups.mockImplementation(async (groups) => groups);
  verifyBackupKeyStatus.mockReset();
  verifyBackupKeyStatus.mockResolvedValue({ configured: false, needsKey: false });
  verifyResourceKeyStatus.mockReset();
  verifyResourceKeyStatus.mockResolvedValue({ configured: false, needsKey: false, knownFingerprints: [] });
  getRecentWorkspace.mockResolvedValue(null);
  listKnownWorkspaces.mockReset();
  listKnownWorkspaces.mockResolvedValue([]);
  forgetWorkspaceRoot.mockReset();
  forgetWorkspaceRoot.mockResolvedValue([]);
  listBackups.mockReset();
  listBackups.mockResolvedValue([]);
  moveWorkspaceItem.mockReset();
  renameLakeDirectory.mockReset();
  renameLakeDocument.mockReset();
  renameMultidimensionalTableDocument.mockReset();
  renameSpreadsheetDocument.mockReset();
  readLakeDocument.mockReset();
  readLakeDocument.mockResolvedValue("<p>hello</p>");
  readMultidimensionalTableDocument.mockReset();
  readMultidimensionalTableDocument.mockResolvedValue("{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}");
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
  writeMultidimensionalTableDocument.mockReset();
  writeMultidimensionalTableDocument.mockResolvedValue(undefined);
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

test("启动时加载已知知识库列表并可切换当前知识库", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/work",
    directories: [],
    documents: [{ id: "work.lake", path: "work.lake", name: "work", parentPath: "", size: 1, kind: "lake" }],
    order: [],
  });
  listKnownWorkspaces.mockResolvedValue([
    { root: "/tmp/work", name: "work", lastOpenedAt: "2026-05-08T00:00:00Z" },
    { root: "/tmp/life", name: "life", lastOpenedAt: "2026-05-07T00:00:00Z" },
  ]);
  setWorkspaceRoot.mockResolvedValue({
    root: "/tmp/life",
    directories: [],
    documents: [{ id: "life.lake", path: "life.lake", name: "life", parentPath: "", size: 1, kind: "lake" }],
    order: [],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "切换 life" }));

  await waitFor(() => {
    expect(setWorkspaceRoot).toHaveBeenCalledWith("/tmp/life");
    expect(screen.getByTestId("active-workspace-root")).toHaveTextContent("/tmp/life");
    expect(screen.getByRole("treeitem", { name: "life" })).toBeInTheDocument();
  });
});

test("锁定标签后切换知识库仍保留标签并可切回原知识库内容", async () => {
  const user = userEvent.setup();
  const workWorkspace: WorkspacePayload = {
    root: "/tmp/work",
    directories: [],
    documents: [{ id: "same.lake", path: "same.lake", name: "same", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:same.lake"],
  };
  const lifeWorkspace: WorkspacePayload = {
    root: "/tmp/life",
    directories: [],
    documents: [{ id: "same.lake", path: "same.lake", name: "same", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:same.lake"],
  };
  getRecentWorkspace.mockResolvedValue(workWorkspace);
  listKnownWorkspaces.mockResolvedValue([
    { root: "/tmp/work", name: "work", lastOpenedAt: "2026-05-08T00:00:00Z" },
    { root: "/tmp/life", name: "life", lastOpenedAt: "2026-05-07T00:00:00Z" },
  ]);
  setWorkspaceRoot.mockImplementation(async (root) => {
    if (root === "/tmp/life") {
      return lifeWorkspace;
    }
    if (root === "/tmp/work") {
      return workWorkspace;
    }
    throw new Error(`未知知识库 ${root}`);
  });
  const readCalls: string[] = [];
  readLakeDocument.mockImplementation(async (path) => {
    const workspaceRoot = setWorkspaceRoot.mock.calls.at(-1)?.[0] ?? "/tmp/work";
    readCalls.push(`${workspaceRoot}:${path}`);
    return `<p>${workspaceRoot}:${path}</p>`;
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "same" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "same" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("button", { name: "切换 life" }));

  await waitFor(() => {
    expect(screen.getByTestId("active-workspace-root")).toHaveTextContent("/tmp/life");
    expect(screen.getByRole("tab", { name: "same，已锁定" })).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("");
  });

  await user.click(screen.getByRole("treeitem", { name: "same" }));

  await waitFor(() => {
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "same" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("active-workspace-root")).toHaveTextContent("/tmp/life");
    expect(screen.getByTestId("current-path")).toHaveTextContent("same.lake");
  });

  await user.click(screen.getByRole("tab", { name: "same，已锁定" }));

  await waitFor(() => {
    expect(setWorkspaceRoot).toHaveBeenLastCalledWith("/tmp/life");
    expect(screen.getByTestId("active-workspace-root")).toHaveTextContent("/tmp/life");
    expect(screen.getByTestId("current-path")).toHaveTextContent("same.lake");
  });
  await waitFor(() => {
    expect(readLakeDocument).toHaveBeenLastCalledWith("same.lake");
    expect(readCalls).toContain("/tmp/work:same.lake");
    expect(screen.getByRole("treeitem", { name: "same" })).toBeInTheDocument();
  });
});

test("打开第二个文档时未锁定标签会被替换", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });
  readLakeDocument.mockImplementation(async (path) => `<p>${path}</p>`);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake"));

  await user.click(screen.getByRole("treeitem", { name: "b" }));

  await waitFor(() => {
    expect(screen.getByTestId("current-path")).toHaveTextContent("b.lake");
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "b" })).toHaveAttribute("aria-selected", "true");
  });
});

test("侧栏阅读入口打开 Lake 文档后可以从右上角切回编辑模式", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "阅读 a" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "进入编辑模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  await user.click(screen.getByRole("button", { name: "进入编辑模式" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "进入阅读模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });
});

test("锁定当前标签后打开新文档会新增第二个标签", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("treeitem", { name: "b" }));

  await waitFor(() => {
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "a，已锁定" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "b" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("current-path")).toHaveTextContent("b.lake");
  });
});

test("可以把当前锁定标签保存为标签组", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("button", { name: "保存标签组" }));

  await waitFor(() => {
    expect(saveDocumentTabGroups).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "工作标签组",
        items: [{ workspaceRoot: "/tmp/kb", path: "a.lake", mode: "edit" }],
      }),
    ]);
  });
});

test("打开标签组会跨知识库打开并锁定全部文档", async () => {
  const user = userEvent.setup();
  const workWorkspace: WorkspacePayload = {
    root: "/tmp/work",
    directories: [],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake"],
  };
  const lifeWorkspace: WorkspacePayload = {
    root: "/tmp/life",
    directories: [],
    documents: [{ id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:b.lake"],
  };
  getRecentWorkspace.mockResolvedValue(workWorkspace);
  getDocumentTabGroups.mockResolvedValue([{
    id: "group-1",
    name: "工作标签组",
    items: [
      { workspaceRoot: "/tmp/work", path: "a.lake", mode: "edit" },
      { workspaceRoot: "/tmp/life", path: "b.lake", mode: "read" },
    ],
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  }]);
  setWorkspaceRoot.mockImplementation(async (root) => {
    if (root === "/tmp/work") {
      return workWorkspace;
    }
    if (root === "/tmp/life") {
      return lifeWorkspace;
    }
    throw new Error(`未知知识库 ${root}`);
  });

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "打开标签组 工作标签组" }));

  await waitFor(() => {
    expect(screen.getByRole("tab", { name: "a，已锁定" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "b，已锁定" })).toBeInTheDocument();
    expect(screen.getByTestId("active-workspace-root")).toHaveTextContent("/tmp/work");
  });
});

test("再次打开已经存在的标签只激活已有标签", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("treeitem", { name: "b" }));
  await user.click(screen.getByRole("treeitem", { name: "a" }));

  await waitFor(() => {
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "a，已锁定" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake");
  });
});

test("切换回已打开标签时恢复之前浏览位置", async () => {
  const user = userEvent.setup();
  window.Doc = {
    createOpenEditor: vi.fn((mountElement: HTMLElement) => {
      const wrap = document.createElement("div");
      wrap.className = "ne-editor-wrap";
      mountElement.appendChild(wrap);
      return {
        setDocument: vi.fn((_: string, content: string) => {
          wrap.textContent = content;
        }),
        getDocument: vi.fn(() => wrap.textContent ?? ""),
        on: vi.fn(),
        destroy: vi.fn(),
      };
    }),
  };
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });
  readLakeDocument.mockImplementation(async (path) => `<p>${path}</p>`);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  const firstScrollContainer = await waitFor(() => {
    const element = document.querySelector<HTMLElement>(".ne-editor-wrap");
    expect(element).not.toBeNull();
    return element!;
  });
  firstScrollContainer.scrollTop = 360;
  firstScrollContainer.scrollLeft = 24;

  await user.click(screen.getByRole("treeitem", { name: "b" }));
  await waitFor(() => expect(screen.getByTestId("current-path")).toHaveTextContent("b.lake"));
  await user.click(screen.getByRole("tab", { name: "a，已锁定" }));

  await waitFor(() => {
    expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake");
    const restored = document.querySelector<HTMLElement>(".ne-editor-wrap");
    expect(restored?.scrollTop).toBe(360);
    expect(restored?.scrollLeft).toBe(24);
  });
});

test("文档导出完成后切换标签不会重复消费旧导出请求", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => (type === "text/markdown" ? "## A" : "<p>A</p>")),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });
  readLakeDocument.mockImplementation(async (path) => `<p>${path}</p>`);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("button", { name: "导出文档" }));
  await user.click(screen.getByRole("menuitem", { name: "Markdown" }));

  await waitFor(() => {
    expect(saveTextExport).toHaveBeenCalledTimes(1);
    expect(saveTextExport.mock.calls[0][0]).toBe("a.md");
  });

  await user.click(screen.getByRole("treeitem", { name: "b" }));
  await waitFor(() => {
    expect(screen.getByTestId("current-path")).toHaveTextContent("b.lake");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(saveTextExport).toHaveBeenCalledTimes(1);
});

test("单篇 Markdown 只有图片资源时直接导出单文件", async () => {
  const user = userEvent.setup();
  const imageRef = "yuque-resource://yuque/images/a.png?kind=image&name=%E6%88%AA%E5%9B%BE.png&mimeType=image%2Fpng";
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => (type === "text/markdown" ? `![截图](${imageRef})` : "<p>图片</p>")),
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

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(screen.getByRole("button", { name: "导出文档" }));
  await user.click(screen.getByRole("menuitem", { name: "Markdown" }));

  await waitFor(() => {
    expect(saveTextExport).toHaveBeenCalledWith(
      "a.md",
      expect.stringContaining("![截图](data:image/png;base64,AQID)"),
      [{ name: "Markdown", extensions: ["md"] }],
    );
    expect(saveBinaryExport).not.toHaveBeenCalled();
  });
});

test("短时签名链接导出无本地资源时保持单个 HTML 文件", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => (type === "text/html" ? "<p>无资源正文</p>" : "无资源正文")),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  getOssSettings.mockResolvedValue(s3SignedUrlOssSettings);
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" }],
    order: ["document:a.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(screen.getByRole("button", { name: "导出文档" }));
  await user.click(screen.getByRole("menuitem", { name: "HTML" }));

  await waitFor(() => {
    expect(saveTextExport).toHaveBeenCalledWith(
      "a.html",
      expect.stringContaining("无资源正文"),
      [{ name: "HTML", extensions: ["html"] }],
    );
    expect(saveBinaryExport).not.toHaveBeenCalled();
  });
});

test("关闭活动未锁定标签后切换到相邻标签", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.pointer({ keys: "[MouseRight]", target: await screen.findByRole("tab", { name: "a" }) });
  await user.click(screen.getByRole("menuitem", { name: "锁定标签" }));
  await user.click(screen.getByRole("treeitem", { name: "b" }));
  await user.click(screen.getByRole("button", { name: "关闭 b" }));

  await waitFor(() => {
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "a，已锁定" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake");
  });
});

test("保存失败时阻止切换标签和打开新文档", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>dirty</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
      { id: "b.lake", path: "b.lake", name: "b", parentPath: "", size: 1, kind: "lake" },
    ],
    order: ["document:a.lake", "document:b.lake"],
  });
  writeLakeDocument.mockRejectedValue(new Error("写入失败"));

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("写入失败");

  await user.click(screen.getByRole("treeitem", { name: "b" }));

  await waitFor(() => {
    expect(screen.getByText("当前文档保存失败，请先处理后再切换")).toBeInTheDocument();
    expect(screen.getByTestId("current-path")).toHaveTextContent("a.lake");
  });
});

test("新建知识库后激活并刷新列表", async () => {
  const user = userEvent.setup();
  createWorkspaceRoot.mockResolvedValue({
    root: "/tmp/kb/新知识库",
    directories: [],
    documents: [],
    order: [],
  });
  listKnownWorkspaces
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ root: "/tmp/kb/新知识库", name: "新知识库", lastOpenedAt: "2026-05-08T00:00:00Z" }]);

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "新建知识库" }));
  await user.clear(await screen.findByLabelText("知识库名称"));
  await user.type(screen.getByLabelText("知识库名称"), "新知识库");
  await user.click(screen.getByRole("button", { name: "创建" }));

  await waitFor(() => {
    expect(createWorkspaceRoot).toHaveBeenCalledWith("/tmp/kb", "新知识库");
    expect(screen.getByText("新知识库")).toBeInTheDocument();
  });
});

test("移除当前知识库后回到未选择目录状态", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/work",
    directories: [],
    documents: [{ id: "work.lake", path: "work.lake", name: "work", parentPath: "", size: 1, kind: "lake" }],
    order: [],
  });
  listKnownWorkspaces.mockResolvedValue([
    { root: "/tmp/work", name: "work", lastOpenedAt: "2026-05-08T00:00:00Z" },
  ]);
  forgetWorkspaceRoot.mockResolvedValue([]);

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "移除 work" }));

  await waitFor(() => {
    expect(forgetWorkspaceRoot).toHaveBeenCalledWith("/tmp/work");
    expect(screen.getByText("未选择目录")).toBeInTheDocument();
  });
});

test("启动时只读取备份密钥元数据，不触发额外验证", async () => {
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

test("连续创建嵌套目录后可以在子目录中新建并打开 Lake 文档", async () => {
  const user = userEvent.setup();
  const initialWorkspace: WorkspacePayload = {
    root: "/tmp/kb",
    directories: [],
    documents: [],
    order: [],
  };
  const rootDirectoryWorkspace: WorkspacePayload = {
    ...initialWorkspace,
    directories: [{ id: "测试目录1", path: "测试目录1", name: "测试目录1", parentPath: "" }],
    order: ["folder:测试目录1"],
  };
  const childDirectoryWorkspace: WorkspacePayload = {
    ...initialWorkspace,
    directories: [
      { id: "测试目录1", path: "测试目录1", name: "测试目录1", parentPath: "" },
      { id: "测试目录1/测试目录2", path: "测试目录1/测试目录2", name: "测试目录2", parentPath: "测试目录1" },
    ],
    order: ["folder:测试目录1", "folder:测试目录1/测试目录2"],
  };
  const createdWorkspace: CreateDocumentPayload = {
    ...childDirectoryWorkspace,
    documents: [{ id: "测试目录1/测试目录2/未命名文档.lake", path: "测试目录1/测试目录2/未命名文档.lake", name: "未命名文档", parentPath: "测试目录1/测试目录2", size: 1, kind: "lake" }],
    order: ["folder:测试目录1", "folder:测试目录1/测试目录2", "document:测试目录1/测试目录2/未命名文档.lake"],
    createdDocument: { id: "测试目录1/测试目录2/未命名文档.lake", path: "测试目录1/测试目录2/未命名文档.lake", name: "未命名文档", parentPath: "测试目录1/测试目录2", size: 1, kind: "lake" },
  };
  getRecentWorkspace.mockResolvedValue(initialWorkspace);
  createLakeDirectory
    .mockResolvedValueOnce(rootDirectoryWorkspace)
    .mockResolvedValueOnce(childDirectoryWorkspace);
  createLakeDocument.mockResolvedValue(createdWorkspace);
  readLakeDocument.mockResolvedValue("<p>新建内容</p>");

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "根目录新建目录" }));
  await user.clear(await screen.findByLabelText("目录名称"));
  await user.type(screen.getByLabelText("目录名称"), "测试目录1");
  await user.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => expect(createLakeDirectory).toHaveBeenCalledWith("", "测试目录1"));

  await user.click(await screen.findByRole("button", { name: "在 测试目录1 下新建目录" }));
  await user.clear(screen.getByLabelText("目录名称"));
  await user.type(screen.getByLabelText("目录名称"), "测试目录2");
  await user.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => expect(createLakeDirectory).toHaveBeenCalledWith("测试目录1", "测试目录2"));

  await user.click(await screen.findByRole("button", { name: "在 测试目录2 下新建文档" }));

  await waitFor(() => {
    expect(createLakeDocument).toHaveBeenCalledWith("未命名文档", "测试目录1/测试目录2", defaultTestTypography);
    expect(readLakeDocument).toHaveBeenCalledWith("测试目录1/测试目录2/未命名文档.lake");
    expect(screen.getByTestId("current-path")).toHaveTextContent("测试目录1/测试目录2/未命名文档.lake");
    expect(screen.getByRole("heading", { name: "未命名文档" })).toBeInTheDocument();
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

test("可以新建多维表格并打开多维表格编辑器", async () => {
  const user = userEvent.setup();
  const content = "{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}";
  const payload: CreateDocumentPayload = {
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "未命名多维表格.dbtable.json", path: "未命名多维表格.dbtable.json", name: "未命名多维表格", parentPath: "", size: 1, kind: "multidimensional-table" }],
    order: ["document:未命名多维表格.dbtable.json"],
    createdDocument: { id: "未命名多维表格.dbtable.json", path: "未命名多维表格.dbtable.json", name: "未命名多维表格", parentPath: "", size: 1, kind: "multidimensional-table" },
  };
  getRecentWorkspace.mockResolvedValue({ root: "/tmp/kb", directories: [], documents: [], order: [] });
  createMultidimensionalTableDocument.mockResolvedValue(payload);
  readMultidimensionalTableDocument.mockResolvedValue(content);

  render(<AppController />);

  await user.click(await screen.findByRole("button", { name: "侧栏新建多维表格" }));

  await waitFor(() => {
    expect(createMultidimensionalTableDocument).toHaveBeenCalledWith("未命名多维表格", "");
    expect(readMultidimensionalTableDocument).toHaveBeenCalledWith("未命名多维表格.dbtable.json");
    expect(screen.getByTestId("current-path")).toHaveTextContent("未命名多维表格.dbtable.json");
    expect(screen.getByTestId("multitable-editor")).toHaveTextContent("多维表格编辑器 未命名多维表格");
  });
});

test("打开多维表格时读取 JSON 且不展示导出菜单", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "project.dbtable.json", path: "project.dbtable.json", name: "project", parentPath: "", size: 1, kind: "multidimensional-table" }],
    order: ["document:project.dbtable.json"],
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "project" }));

  await waitFor(() => {
    expect(readMultidimensionalTableDocument).toHaveBeenCalledWith("project.dbtable.json");
    expect(screen.getByTestId("multitable-editor")).toHaveTextContent("多维表格编辑器 project");
    expect(screen.queryByRole("button", { name: "导出文档" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excel 导入导出" })).not.toBeInTheDocument();
  });
});

test("保存多维表格时写入当前 JSON 内容", async () => {
  const user = userEvent.setup();
  const content = "{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}";
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "project.dbtable.json", path: "project.dbtable.json", name: "project", parentPath: "", size: 1, kind: "multidimensional-table" }],
    order: ["document:project.dbtable.json"],
  });
  readMultidimensionalTableDocument.mockResolvedValue(content);

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "project" }));
  await user.click(await screen.findByRole("button", { name: "保存" }));

  await waitFor(() => {
    expect(writeMultidimensionalTableDocument).toHaveBeenCalledWith("project.dbtable.json", content);
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

test("可以导出整个知识库 ZIP，表格文档会转换为 Excel，多维表格保留 JSON", async () => {
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
      { id: "notes/project.dbtable.json", path: "notes/project.dbtable.json", name: "project", parentPath: "notes", size: 1, kind: "multidimensional-table" },
    ],
    order: ["folder:notes", "document:notes/a.lake", "document:notes/budget.json", "document:notes/project.dbtable.json"],
  });
  readMultidimensionalTableDocument.mockResolvedValue("{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}");
  readLakeDocument.mockResolvedValue("<h1>hello</h1><p>world</p>");
  readSpreadsheetDocument.mockResolvedValue(JSON.stringify({
    name: "budget",
    sheetOrder: ["sheet-0001"],
    styles: {},
    sheets: {
      "sheet-0001": {
        id: "sheet-0001",
        name: "测试表格1",
        cellData: {
          0: {
            0: { v: "测试字段1", t: CellValueType.STRING },
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
    expect(readMultidimensionalTableDocument).toHaveBeenCalledWith("notes/project.dbtable.json");
  });
  zipEntries = readStoredZipEntries(saveBinaryExport.mock.calls[0][1]);
  const workbook = new ExcelJS.Workbook();
  const spreadsheetEntry = zipEntries.find((entry) => entry.path === "notes/budget.xlsx");
  expect(spreadsheetEntry).toBeTruthy();
  await workbook.xlsx.load(spreadsheetEntry?.bytes.buffer.slice(
    spreadsheetEntry.bytes.byteOffset,
    spreadsheetEntry.bytes.byteOffset + spreadsheetEntry.bytes.byteLength,
  ) as ArrayBuffer);

  expect(zipEntries.map((entry) => entry.path)).toEqual(["notes/", "notes/a.md", "notes/budget.xlsx", "notes/project.dbtable.json"]);
  expect(zipEntries.find((entry) => entry.path === "notes/a.md")?.content).toContain("![图片](file:///tmp/a.png)");
  expect(zipEntries.find((entry) => entry.path === "notes/project.dbtable.json")?.content).toContain("\"kind\":\"multidimensional-table\"");
  expect(workbook.getWorksheet("测试表格1")?.getCell("A1").value).toBe("测试字段1");
  expect(workbook.getWorksheet("测试表格1")?.getCell("B1").value).toBe(100);
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

test("AI 选中文本动作使用显式 Lake 选区并确认后替换选区", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>全文</p>"),
    getSelectionDocument: vi.fn(() => "旧选区"),
    replaceSelection: vi.fn(),
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
  runAiDocumentAction.mockResolvedValue({
    actionType: "rewrite",
    title: "改写预览",
    content: "替换当前选区",
    previewMode: "patch",
    contentScope: "selection",
    patch: {
      summary: "替换当前选区",
      operations: [{ type: "replace-selection", markdown: "新选区" }],
    },
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(await screen.findByRole("button", { name: "AI 文档助手" }));
  await user.click(screen.getByRole("button", { name: "改写" }));
  await user.click(screen.getByRole("button", { name: "选中区域" }));
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  await screen.findByText("新选区");
  await user.click(screen.getByRole("button", { name: "允许并替换选中区域" }));

  expect(runAiDocumentAction).toHaveBeenCalledWith(expect.objectContaining({
    actionType: "rewrite",
    content: "旧选区",
    contentScope: "selection",
  }));
  expect(editor.replaceSelection).toHaveBeenCalledWith("text/markdown", "新选区");
});

test("AI 文档助手支持自然语言修改并确认写回当前文档", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => type === "text/markdown" ? "# 原文" : "<p>原文</p>"),
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
  runAiDocumentAction.mockResolvedValue({
    actionType: "custom-edit",
    title: "文档修改预览",
    content: "新增一个表格",
    previewMode: "patch",
    contentScope: "document",
    patch: {
      summary: "新增一个表格",
      operations: [{
        type: "append-document",
        markdown: "| 列 A | 列 B |\n| --- | --- |\n| 示例 | 内容 |",
      }],
    },
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(await screen.findByRole("button", { name: "AI 文档助手" }));
  await user.type(screen.getByLabelText("你想怎么改"), "新增一个表格，任意内容都行");
  await user.click(screen.getByRole("button", { name: "生成修改预览" }));
  await waitFor(() => expect(screen.getAllByText("+").length).toBeGreaterThan(0));
  await screen.findByText(/列 A/);
  expect(screen.getByRole("region", { name: "文档修改预览" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "允许并应用修改" }));

  expect(runAiDocumentAction).toHaveBeenCalledWith(expect.objectContaining({
    actionType: "custom-edit",
    instruction: "新增一个表格，任意内容都行",
    content: "# 原文",
    contentScope: "document",
  }));
  expect(editor.setDocument).toHaveBeenCalledWith(
    "text/html",
    expect.stringContaining("<table>"),
  );
});

test("AI 文档助手自动模式生成 patch 后直接应用", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => type === "text/markdown" ? "# 原文" : "<p>原文</p>"),
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
  runAiDocumentAction.mockResolvedValue({
    actionType: "custom-edit",
    title: "文档修改预览",
    content: "开头新增背景",
    previewMode: "patch",
    contentScope: "document",
    patch: {
      summary: "补充背景",
      operations: [{ type: "prepend-document", markdown: "背景说明" }],
    },
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(await screen.findByRole("button", { name: "AI 文档助手" }));
  await user.click(screen.getByLabelText("自动模式"));
  await user.type(screen.getByLabelText("你想怎么改"), "开头新增背景");
  await user.click(screen.getByRole("button", { name: "生成修改预览" }));

  await waitFor(() => expect(editor.setDocument).toHaveBeenCalledWith("text/markdown", "背景说明\n# 原文"));
});

test("AI 长文拆分确认后创建当前文档子文档", async () => {
  const user = userEvent.setup();
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type: string) => type === "text/markdown" ? "长文内容" : "<p>长文内容</p>"),
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
  createLakeDocument
    .mockResolvedValueOnce({
      root: "/tmp/kb",
      directories: [{ id: "a", path: "a", name: "a", parentPath: "", isDocumentChildContainer: true }],
      documents: [
        { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        { id: "a/第一部分.lake", path: "a/第一部分.lake", name: "第一部分", parentPath: "a", size: 1, kind: "lake" },
      ],
      order: ["document:a.lake", "folder:a", "document:a/第一部分.lake"],
      createdDocument: { id: "a/第一部分.lake", path: "a/第一部分.lake", name: "第一部分", parentPath: "a", size: 1, kind: "lake" },
    })
    .mockResolvedValueOnce({
      root: "/tmp/kb",
      directories: [{ id: "a", path: "a", name: "a", parentPath: "", isDocumentChildContainer: true }],
      documents: [
        { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1, kind: "lake" },
        { id: "a/第一部分.lake", path: "a/第一部分.lake", name: "第一部分", parentPath: "a", size: 1, kind: "lake" },
        { id: "a/第二部分.lake", path: "a/第二部分.lake", name: "第二部分", parentPath: "a", size: 1, kind: "lake" },
      ],
      order: ["document:a.lake", "folder:a", "document:a/第一部分.lake", "document:a/第二部分.lake"],
      createdDocument: { id: "a/第二部分.lake", path: "a/第二部分.lake", name: "第二部分", parentPath: "a", size: 1, kind: "lake" },
    });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "a" }));
  await user.click(await screen.findByRole("button", { name: "AI 文档助手" }));
  await user.click(screen.getByRole("button", { name: "拆分子文档" }));
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  await screen.findByText("拆分方案");
  await user.click(screen.getByRole("button", { name: "确认创建" }));

  await waitFor(() => {
    expect(createLakeDocument).toHaveBeenNthCalledWith(1, "第一部分", "a", defaultTestTypography);
    expect(createLakeDocument).toHaveBeenNthCalledWith(2, "第二部分", "a", defaultTestTypography);
    expect(writeLakeDocument).toHaveBeenCalledWith("a/第一部分.lake", expect.stringContaining("yuque-lake-notes:typography"));
    expect(writeLakeDocument).toHaveBeenCalledWith("a/第一部分.lake", expect.stringContaining("# 第一部分"));
    expect(writeLakeDocument).toHaveBeenCalledWith("a/第二部分.lake", expect.stringContaining("yuque-lake-notes:typography"));
    expect(writeLakeDocument).toHaveBeenCalledWith("a/第二部分.lake", expect.stringContaining("# 第二部分"));
  });
});

test("AI 多维表格助手确认后把 patch 应用到当前表格保存链路", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "project.dbtable.json", path: "project.dbtable.json", name: "project", parentPath: "", size: 1, kind: "multidimensional-table" }],
    order: ["document:project.dbtable.json"],
  });
  readMultidimensionalTableDocument.mockResolvedValue("{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[],\"records\":[],\"views\":[],\"activeViewId\":\"view-table\"}");

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "project" }));
  await user.click(await screen.findByRole("button", { name: "AI 多维表格助手" }));
  await user.type(screen.getByLabelText("补充内容或要求"), "新增优先级字段");
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  await waitFor(() => expect(screen.getByLabelText("AI 表格预览结果")).toHaveTextContent("建议新增字段"));
  await user.click(screen.getByRole("button", { name: "应用到表格" }));

  await waitFor(() => {
    expect(runAiTableAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "generate-fields",
      tableTitle: "project",
      instruction: "新增优先级字段",
    }));
    expect(writeMultidimensionalTableDocument).toHaveBeenCalledWith(
      "project.dbtable.json",
      expect.stringContaining("appliedPatch"),
    );
  });
});

test("AI 多维表格助手支持根据输入创建新记录并默认不新增字段", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "project.dbtable.json", path: "project.dbtable.json", name: "project", parentPath: "", size: 1, kind: "multidimensional-table" }],
    order: ["document:project.dbtable.json"],
  });
  readMultidimensionalTableDocument.mockResolvedValue("{\"kind\":\"multidimensional-table\",\"version\":1,\"fields\":[{\"id\":\"title\",\"name\":\"标题\",\"type\":\"text\",\"primary\":true}],\"records\":[],\"views\":[{\"id\":\"view-table\",\"name\":\"表格\",\"type\":\"table\"}],\"activeViewId\":\"view-table\"}");
  runAiTableAction.mockResolvedValue({
    actionType: "generate-fields",
    title: "记录建议",
    summary: "建议新增记录",
    patch: { records: [{ title: "跟进发布", values: { 标题: "跟进发布" }, body: "下周完成" }] },
  });

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "project" }));
  await user.click(await screen.findByRole("button", { name: "AI 多维表格助手" }));
  await user.click(screen.getByRole("button", { name: "创建记录" }));
  await user.type(screen.getByLabelText("补充内容或要求"), "跟进发布，下周完成");
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  await waitFor(() => expect(screen.getByLabelText("AI 表格预览结果")).toHaveTextContent("建议新增记录"));
  await user.click(screen.getByRole("button", { name: "应用到表格" }));

  await waitFor(() => {
    expect(runAiTableAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "create-records",
      instruction: "跟进发布，下周完成",
    }));
    expect(writeMultidimensionalTableDocument).toHaveBeenCalledWith(
      "project.dbtable.json",
      expect.stringContaining("跟进发布"),
    );
  });
});

test("AI Univer 表格助手确认后应用工作表候选", async () => {
  const user = userEvent.setup();
  getRecentWorkspace.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [{ id: "budget.sheet.json", path: "budget.sheet.json", name: "budget", parentPath: "", size: 1, kind: "spreadsheet" }],
    order: ["document:budget.sheet.json"],
  });
  readSpreadsheetDocument.mockResolvedValue("{\"name\":\"budget\",\"sheetOrder\":[\"sheet-0001\"],\"sheets\":{\"sheet-0001\":{\"id\":\"sheet-0001\",\"name\":\"Sheet1\",\"cellData\":{}}}}");

  render(<AppController />);

  await user.click(await screen.findByRole("treeitem", { name: "budget" }));
  await user.click(await screen.findByRole("button", { name: "AI 表格助手" }));
  await user.type(screen.getByLabelText("补充内容或要求"), "创建预算表");
  await user.click(screen.getByRole("button", { name: "生成预览" }));
  await waitFor(() => expect(screen.getByLabelText("AI 表格预览结果")).toHaveTextContent("建议新增工作表"));
  await user.click(screen.getByRole("button", { name: "应用到表格" }));

  await waitFor(() => {
    expect(runAiSpreadsheetAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: "create-sheet",
      spreadsheetTitle: "budget.sheet",
      instruction: "创建预算表",
    }));
    expect(writeSpreadsheetDocument).toHaveBeenCalledWith(
      "budget.sheet.json",
      expect.stringContaining("AI 表"),
    );
  });
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
