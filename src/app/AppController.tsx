import type { FormEvent, PointerEvent } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { TopBar } from "../components/TopBar";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import type { MultidimensionalTableEditorHandle } from "../features/multidimensional-table/MultidimensionalTableEditor";
import type { SpreadsheetEditorHandle } from "../features/spreadsheet/SpreadsheetEditor";
import {
  createOfficialLakeMarkdownConverter,
  exportFileName,
  lakeDocumentToHtmlWithResources,
  lakeDocumentToHtmlBundle,
  lakeDocumentMarkdownToBundle,
  lakeDocumentMarkdownToTextWithResources,
  lakeWorkspaceMarkdownEntriesWithResources,
  workspaceEntriesToZip,
  workspaceExportFileName,
  type DocumentExportFormat,
  type LakeDocumentExportRequest,
  type LakeDocumentResourceExportOptions,
  type WorkspaceZipEntryInput,
} from "../features/lake-editor/lakeExport";
import { OssSettingsPanel } from "../features/settings/OssSettingsPanel";
import { exportXlsxWorkbookData } from "../features/spreadsheet/spreadsheetXlsxBridge";
import { parseSpreadsheetSnapshot } from "../features/spreadsheet/spreadsheetSnapshot";
import type {
  WorkspaceDocument,
  WorkspaceDropIntent,
  WorkspaceMoveResolution,
  WorkspacePayload,
  KnownWorkspace,
} from "../features/workspace/workspaceStore";
import {
  applyWorkspaceMove,
  buildDocumentTree,
  documentTitleFromPath,
  flattenDocumentTree,
  resolveWorkspaceMove,
} from "../features/workspace/workspaceStore";
import {
  chooseWorkspaceDirectory,
  chooseExcelImportFile,
  chooseDatabaseDirectory,
  createWorkspaceRoot,
  createLakeDirectory,
  createLakeDocument,
  createMultidimensionalTableDocument,
  createSpreadsheetDocument,
  createBackup,
  deleteLakeDirectory,
  deleteLakeDocument,
  deleteMultidimensionalTableDocument,
  deleteSpreadsheetDocument,
  deleteBackup,
  createTemporaryResourceUrl,
  downloadResourceFile,
  prepareResourcePreview,
  readResourceBytes,
  getOssSettings,
  getRecentWorkspace,
  listKnownWorkspaces,
  forgetWorkspaceRoot,
  getBackupKeyStatus,
  getDatabaseLocation,
  getResourceKeyStatus,
  listBackups,
  moveWorkspaceItem,
  readLakeDocument,
  readMultidimensionalTableDocument,
  readSpreadsheetDocument,
  renameLakeDirectory,
  renameLakeDocument,
  renameMultidimensionalTableDocument,
  renameSpreadsheetDocument,
  renameWorkspace,
  saveOssSettings,
  saveBinaryExport,
  saveDatabaseLocation,
  savePdfExport,
  saveTextExport,
  resetBackupKey,
  resetResourceKey,
  restoreBackup,
  setBackupKey,
  setResourceKey,
  setWorkspaceRoot,
  uploadFile,
  uploadImage,
  verifyBackupKeyStatus,
  verifyResourceKeyStatus,
  writeLakeDocument,
  writeMultidimensionalTableDocument,
  writeSpreadsheetDocument,
} from "../lib/tauri";
import type {
  CurrentDocumentState,
  BackupKeyStatus,
  BackupRecord,
  DatabaseLocationSettings,
  FileDownloadInput,
  OssSettings,
  OpenDocumentTab,
  ResourceKeyStatus,
  RestoreBackupOutput,
  SaveStatus,
  UploadImageInput,
  UploadImageOutput,
} from "./appState";
import { emptySaveStatus } from "./appState";

const SpreadsheetEditor = lazy(() => (
  import("../features/spreadsheet/SpreadsheetEditor").then((module) => ({ default: module.SpreadsheetEditor }))
));
const MultidimensionalTableEditor = lazy(() => (
  import("../features/multidimensional-table/MultidimensionalTableEditor")
    .then((module) => ({ default: module.MultidimensionalTableEditor }))
));

interface TextDialogState {
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}

interface AppOperationState {
  kind: "document-export" | "workspace-export" | "image-upload" | "file-upload" | "spreadsheet-excel";
  label: string;
  count?: number;
}

export function AppController() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [knownWorkspaces, setKnownWorkspaces] = useState<KnownWorkspace[]>([]);
  const [currentDocument, setCurrentDocument] = useState<CurrentDocumentState | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenDocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(emptySaveStatus);
  const [manualSaveRequest, setManualSaveRequest] = useState(0);
  const [exportRequest, setExportRequest] = useState<LakeDocumentExportRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ossSettings, setOssSettings] = useState<OssSettings | null>(null);
  const [databaseLocation, setDatabaseLocation] = useState<DatabaseLocationSettings | null>(null);
  const [backupKeyStatus, setBackupKeyStatus] = useState<BackupKeyStatus>({ configured: false, needsKey: false });
  const [resourceKeyStatus, setResourceKeyStatus] = useState<ResourceKeyStatus>({
    configured: false,
    needsKey: false,
    knownFingerprints: [],
  });
  const [backupRecords, setBackupRecords] = useState<BackupRecord[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [resourceKeyBusy, setResourceKeyBusy] = useState(false);
  const [activeBackupOperation, setActiveBackupOperation] = useState<string | null>(null);
  const [activeAppOperation, setActiveAppOperation] = useState<AppOperationState | null>(null);
  const uploadOperationCountRef = useRef(0);
  const [appError, setAppError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(296);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const saveCurrentEditorNowRef = useRef<(() => Promise<void>) | null>(null);
  const spreadsheetEditorRef = useRef<SpreadsheetEditorHandle | null>(null);
  const multidimensionalTableEditorRef = useRef<MultidimensionalTableEditorHandle | null>(null);

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.altKey && event.key === ",") {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const boot = async () => {
    try {
      const [recentWorkspace, knownWorkspaceList, settings, keyStatus, resourceStatus, database] = await Promise.all([
        getRecentWorkspace(),
        listKnownWorkspaces(),
        getOssSettings(),
        getBackupKeyStatus(),
        getResourceKeyStatus(),
        getDatabaseLocation(),
      ]);
      setWorkspace(recentWorkspace);
      setKnownWorkspaces(knownWorkspaceList);
      setOssSettings(settings);
      setBackupKeyStatus(keyStatus);
      setResourceKeyStatus(resourceStatus);
      setDatabaseLocation(database);
      await refreshBackupRecords();
    } catch (error) {
      setAppError(toMessage(error));
    }
  };

  const refreshBackupRecords = async () => {
    try {
      setBackupRecords(await listBackups());
    } catch {
      setBackupRecords([]);
    }
  };

  const refreshKnownWorkspaces = useCallback(async () => {
    setKnownWorkspaces(await listKnownWorkspaces());
  }, []);

  const refreshCurrentDocumentFromDisk = useCallback(async () => {
    if (!currentDocument) {
      setSaveStatus(emptySaveStatus);
      return;
    }

    try {
      setCurrentDocument(await readDocumentState(currentDocument.entry));
      setSaveStatus(emptySaveStatus);
    } catch {
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
    }
  }, [currentDocument]);

  const registerEditorSaveNow = useCallback((saveNow: (() => Promise<void>) | null) => {
    saveCurrentEditorNowRef.current = saveNow;
  }, []);

  const clearOpenDocumentTabs = useCallback(() => {
    setOpenTabs([]);
    setActiveTabId(null);
    setCurrentDocument(null);
    setSaveStatus(emptySaveStatus);
  }, []);

  const saveBeforeLeavingCurrentTab = useCallback(async (errorMessage: string): Promise<boolean> => {
    if (saveStatus.state === "error") {
      setAppError(errorMessage);
      return false;
    }

    try {
      await saveCurrentEditorNowRef.current?.();
      return true;
    } catch (error) {
      setAppError(toMessage(error));
      return false;
    }
  }, [saveStatus.state]);

  const activateDocumentTab = useCallback(async (
    tabId: string,
    candidateTabs: OpenDocumentTab[] = openTabs,
    candidateWorkspace: WorkspacePayload | null = workspace,
  ) => {
    const tab = candidateTabs.find((entry) => entry.id === tabId);
    const nextDocument = tab ? candidateWorkspace?.documents.find((entry) => entry.path === tab.path) : null;
    if (!tab || !nextDocument) {
      setOpenTabs(candidateTabs.filter((entry) => entry.id !== tabId));
      setActiveTabId(null);
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
      setAppError("找不到当前文档，已关闭编辑区");
      return;
    }

    setActiveTabId(tab.id);
    setCurrentDocument(await readDocumentState(nextDocument));
    setSaveStatus(emptySaveStatus);
    setAppError(null);
  }, [openTabs, workspace]);

  const activateTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) {
      return;
    }
    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再切换")) {
      return;
    }

    try {
      await activateDocumentTab(tabId);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, saveBeforeLeavingCurrentTab]);

  const openDocumentInTabs = useCallback(async (
    document: WorkspaceDocument,
    candidateWorkspace: WorkspacePayload | null = workspace,
    options: { skipSaveBeforeSwitch?: boolean } = {},
  ) => {
    const existingTab = openTabs.find((tab) => tab.path === document.path);
    if (existingTab?.id === activeTabId) {
      setAppError(null);
      return;
    }

    if (!options.skipSaveBeforeSwitch && !await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再切换")) {
      return;
    }

    try {
      if (existingTab) {
        await activateDocumentTab(existingTab.id, openTabs, candidateWorkspace);
        return;
      }

      const activeTab = openTabs.find((tab) => tab.id === activeTabId);
      const nextTab = createOpenDocumentTab(document);
      const nextTabs = activeTab && !activeTab.locked
        ? openTabs.map((tab) => (tab.id === activeTab.id ? nextTab : tab))
        : [...openTabs, nextTab];

      setOpenTabs(nextTabs);
      await activateDocumentTab(nextTab.id, nextTabs, candidateWorkspace);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, openTabs, saveBeforeLeavingCurrentTab, workspace]);

  const toggleTabLocked = useCallback((tabId: string) => {
    setOpenTabs((tabs) => tabs.map((tab) => (
      tab.id === tabId ? { ...tab, locked: !tab.locked } : tab
    )));
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    const closingIndex = openTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }
    const closingTab = openTabs[closingIndex];
    if (closingTab.locked) {
      return;
    }

    if (tabId !== activeTabId) {
      setOpenTabs(openTabs.filter((tab) => tab.id !== tabId));
      return;
    }

    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再关闭标签")) {
      return;
    }

    try {
      const nextTabs = openTabs.filter((tab) => tab.id !== tabId);
      setOpenTabs(nextTabs);
      const nextTab = nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? null;
      if (nextTab) {
        await activateDocumentTab(nextTab.id, nextTabs);
      } else {
        setActiveTabId(null);
        setCurrentDocument(null);
        setSaveStatus(emptySaveStatus);
        setAppError(null);
      }
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, openTabs, saveBeforeLeavingCurrentTab]);

  const beginUploadOperation = useCallback((kind: "image-upload" | "file-upload", label: string) => {
    uploadOperationCountRef.current += 1;
    setActiveAppOperation({
      kind,
      label,
      count: uploadOperationCountRef.current,
    });
  }, []);

  const endUploadOperation = useCallback(() => {
    uploadOperationCountRef.current = Math.max(0, uploadOperationCountRef.current - 1);
    setActiveAppOperation((operation) => {
      if (!operation || (operation.kind !== "image-upload" && operation.kind !== "file-upload")) {
        return operation;
      }
      if (uploadOperationCountRef.current === 0) {
        return null;
      }
      return {
        ...operation,
        count: uploadOperationCountRef.current,
      };
    });
  }, []);

  const chooseWorkspace = useCallback(async () => {
    const selected = await chooseWorkspaceDirectory();
    if (!selected) {
      return;
    }

    try {
      const payload = await setWorkspaceRoot(selected);
      setWorkspace(payload);
      await refreshKnownWorkspaces();
      clearOpenDocumentTabs();
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [clearOpenDocumentTabs, refreshKnownWorkspaces]);

  const createWorkspace = useCallback(() => {
    setTextDialog({
      title: "新建知识库",
      label: "知识库名称",
      initialValue: "新知识库",
      submitLabel: "创建",
      onSubmit: async (name) => {
        const selectedParent = await chooseWorkspaceDirectory();
        if (!selectedParent) {
          return;
        }

        try {
          const payload = await createWorkspaceRoot(selectedParent, name);
          setWorkspace(payload);
          await refreshKnownWorkspaces();
          clearOpenDocumentTabs();
          setAppError(null);
        } catch (error) {
          setAppError(toMessage(error));
        }
      },
    });
  }, [clearOpenDocumentTabs, refreshKnownWorkspaces]);

  const switchWorkspace = useCallback(async (root: string) => {
    if (workspace?.root === root) {
      return;
    }
    if (saveStatus.state === "error") {
      setAppError("当前文档保存失败，请先处理后再切换知识库");
      return;
    }

    try {
      await saveCurrentEditorNowRef.current?.();
      const payload = await setWorkspaceRoot(root);
      setWorkspace(payload);
      await refreshKnownWorkspaces();
      clearOpenDocumentTabs();
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [clearOpenDocumentTabs, refreshKnownWorkspaces, saveStatus.state, workspace?.root]);

  const forgetWorkspace = useCallback(async (root: string) => {
    try {
      const nextWorkspaces = await forgetWorkspaceRoot(root);
      setKnownWorkspaces(nextWorkspaces);
      if (workspace?.root === root) {
        setWorkspace(null);
        clearOpenDocumentTabs();
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [clearOpenDocumentTabs, workspace?.root]);

  const createDocument = useCallback(async (parentPath = "") => {
    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再新建文档")) {
      return;
    }

    try {
      const title = "未命名文档";
      const payload = await createLakeDocument(title, parentPath);
      setWorkspace({
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
      });
      await openDocumentInTabs(payload.createdDocument, payload, { skipSaveBeforeSwitch: true });
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [openDocumentInTabs, saveBeforeLeavingCurrentTab]);

  const createSpreadsheet = useCallback(async (parentPath = "") => {
    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再新建表格")) {
      return;
    }

    try {
      const payload = await createSpreadsheetDocument("未命名表格", parentPath);
      setWorkspace({
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
      });
      await openDocumentInTabs(payload.createdDocument, payload, { skipSaveBeforeSwitch: true });
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [openDocumentInTabs, saveBeforeLeavingCurrentTab]);

  const createMultidimensionalTable = useCallback(async (parentPath = "") => {
    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再新建多维表格")) {
      return;
    }

    try {
      const payload = await createMultidimensionalTableDocument("未命名多维表格", parentPath);
      setWorkspace({
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
      });
      await openDocumentInTabs(payload.createdDocument, payload, { skipSaveBeforeSwitch: true });
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [openDocumentInTabs, saveBeforeLeavingCurrentTab]);

  const createDirectory = useCallback((parentPath = "") => {
    setTextDialog({
      title: "新建目录",
      label: "目录名称",
      initialValue: "新目录",
      submitLabel: "创建",
      onSubmit: async (name) => {
        try {
          setWorkspace(await createLakeDirectory(parentPath, name));
          setAppError(null);
        } catch (error) {
          setAppError(toMessage(error));
        }
      },
    });
  }, []);

  const renameCurrentWorkspace = useCallback(() => {
    if (!workspace) {
      return;
    }

    setTextDialog({
      title: "重命名知识库",
      label: "知识库名称",
      initialValue: basename(workspace.root),
      submitLabel: "保存",
      onSubmit: async (name) => {
        try {
          setWorkspace(await renameWorkspace(name));
          setAppError(null);
        } catch (error) {
          setAppError(toMessage(error));
        }
      },
    });
  }, [workspace]);

  const renameDocumentTo = useCallback(async (document: WorkspaceDocument, title: string) => {
    const nextName = safeName(title);
    if (nextName === document.name) {
      return;
    }

    try {
      const payload = document.kind === "spreadsheet"
        ? await renameSpreadsheetDocument(document.path, nextName)
        : document.kind === "multidimensional-table"
          ? await renameMultidimensionalTableDocument(document.path, nextName)
          : await renameLakeDocument(document.path, nextName);
      setWorkspace(payload);
      const extension = documentExtension(document);
      const nextPath = document.parentPath ? `${document.parentPath}/${nextName}${extension}` : `${nextName}${extension}`;
      const nextTabs = rewriteOpenTabs(openTabs, document.path, nextPath);
      setOpenTabs(nextTabs);
      if (activeTabId === document.path) {
        setActiveTabId(nextPath);
      }
      if (currentDocument?.entry.path === document.path) {
        await activateDocumentTab(nextPath, nextTabs, payload);
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, currentDocument?.entry.path, openTabs]);

  const renameDocument = useCallback((document: WorkspaceDocument) => {
    setTextDialog({
      title: "重命名文档",
      label: "文档名称",
      initialValue: document.name,
      submitLabel: "保存",
      onSubmit: (title) => renameDocumentTo(document, title),
    });
  }, [renameDocumentTo]);

  const deleteDocument = useCallback(async (document: WorkspaceDocument) => {
    if (!window.confirm(`删除文档「${document.name}」？`)) {
      return;
    }

    try {
      const payload = document.kind === "spreadsheet"
        ? await deleteSpreadsheetDocument(document.path)
        : document.kind === "multidimensional-table"
          ? await deleteMultidimensionalTableDocument(document.path)
          : await deleteLakeDocument(document.path);
      setWorkspace(payload);
      const nextTabs = openTabs.filter((tab) => tab.path !== document.path);
      setOpenTabs(nextTabs);
      if (currentDocument?.entry.path === document.path) {
        const deletedIndex = openTabs.findIndex((tab) => tab.path === document.path);
        const nextTab = nextTabs[deletedIndex] ?? nextTabs[deletedIndex - 1] ?? null;
        if (nextTab) {
          await activateDocumentTab(nextTab.id, nextTabs, payload);
        } else {
          setActiveTabId(null);
          setCurrentDocument(null);
          setSaveStatus(emptySaveStatus);
        }
      } else if (activeTabId === document.path) {
        setCurrentDocument(null);
        setSaveStatus(emptySaveStatus);
        setActiveTabId(null);
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, currentDocument?.entry.path, openTabs]);

  const renameDirectory = useCallback((directory: { path: string; name: string; parentPath: string }) => {
    setTextDialog({
      title: "重命名目录",
      label: "目录名称",
      initialValue: directory.name,
      submitLabel: "保存",
      onSubmit: async (name) => {
        const nextName = safeName(name);
        if (nextName === directory.name) {
          return;
        }

        try {
          const payload = await renameLakeDirectory(directory.path, nextName);
          setWorkspace(payload);
          const nextPrefix = directory.parentPath ? `${directory.parentPath}/${nextName}` : nextName;
          const nextTabs = rewriteOpenTabsByPrefix(openTabs, directory.path, nextPrefix);
          setOpenTabs(nextTabs);
          if (activeTabId && isSameOrChildPath(activeTabId, directory.path)) {
            setActiveTabId(replacePathPrefix(activeTabId, directory.path, nextPrefix));
          }
          if (currentDocument?.entry.path.startsWith(`${directory.path}/`)) {
            const nextPath = currentDocument.entry.path.replace(directory.path, nextPrefix);
            await activateDocumentTab(nextPath, nextTabs, payload);
          }
          setAppError(null);
        } catch (error) {
          setAppError(toMessage(error));
        }
      },
    });
  }, [activateDocumentTab, activeTabId, currentDocument, openTabs]);

  const deleteDirectory = useCallback(async (directory: { path: string; name: string }) => {
    if (!window.confirm(`删除目录「${directory.name}」及其所有文档？`)) {
      return;
    }

    try {
      const payload = await deleteLakeDirectory(directory.path);
      setWorkspace(payload);
      const nextTabs = openTabs.filter((tab) => !isSameOrChildPath(tab.path, directory.path));
      setOpenTabs(nextTabs);
      if (currentDocument?.entry.path.startsWith(`${directory.path}/`)) {
        const nextTab = nextTabs[0] ?? null;
        if (nextTab) {
          await activateDocumentTab(nextTab.id, nextTabs, payload);
        } else {
          setActiveTabId(null);
          setCurrentDocument(null);
          setSaveStatus(emptySaveStatus);
        }
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, currentDocument?.entry.path, openTabs]);

  const openDocument = useCallback(async (document: WorkspaceDocument) => {
    await openDocumentInTabs(document);
  }, [openDocumentInTabs]);

  const saveDocument = useCallback(async (relativePath: string, content: string) => {
    await writeLakeDocument(relativePath, content);
  }, []);

  const saveSpreadsheet = useCallback(async (relativePath: string, content: string) => {
    await writeSpreadsheetDocument(relativePath, content);
  }, []);

  const saveMultidimensionalTable = useCallback(async (relativePath: string, content: string) => {
    await writeMultidimensionalTableDocument(relativePath, content);
  }, []);

  const createResourceExportOptions = useCallback((
    resourceStrategy?: LakeDocumentExportRequest["resourceStrategy"],
    signedUrlTtlSeconds?: number,
  ): LakeDocumentResourceExportOptions => ({
    strategy: resourceStrategy ?? ossSettings?.defaultExportResourceStrategy ?? "bundle",
    signedUrlTtlSeconds: signedUrlTtlSeconds ?? ossSettings?.defaultSignedUrlTtlSeconds ?? 24 * 60 * 60,
    bucket: ossSettings?.bucket,
    publicBaseUrl: ossSettings?.publicBaseUrl,
    imagePrefix: ossSettings?.imagePrefix,
    filePrefix: ossSettings?.filePrefix,
    signResource: (resourceRef, filename, ttlSeconds) => createTemporaryResourceUrl(resourceRef, ttlSeconds, filename),
    loadResource: readResourceBytes,
  }), [
    ossSettings?.bucket,
    ossSettings?.defaultExportResourceStrategy,
    ossSettings?.defaultSignedUrlTtlSeconds,
    ossSettings?.filePrefix,
    ossSettings?.imagePrefix,
    ossSettings?.publicBaseUrl,
  ]);

  const exportDocument = useCallback((
    format: DocumentExportFormat,
    resourceStrategy?: LakeDocumentExportRequest["resourceStrategy"],
    signedUrlTtlSeconds?: number,
  ) => {
    if (!currentDocument || currentDocument.kind !== "lake") {
      return;
    }

    const exportOptions = createResourceExportOptions(resourceStrategy, signedUrlTtlSeconds);
    setExportRequest((request) => ({
      id: (request?.id ?? 0) + 1,
      format,
      document: currentDocument.entry,
      resourceStrategy: exportOptions.strategy,
      signedUrlTtlSeconds: exportOptions.signedUrlTtlSeconds,
    }));
  }, [createResourceExportOptions, currentDocument]);

  const importSpreadsheetExcel = useCallback(async () => {
    if (!currentDocument || currentDocument.kind !== "spreadsheet") {
      return;
    }

    try {
      const selected = await chooseExcelImportFile();
      if (!selected) {
        return;
      }
      setActiveAppOperation({ kind: "spreadsheet-excel", label: "正在导入 Excel" });
      const file = new File([new Uint8Array(selected.bytes)], selected.name, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const content = await spreadsheetEditorRef.current?.importExcel(file);
      if (!content) {
        throw new Error("Excel 导入失败：表格编辑器尚未加载完成");
      }
      setCurrentDocument((current) => current?.kind === "spreadsheet" && current.entry.path === currentDocument.entry.path
        ? { ...current, content }
        : current);
      setSaveStatus({ state: "saved", savedAt: new Date().toISOString() });
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    } finally {
      setActiveAppOperation(null);
    }
  }, [currentDocument]);

  const exportSpreadsheetExcel = useCallback(async () => {
    if (!currentDocument || currentDocument.kind !== "spreadsheet") {
      return;
    }

    setActiveAppOperation({ kind: "spreadsheet-excel", label: "正在导出 Excel" });
    try {
      const file = await spreadsheetEditorRef.current?.exportExcel();
      if (!file) {
        throw new Error("Excel 导出失败：表格编辑器尚未加载完成");
      }
      await saveBinaryExport(
        `${documentTitleFromPath(currentDocument.entry.path)}.xlsx`,
        new Uint8Array(await file.arrayBuffer()),
        [{ name: "Excel", extensions: ["xlsx"] }],
      );
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    } finally {
      setActiveAppOperation(null);
    }
  }, [currentDocument]);

  const writeDocumentExport = useCallback(async (
    request: LakeDocumentExportRequest,
    content: string,
  ) => {
    const title = documentTitleFromPath(request.document.path);
    const exportOptions = createResourceExportOptions(request.resourceStrategy, request.signedUrlTtlSeconds);
    setActiveAppOperation({ kind: "document-export", label: `正在导出 ${formatExportLabel(request.format)}` });
    try {
      if (request.format === "markdown") {
        if (request.resourceStrategy === "bundle") {
          await saveBinaryExport(
            exportFileName(request.document, "markdown").replace(/\.md$/i, ".zip"),
            await lakeDocumentMarkdownToBundle(title, content, exportOptions),
            [{ name: "ZIP", extensions: ["zip"] }],
          );
        } else {
          await saveTextExport(
            exportFileName(request.document, request.format),
            await lakeDocumentMarkdownToTextWithResources(title, content, exportOptions),
            [{ name: "Markdown", extensions: ["md"] }],
          );
        }
      } else if (request.format === "html") {
        const htmlExportOptions = { ...exportOptions, embedImages: true };
        if (request.resourceStrategy === "bundle") {
          await saveBinaryExport(
            exportFileName(request.document, "html").replace(/\.html$/i, ".zip"),
            await lakeDocumentToHtmlBundle(title, content, htmlExportOptions),
            [{ name: "ZIP", extensions: ["zip"] }],
          );
        } else {
          await saveTextExport(
            exportFileName(request.document, request.format),
            await lakeDocumentToHtmlWithResources(title, content, htmlExportOptions),
            [{ name: "HTML", extensions: ["html"] }],
          );
        }
      } else {
        await savePdfExport(
          exportFileName(request.document, request.format),
          await lakeDocumentToHtmlWithResources(title, content, exportOptions),
          [{ name: "PDF", extensions: ["pdf"] }],
        );
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    } finally {
      setActiveAppOperation(null);
    }
  }, [createResourceExportOptions]);

  const exportWorkspaceMarkdownZip = useCallback(async () => {
    if (!workspace) {
      return;
    }

    setActiveAppOperation({ kind: "workspace-export", label: "正在导出知识库 ZIP" });
    try {
      const entries: WorkspaceZipEntryInput[] = [];
      const lakeDocuments = workspace.documents.filter((document) => document.kind === "lake");
      if (lakeDocuments.length > 0) {
        const converter = createOfficialLakeMarkdownConverter();
        try {
          const exportOptions = createResourceExportOptions();
          const lakeDocumentIds = new Set(lakeDocuments.map((document) => `document:${document.path}`));
          const lakeWorkspace = {
            ...workspace,
            documents: lakeDocuments,
            order: workspace.order.filter((itemId) => itemId.startsWith("folder:") || lakeDocumentIds.has(itemId)),
          };
          entries.push(...await lakeWorkspaceMarkdownEntriesWithResources(
            lakeWorkspace,
            readLakeDocument,
            exportOptions,
            converter.convert,
          ));
        } finally {
          converter.dispose();
        }
      }
      entries.push(...await workspaceSpreadsheetExcelEntries(workspace));
      entries.push(...await workspaceMultidimensionalTableEntries(workspace));
      await saveBinaryExport(
        workspaceExportFileName(workspace.root),
        workspaceEntriesToZip(entries),
        [{ name: "ZIP", extensions: ["zip"] }],
      );
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    } finally {
      setActiveAppOperation(null);
    }
  }, [createResourceExportOptions, workspace]);

  const saveSettings = useCallback(async (settings: OssSettings) => {
    const saved = await saveOssSettings(settings);
    setOssSettings(saved);
  }, []);

  const saveDatabaseDirectory = useCallback(async (directory: string) => {
    const saved = await saveDatabaseLocation(directory);
    setDatabaseLocation(saved);
    await boot();
  }, []);

  const updateBackupKey = useCallback(async (secret: string, reset: boolean) => {
    setBackupBusy(true);
    setActiveBackupOperation("key");
    try {
      setBackupKeyStatus(reset ? await resetBackupKey(secret) : await setBackupKey(secret));
      await refreshBackupRecords();
    } finally {
      setBackupBusy(false);
      setActiveBackupOperation(null);
    }
  }, []);

  const updateResourceKey = useCallback(async (secret: string, reset: boolean) => {
    setResourceKeyBusy(true);
    try {
      setResourceKeyStatus(reset ? await resetResourceKey(secret) : await setResourceKey(secret));
    } finally {
      setResourceKeyBusy(false);
    }
  }, []);

  const verifyResourceKey = useCallback(async (): Promise<ResourceKeyStatus> => {
    setResourceKeyBusy(true);
    try {
      // 用户主动点击时才访问系统钥匙串，避免应用启动或普通浏览文档时反复弹授权窗口。
      const status = await verifyResourceKeyStatus();
      setResourceKeyStatus(status);
      return status;
    } finally {
      setResourceKeyBusy(false);
    }
  }, []);

  const runBackup = useCallback(async (forceFull: boolean) => {
    setBackupBusy(true);
    setActiveBackupOperation(forceFull ? "create-full" : "create-incremental");
    try {
      // 备份读取的是磁盘上的 .lake 文件，先同步保存当前编辑器，避免增量包漏掉未落盘修改。
      await saveCurrentEditorNowRef.current?.();
      await createBackup({ forceFull });
      setBackupRecords(await listBackups());
      setBackupKeyStatus(await verifyBackupKeyStatus());
    } finally {
      setBackupBusy(false);
      setActiveBackupOperation(null);
    }
  }, []);

  const runRestore = useCallback(async (
    backupId: string,
    allowKeyMismatch: boolean,
  ): Promise<RestoreBackupOutput> => {
    setBackupBusy(true);
    setActiveBackupOperation(`restore:${backupId}`);
    try {
      const output = await restoreBackup({ backupId, allowKeyMismatch });
      await boot();
      await refreshCurrentDocumentFromDisk();
      return output;
    } finally {
      setBackupBusy(false);
      setActiveBackupOperation(null);
    }
  }, [refreshCurrentDocumentFromDisk]);

  const runDeleteBackup = useCallback(async (backupId: string) => {
    setBackupBusy(true);
    setActiveBackupOperation(`delete:${backupId}`);
    try {
      await deleteBackup({ backupId });
      setBackupRecords(await listBackups());
      setBackupKeyStatus(await getBackupKeyStatus());
    } finally {
      setBackupBusy(false);
      setActiveBackupOperation(null);
    }
  }, []);

  const uploadEditorImage = useCallback(async (input: UploadImageInput): Promise<UploadImageOutput> => {
    if (!ossSettings) {
      setSettingsOpen(true);
      throw new Error("请先配置 OSS 上传信息");
    }
    if (!resourceKeyStatus.configured) {
      setSettingsOpen(true);
      throw new Error(resourceKeyStatus.needsKey ? "本机缺少资源加密密钥" : "请先设置资源加密密钥");
    }
    beginUploadOperation("image-upload", "正在上传并加密图片");
    try {
      return await uploadImage(input);
    } finally {
      endUploadOperation();
    }
  }, [beginUploadOperation, endUploadOperation, ossSettings, resourceKeyStatus.configured, resourceKeyStatus.needsKey]);

  const uploadEditorFile = useCallback(async (input: UploadImageInput): Promise<UploadImageOutput> => {
    if (!ossSettings) {
      setSettingsOpen(true);
      throw new Error("请先配置 OSS 上传信息");
    }
    if (!resourceKeyStatus.configured) {
      setSettingsOpen(true);
      throw new Error(resourceKeyStatus.needsKey ? "本机缺少资源加密密钥" : "请先设置资源加密密钥");
    }
    beginUploadOperation("file-upload", "正在上传并加密附件");
    try {
      return await uploadFile(input);
    } finally {
      endUploadOperation();
    }
  }, [beginUploadOperation, endUploadOperation, ossSettings, resourceKeyStatus.configured, resourceKeyStatus.needsKey]);

  const downloadEditorFile = useCallback(async (input: FileDownloadInput) => {
    try {
      await downloadResourceFile(input);
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

  const prepareEditorResourcePreview = useCallback(async (resourceRef: string) => {
    try {
      return await prepareResourcePreview(resourceRef);
    } catch (error) {
      setAppError(toMessage(error));
      throw error;
    }
  }, []);

  const currentPath = currentDocument?.entry.path ?? null;
  const documents = useMemo(() => workspace?.documents ?? [], [workspace]);
  const directories = useMemo(() => workspace?.directories ?? [], [workspace]);
  const order = useMemo(() => workspace?.order ?? [], [workspace]);
  const visibleOpenTabs = useMemo(() => openTabs.flatMap((tab) => {
    const document = documents.find((entry) => entry.path === tab.path);
    return document ? [{ ...tab, document }] : [];
  }), [documents, openTabs]);

  const moveNode = useCallback(async (sourceId: string, intent: WorkspaceDropIntent) => {
    if (!workspace) {
      return;
    }

    const move = resolveWorkspaceMove(
      buildDocumentTree(workspace.documents, workspace.directories, workspace.order),
      sourceId,
      intent,
    );
    if (!move.ok) {
      setAppError(move.reason);
      return;
    }
    if (move.noop) {
      return;
    }

    const previousWorkspace = workspace;
    const previousCurrentDocument = currentDocument;
    const previousOpenTabs = openTabs;
    const previousActiveTabId = activeTabId;
    const optimisticWorkspace = applyWorkspaceMove(workspace, move);
    const optimisticTabs = rebindOpenTabsForMove(openTabs, optimisticWorkspace, move).tabs;
    setWorkspace(optimisticWorkspace);
    setOpenTabs(optimisticTabs);
    if (activeTabId && pathMovesWithResolution(activeTabId, move)) {
      setActiveTabId(rewriteMovedPath(activeTabId, move));
    }
    setCurrentDocument(rebindCurrentDocument(currentDocument, optimisticWorkspace, move).document);

    try {
      const payload = await moveWorkspaceItem({
        sourceId,
        targetParentPath: move.targetParentPath,
        order: move.order,
      });
      const currentBinding = rebindCurrentDocument(currentDocument, payload, move);
      const tabBinding = rebindOpenTabsForMove(openTabs, payload, move);
      setWorkspace(payload);
      setOpenTabs(tabBinding.tabs);
      if (activeTabId && pathMovesWithResolution(activeTabId, move)) {
        const nextActiveTabId = rewriteMovedPath(activeTabId, move);
        setActiveTabId(tabBinding.tabs.some((tab) => tab.id === nextActiveTabId) ? nextActiveTabId : null);
      }
      setCurrentDocument(currentBinding.document);
      setAppError(currentBinding.missing || tabBinding.missing ? "移动后找不到当前文档，已关闭编辑区" : null);
    } catch (error) {
      setWorkspace(previousWorkspace);
      setOpenTabs(previousOpenTabs);
      setActiveTabId(previousActiveTabId);
      setCurrentDocument(previousCurrentDocument);
      setAppError(toMessage(error));
    }
  }, [activeTabId, currentDocument, openTabs, workspace]);

  const beginSidebarResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (sidebarCollapsed) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(clamp(startWidth + delta, 220, 440));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [sidebarCollapsed, sidebarWidth]);

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      style={{
        gridTemplateColumns: `var(--rail-width) ${sidebarCollapsed ? 0 : sidebarWidth}px 12px minmax(0, 1fr)`,
      }}
    >
      <AppRail
        activeWorkspaceRoot={workspace?.root ?? null}
        knownWorkspaces={knownWorkspaces}
        onChooseWorkspace={chooseWorkspace}
        onCreateWorkspace={createWorkspace}
        onSwitchWorkspace={switchWorkspace}
        onForgetWorkspace={forgetWorkspace}
        onCreateDocument={() => createDocument("")}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DocumentSidebar
        workspaceRoot={workspace?.root ?? null}
        directories={directories}
        documents={documents}
        order={order}
        collapsed={sidebarCollapsed}
        currentPath={currentPath}
        onOpenDocument={openDocument}
        onCreateDocument={createDocument}
        onCreateSpreadsheet={createSpreadsheet}
        onCreateMultidimensionalTable={createMultidimensionalTable}
        onCreateDirectory={createDirectory}
        onRenameWorkspace={renameCurrentWorkspace}
        onExportWorkspaceMarkdown={exportWorkspaceMarkdownZip}
        onRenameDocument={renameDocument}
        onDeleteDocument={deleteDocument}
        onRenameDirectory={renameDirectory}
        onDeleteDirectory={deleteDirectory}
        onMoveNode={moveNode}
      />
      <PaneResizer
        collapsed={sidebarCollapsed}
        label="调整目录宽度"
        onPointerDown={beginSidebarResize}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <main className="editor-workspace">
        <TopBar
          document={currentDocument?.entry ?? null}
          openTabs={visibleOpenTabs}
          activeTabId={activeTabId}
          saveStatus={saveStatus}
          onManualSave={() => setManualSaveRequest((current) => current + 1)}
          onActivateTab={activateTab}
          onToggleTabLocked={toggleTabLocked}
          onCloseTab={closeTab}
          onExportDocument={exportDocument}
          exportBusy={activeAppOperation?.kind === "document-export"}
          onImportSpreadsheetExcel={importSpreadsheetExcel}
          onExportSpreadsheetExcel={exportSpreadsheetExcel}
          spreadsheetExcelBusy={activeAppOperation?.kind === "spreadsheet-excel"}
          defaultExportResourceStrategy={ossSettings?.defaultExportResourceStrategy}
          defaultSignedUrlTtlSeconds={ossSettings?.defaultSignedUrlTtlSeconds}
          onRenameDocument={(title) => {
            if (currentDocument) {
              return renameDocumentTo(currentDocument.entry, title);
            }
          }}
        />
        {activeAppOperation ? (
          <div className="app-operation-banner" role="status" aria-live="polite">
            <Loader2 size={15} className="spin-icon" />
            <span>{activeAppOperation.label}</span>
          </div>
        ) : null}
        {appError ? <div className="app-error">{appError}</div> : null}
        {currentDocument?.kind === "spreadsheet" ? (
          <Suspense fallback={<SpreadsheetLoadingState />}>
            <SpreadsheetEditor
              ref={spreadsheetEditorRef}
              document={currentDocument.entry}
              content={currentDocument.content}
              manualSaveRequest={manualSaveRequest}
              onSave={saveSpreadsheet}
              onSaveStatusChange={setSaveStatus}
              onRegisterSaveNow={registerEditorSaveNow}
            />
          </Suspense>
        ) : currentDocument?.kind === "multidimensional-table" ? (
          <Suspense fallback={<SpreadsheetLoadingState />}>
            <MultidimensionalTableEditor
              ref={multidimensionalTableEditorRef}
              document={currentDocument.entry}
              content={currentDocument.content}
              manualSaveRequest={manualSaveRequest}
              onSave={saveMultidimensionalTable}
              onUploadImage={uploadEditorImage}
              onUploadFile={uploadEditorFile}
              onDownloadFile={downloadEditorFile}
              onPrepareResourcePreview={prepareEditorResourcePreview}
              onSaveStatusChange={setSaveStatus}
              onRegisterSaveNow={registerEditorSaveNow}
            />
          </Suspense>
        ) : (
          <LakeEditor
            document={currentDocument?.entry ?? null}
            content={currentDocument?.kind === "lake" ? currentDocument.content : ""}
            manualSaveRequest={manualSaveRequest}
            exportRequest={exportRequest}
            onSave={saveDocument}
            onExportContent={writeDocumentExport}
            onUploadImage={uploadEditorImage}
            onUploadFile={uploadEditorFile}
            onDownloadFile={downloadEditorFile}
            onPrepareResourcePreview={prepareEditorResourcePreview}
            onSaveStatusChange={setSaveStatus}
            onRegisterSaveNow={registerEditorSaveNow}
          />
        )}
      </main>
      <OssSettingsPanel
        open={settingsOpen}
        settings={ossSettings}
        databaseLocation={databaseLocation}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        onChooseDatabaseDirectory={chooseDatabaseDirectory}
        onSaveDatabaseLocation={saveDatabaseDirectory}
        backupKeyStatus={backupKeyStatus}
        resourceKeyStatus={resourceKeyStatus}
        backupRecords={backupRecords}
        backupBusy={backupBusy}
        resourceKeyBusy={resourceKeyBusy}
        activeBackupOperation={activeBackupOperation}
        onSetBackupKey={updateBackupKey}
        onSetResourceKey={updateResourceKey}
        onVerifyResourceKey={verifyResourceKey}
        onCreateBackup={runBackup}
        onRestoreBackup={runRestore}
        onDeleteBackup={runDeleteBackup}
      />
      {textDialog ? (
        <TextInputDialog dialog={textDialog} onClose={() => setTextDialog(null)} />
      ) : null}
    </div>
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatExportLabel(format: DocumentExportFormat): string {
  switch (format) {
    case "markdown":
      return "Markdown";
    case "html":
      return "HTML";
    case "pdf":
      return "PDF";
    default:
      return "文档";
  }
}

async function readDocumentState(document: WorkspaceDocument): Promise<CurrentDocumentState> {
  if (document.kind === "spreadsheet") {
    return {
      kind: "spreadsheet",
      entry: asSpreadsheetDocument(document),
      content: await readSpreadsheetDocument(document.path),
    };
  }
  if (document.kind === "multidimensional-table") {
    return {
      kind: "multidimensional-table",
      entry: asMultidimensionalTableDocument(document),
      content: await readMultidimensionalTableDocument(document.path),
    };
  }
  return {
    kind: "lake",
    entry: asLakeDocument(document),
    content: await readLakeDocument(document.path),
  };
}

function asLakeDocument(document: WorkspaceDocument): WorkspaceDocument & { kind: "lake" } {
  if (document.kind !== "lake") {
    throw new Error("当前文档不是 Lake 文档");
  }
  return document as WorkspaceDocument & { kind: "lake" };
}

function asSpreadsheetDocument(document: WorkspaceDocument): WorkspaceDocument & { kind: "spreadsheet" } {
  if (document.kind !== "spreadsheet") {
    throw new Error("当前文档不是表格文档");
  }
  return document as WorkspaceDocument & { kind: "spreadsheet" };
}

function asMultidimensionalTableDocument(document: WorkspaceDocument): WorkspaceDocument & { kind: "multidimensional-table" } {
  if (document.kind !== "multidimensional-table") {
    throw new Error("当前文档不是多维表格文档");
  }
  return document as WorkspaceDocument & { kind: "multidimensional-table" };
}

function createOpenDocumentTab(document: WorkspaceDocument): OpenDocumentTab {
  return {
    id: document.path,
    path: document.path,
    locked: false,
  };
}

async function workspaceSpreadsheetExcelEntries(workspace: WorkspacePayload): Promise<WorkspaceZipEntryInput[]> {
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);
  const entries: WorkspaceZipEntryInput[] = [];

  for (const node of flattenDocumentTree(tree)) {
    if (node.type !== "document" || node.document?.kind !== "spreadsheet") {
      continue;
    }

    // 批量导出里表格必须保持可编辑的 Excel 文件，而不是把 Univer JSON 快照写成 Markdown。
    const snapshot = parseSpreadsheetSnapshot(
      await readSpreadsheetDocument(node.document.path),
      documentTitleFromPath(node.document.path),
    );
    const file = await exportXlsxWorkbookData(snapshot);
    entries.push({
      path: spreadsheetExportZipPath(node.document.path),
      content: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return entries;
}

function spreadsheetExportZipPath(path: string): string {
  return path.split("/")
    .filter(Boolean)
    .map((part, index, parts) => {
      const filePart = index === parts.length - 1 ? part.replace(/\.json$/i, ".xlsx") : part;
      return filePart.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "未命名";
    })
    .join("/");
}

async function workspaceMultidimensionalTableEntries(workspace: WorkspacePayload): Promise<WorkspaceZipEntryInput[]> {
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);
  const entries: WorkspaceZipEntryInput[] = [];

  for (const node of flattenDocumentTree(tree)) {
    if (node.type !== "document" || node.document?.kind !== "multidimensional-table") {
      continue;
    }

    // 多维表格是 record-based JSON，首期批量导出保留原始文件，避免错误转换为 Markdown 或 Excel。
    entries.push({
      path: safeZipPath(node.document.path),
      content: await readMultidimensionalTableDocument(node.document.path),
    });
  }

  return entries;
}

function safeZipPath(path: string): string {
  return path.split("/")
    .filter(Boolean)
    .map((part) => part.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "未命名")
    .join("/");
}

function rebindCurrentDocument(
  currentDocument: CurrentDocumentState | null,
  workspace: WorkspacePayload,
  move: WorkspaceMoveResolution,
): { document: CurrentDocumentState | null; missing: boolean } {
  if (!currentDocument || !move.ok) {
    return { document: currentDocument, missing: false };
  }

  if (!pathMovesWithResolution(currentDocument.entry.path, move)) {
    const refreshedEntry = workspace.documents.find((entry) => entry.path === currentDocument.entry.path);
    return {
      document: refreshedEntry ? rebindDocumentEntry(currentDocument, refreshedEntry) : currentDocument,
      missing: false,
    };
  }

  const nextPath = rewriteMovedPath(currentDocument.entry.path, move);
  const nextEntry = workspace.documents.find((entry) => entry.path === nextPath);
  return nextEntry
    ? { document: rebindDocumentEntry(currentDocument, nextEntry), missing: false }
    : { document: null, missing: true };
}

function rebindOpenTabsForMove(
  tabs: OpenDocumentTab[],
  workspace: WorkspacePayload,
  move: WorkspaceMoveResolution,
): { tabs: OpenDocumentTab[]; missing: boolean } {
  if (!move.ok) {
    return { tabs, missing: false };
  }

  let missing = false;
  const nextTabs = tabs.flatMap((tab) => {
    const nextPath = pathMovesWithResolution(tab.path, move) ? rewriteMovedPath(tab.path, move) : tab.path;
    const nextDocument = workspace.documents.find((entry) => entry.path === nextPath);
    if (!nextDocument) {
      missing = true;
      return [];
    }
    return [{ ...tab, id: nextPath, path: nextPath }];
  });

  return { tabs: nextTabs, missing };
}

function rebindDocumentEntry(
  currentDocument: CurrentDocumentState,
  entry: WorkspaceDocument,
): CurrentDocumentState {
  if (currentDocument.kind === "spreadsheet") {
    return { ...currentDocument, entry: asSpreadsheetDocument(entry) };
  }
  if (currentDocument.kind === "multidimensional-table") {
    return { ...currentDocument, entry: asMultidimensionalTableDocument(entry) };
  }
  return { ...currentDocument, entry: asLakeDocument(entry) };
}

function documentExtension(document: WorkspaceDocument): string {
  if (document.kind === "spreadsheet") {
    return ".json";
  }
  if (document.kind === "multidimensional-table") {
    return ".dbtable.json";
  }
  return ".lake";
}

function rewriteOpenTabs(tabs: OpenDocumentTab[], fromPath: string, toPath: string): OpenDocumentTab[] {
  return tabs.map((tab) => (
    tab.path === fromPath ? { ...tab, id: toPath, path: toPath } : tab
  ));
}

function rewriteOpenTabsByPrefix(tabs: OpenDocumentTab[], fromPath: string, toPath: string): OpenDocumentTab[] {
  return tabs.map((tab) => {
    if (!isSameOrChildPath(tab.path, fromPath)) {
      return tab;
    }
    const nextPath = replacePathPrefix(tab.path, fromPath, toPath);
    return { ...tab, id: nextPath, path: nextPath };
  });
}

function replacePathPrefix(path: string, fromPath: string, toPath: string): string {
  return isSameOrChildPath(path, fromPath) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

function pathMovesWithResolution(path: string, move: WorkspaceMoveResolution): boolean {
  return move.ok && (
    isSameOrChildPath(path, move.sourcePath) ||
    Boolean(move.sourceChildContainerPath && isSameOrChildPath(path, move.sourceChildContainerPath))
  );
}

function rewriteMovedPath(path: string, move: Extract<WorkspaceMoveResolution, { ok: true }>): string {
  if (
    move.sourceChildContainerPath &&
    move.targetChildContainerPath &&
    isSameOrChildPath(path, move.sourceChildContainerPath)
  ) {
    return replacePathPrefix(path, move.sourceChildContainerPath, move.targetChildContainerPath);
  }
  return replacePathPrefix(path, move.sourcePath, move.targetPath);
}

function isSameOrChildPath(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

function PaneResizer({
  collapsed,
  label,
  onPointerDown,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  label: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <div
      className={`pane-resizer${collapsed ? " is-collapsed" : ""}`}
    >
      <div
        className="pane-resizer__drag-surface"
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        tabIndex={collapsed ? -1 : 0}
        onPointerDown={onPointerDown}
      />
      <button
        type="button"
        className="pane-resizer__toggle"
        title={collapsed ? "展开目录侧栏 (⌘+Option+,)" : "收起目录侧栏 (⌘+Option+,)"}
        aria-label={collapsed ? "展开目录侧栏" : "收起目录侧栏"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapsed();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function safeName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "未命名";
}

function TextInputDialog({
  dialog,
  onClose,
}: {
  dialog: TextDialogState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValue(dialog.initialValue);
  }, [dialog]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = value.trim();
    if (!nextValue || submitting) {
      return;
    }

    setSubmitting(true);
    await dialog.onSubmit(nextValue);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="text-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="text-dialog"
        aria-label={dialog.title}
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{dialog.title}</h2>
        <label>
          <span>{dialog.label}</span>
          <input
            value={value}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
        </label>
        <div className="text-dialog__actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={!value.trim() || submitting}>
            {dialog.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function SpreadsheetLoadingState() {
  return (
    <div className="spreadsheet-editor-root">
      <div className="spreadsheet-editor-state" role="status">
        <Loader2 size={18} className="spin-icon" />
        <span>正在加载表格编辑器</span>
      </div>
    </div>
  );
}
