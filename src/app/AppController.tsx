import type { FormEvent, PointerEvent } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { TopBar } from "../components/TopBar";
import { AiDocumentAssistant } from "../features/ai/AiDocumentAssistant";
import { AiDocumentPatchDiff } from "../features/ai/AiDocumentPatchDiff";
import { AiSpreadsheetAssistant, AiTableAssistant } from "../features/ai/AiTableAssistant";
import { previewAiDocumentPatch, type AiDocumentPatchPreview } from "../features/ai/documentPatch";
import { applyAiSpreadsheetPatch } from "../features/ai/spreadsheetAi";
import { prepareAiMarkdownForLakeImport } from "../features/lake-editor/lakeAiImport";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import type { LakeSelectionCapability } from "../features/lake-editor/lakeSelectionAdapter";
import type { MultidimensionalTableEditorHandle } from "../features/multidimensional-table/MultidimensionalTableEditor";
import type { MultidimensionalTableDocument } from "../features/multidimensional-table/multidimensionalTableDocument";
import { serializeMultidimensionalTableDocument } from "../features/multidimensional-table/multidimensionalTableDocument";
import type { SpreadsheetEditorHandle } from "../features/spreadsheet/SpreadsheetEditor";
import {
  analyzeLakeDocumentExportResources,
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
import type { SpreadsheetWorkbookData } from "../features/spreadsheet/spreadsheetDocument";
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
  documentChildContainerPath,
  documentTitleFromPath,
  flattenDocumentTree,
  resolveWorkspaceMove,
} from "../features/workspace/workspaceStore";
import {
  addAiModelToProfile,
  chooseWorkspaceDirectory,
  analyzeResourceMigration,
  chooseExcelImportFile,
  chooseDatabaseDirectory,
  chooseStorageDirectory,
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
  getAiSettings,
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
  saveAiSettings,
  saveOssSettings,
  saveBinaryExport,
  saveDatabaseLocation,
  savePdfExport,
  saveTextExport,
  resetBackupKey,
  resetResourceKey,
  restoreBackup,
  runResourceMigration,
  runAiDocumentAction,
  runAiSplitDocument,
  runAiSpreadsheetAction,
  runAiTableAction,
  setBackupKey,
  setActiveAiModel,
  setResourceKey,
  setWorkspaceRoot,
  testStorageConnection,
  uploadFile,
  uploadImage,
  verifyBackupKeyStatus,
  verifyResourceKeyStatus,
  writeLakeDocument,
  writeMultidimensionalTableDocument,
  writeSpreadsheetDocument,
  listAiModels,
} from "../lib/tauri";
import type {
  AiFetchedModel,
  AiDocumentPatch,
  AiDocumentContentScope,
  AiRunDocumentActionOutput,
  AiRunSpreadsheetActionOutput,
  AiDocumentActionType,
  AiRunTableActionOutput,
  AiSplitDocumentOutput,
  AiTableActionType,
  AiTablePatch,
  AiSpreadsheetActionType,
  AiSpreadsheetPatch,
  AiModelCapabilityType,
  DocumentOpenMode,
  AiSettings,
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
  SaveAiSettingsInput,
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

interface EditorScrollSnapshot {
  top: number;
  left: number;
}

const selectionActionTypes = new Set<AiDocumentActionType>([
  "rewrite",
  "polish",
  "expand",
  "compress",
  "organize-headings",
  "outline-to-draft",
  "notes-to-article",
  "tech-to-tutorial",
  "tech-to-readme",
  "tech-to-release-notes",
  "custom-edit",
]);

function previewCurrentAiDocumentPatch(
  content: string,
  patch: AiDocumentPatch | undefined,
  contentScope: AiDocumentContentScope,
): AiDocumentPatchPreview | null {
  return patch ? previewAiDocumentPatch(content, patch, contentScope) : null;
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
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiResult, setAiResult] = useState<AiRunDocumentActionOutput | null>(null);
  const [aiSplitResult, setAiSplitResult] = useState<AiSplitDocumentOutput | null>(null);
  const [aiTableResult, setAiTableResult] = useState<AiRunTableActionOutput | null>(null);
  const [aiSpreadsheetResult, setAiSpreadsheetResult] = useState<AiRunSpreadsheetActionOutput | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiContentScope, setAiContentScope] = useState<AiDocumentContentScope>("document");
  const [aiAutoApply, setAiAutoApply] = useState(false);
  const [aiPatchPreview, setAiPatchPreview] = useState<AiDocumentPatchPreview | null>(null);
  const [aiPreviewRequest, setAiPreviewRequest] = useState<{ id: number; content: string; contentType: "text/markdown" | "text/html" } | null>(null);
  const [aiTablePatchRequest, setAiTablePatchRequest] = useState<{ id: number; patch: AiTablePatch } | null>(null);
  const [aiSpreadsheetSnapshotRequest, setAiSpreadsheetSnapshotRequest] = useState<{ id: number; workbook: SpreadsheetWorkbookData } | null>(null);
  const [lakeSelectionCapability, setLakeSelectionCapability] = useState<LakeSelectionCapability>({
    canReadSelection: false,
    canReplaceSelection: false,
  });
  const [ossSettings, setOssSettings] = useState<OssSettings | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>({ profiles: [] });
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
  const editorWorkspaceRef = useRef<HTMLElement | null>(null);
  const tabScrollSnapshotsRef = useRef(new Map<string, EditorScrollSnapshot>());
  const saveCurrentEditorNowRef = useRef<(() => Promise<void>) | null>(null);
  const readCurrentLakeContentRef = useRef<(() => string) | null>(null);
  const readCurrentLakeSelectionRef = useRef<(() => string | null) | null>(null);
  const replaceCurrentLakeSelectionRef = useRef<((content: string) => boolean) | null>(null);
  const readCurrentTableDocumentRef = useRef<(() => MultidimensionalTableDocument) | null>(null);
  const readCurrentSpreadsheetWorkbookRef = useRef<(() => SpreadsheetWorkbookData | null) | null>(null);
  const spreadsheetEditorRef = useRef<SpreadsheetEditorHandle | null>(null);
  const multidimensionalTableEditorRef = useRef<MultidimensionalTableEditorHandle | null>(null);

  useEffect(() => {
    setAiAssistantOpen(false);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    setAiPatchPreview(null);
    setAiError(null);
    setAiContentScope("document");
  }, [currentDocument?.entry.path]);

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
      const [recentWorkspace, knownWorkspaceList, settings, aiModelSettings, keyStatus, resourceStatus, database] = await Promise.all([
        getRecentWorkspace(),
        listKnownWorkspaces(),
        getOssSettings(),
        getAiSettings(),
        getBackupKeyStatus(),
        getResourceKeyStatus(),
        getDatabaseLocation(),
      ]);
      setWorkspace(recentWorkspace);
      setKnownWorkspaces(knownWorkspaceList);
      setOssSettings(settings);
      setAiSettings(aiModelSettings);
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
      setCurrentDocument(await readDocumentState(
        currentDocument.entry,
        currentDocument.kind === "lake" ? currentDocument.mode ?? "edit" : "edit",
        currentDocument.workspaceRoot,
        workspace?.root ?? null,
      ));
      setSaveStatus(emptySaveStatus);
    } catch {
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
    }
  }, [currentDocument, workspace?.root]);

  const registerEditorSaveNow = useCallback((saveNow: (() => Promise<void>) | null) => {
    saveCurrentEditorNowRef.current = saveNow;
  }, []);
  const registerLakeReadContent = useCallback((readContent: (() => string) | null) => {
    readCurrentLakeContentRef.current = readContent;
  }, []);
  const registerLakeReadSelection = useCallback((readSelection: (() => string | null) | null) => {
    readCurrentLakeSelectionRef.current = readSelection;
  }, []);
  const registerLakeReplaceSelection = useCallback((replaceSelection: ((content: string) => boolean) | null) => {
    replaceCurrentLakeSelectionRef.current = replaceSelection;
  }, []);
  const registerTableReadDocument = useCallback((readTable: (() => MultidimensionalTableDocument) | null) => {
    readCurrentTableDocumentRef.current = readTable;
  }, []);
  const registerSpreadsheetReadWorkbook = useCallback((readWorkbook: (() => SpreadsheetWorkbookData | null) | null) => {
    readCurrentSpreadsheetWorkbookRef.current = readWorkbook;
  }, []);

  const clearOpenDocumentTabs = useCallback((options: { preserveLocked?: boolean } = {}) => {
    const nextTabs = options.preserveLocked ? openTabs.filter((tab) => tab.locked) : [];
    const preservedTabIds = new Set(nextTabs.map((tab) => tab.id));
    for (const tabId of Array.from(tabScrollSnapshotsRef.current.keys())) {
      if (!preservedTabIds.has(tabId)) {
        tabScrollSnapshotsRef.current.delete(tabId);
      }
    }
    setOpenTabs(nextTabs);
    setActiveTabId(null);
    setCurrentDocument(null);
    setSaveStatus(emptySaveStatus);
    setAiAssistantOpen(false);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    setAiPatchPreview(null);
    setAiError(null);
  }, [openTabs]);

  const saveBeforeLeavingCurrentTab = useCallback(async (errorMessage: string): Promise<boolean> => {
    if (saveStatus.state === "error") {
      setAppError(errorMessage);
      return false;
    }

    try {
      saveTabScrollSnapshot(tabScrollSnapshotsRef.current, editorWorkspaceRef.current, activeTabId);
      await saveCurrentEditorNowRef.current?.();
      return true;
    } catch (error) {
      setAppError(toMessage(error));
      return false;
    }
  }, [activeTabId, saveStatus.state]);

  useEffect(() => {
    if (!currentDocument) {
      return;
    }

    // 编辑器由第三方运行时挂载，切换页签后需要等内部滚动容器出现再恢复位置。
    return scheduleTabScrollRestore(() => {
      if (activeTabId) {
        restoreTabScrollSnapshot(tabScrollSnapshotsRef.current, editorWorkspaceRef.current, activeTabId);
      }
    });
  }, [activeTabId, currentDocument?.entry.path]);

  const activateDocumentTab = useCallback(async (
    tabId: string,
    candidateTabs: OpenDocumentTab[] = openTabs,
    candidateWorkspace: WorkspacePayload | null = workspace,
  ) => {
    const tab = candidateTabs.find((entry) => entry.id === tabId);
    const visibleWorkspaceRoot = candidateWorkspace?.root ?? workspace?.root ?? null;
    const targetWorkspaceRoot = tabWorkspaceRoot(tab, candidateWorkspace?.root ?? visibleWorkspaceRoot);
    const nextDocument = tab
      ? await resolveTabDocument(tab, candidateWorkspace, visibleWorkspaceRoot, targetWorkspaceRoot)
      : null;
    if (!tab || !nextDocument) {
      setOpenTabs(candidateTabs.filter((entry) => entry.id !== tabId));
      setActiveTabId(null);
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
      setAppError("找不到当前文档，已关闭编辑区");
      return;
    }

    setActiveTabId(tab.id);
    setCurrentDocument(await readDocumentState(nextDocument, tab.mode, targetWorkspaceRoot ?? undefined, visibleWorkspaceRoot));
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

  const setCurrentLakeDocumentMode = useCallback(async (mode: DocumentOpenMode): Promise<boolean> => {
    if (!currentDocument || currentDocument.kind !== "lake") {
      return false;
    }
    if ((currentDocument.mode ?? "edit") === mode) {
      return true;
    }

    let nextContent = currentDocument.content;
    try {
      if ((currentDocument.mode ?? "edit") === "edit" && mode === "read") {
        // 切到阅读模式前先保存，再读回 Lake 原始内容，避免把 AI 使用的 Markdown 快照传给 viewer。
        await saveCurrentEditorNowRef.current?.();
        nextContent = await withWorkspaceRoot(currentDocument.workspaceRoot, workspace?.root ?? null, () => (
          readLakeDocument(currentDocument.entry.path)
        ));
      }
      setCurrentDocument((current) => (
        current?.kind === "lake" && isSameCurrentDocument(current, currentDocument)
          ? { ...current, content: nextContent, mode }
          : current
      ));
      setOpenTabs((tabs) => tabs.map((tab) => (
        tab.id === activeTabId ? { ...tab, mode } : tab
      )));
      if (mode === "read") {
        setAiAssistantOpen(false);
        setAiPatchPreview(null);
      }
      setSaveStatus(mode === "read" ? emptySaveStatus : { state: "clean" });
      setAppError(null);
      return true;
    } catch (error) {
      setAppError(toMessage(error));
      return false;
    }
  }, [activeTabId, currentDocument, workspace?.root]);

  const openDocumentInTabs = useCallback(async (
    document: WorkspaceDocument,
    candidateWorkspace: WorkspacePayload | null = workspace,
    options: { skipSaveBeforeSwitch?: boolean; mode?: DocumentOpenMode } = {},
  ) => {
    const requestedMode = document.kind === "lake" ? options.mode ?? "edit" : undefined;
    const workspaceRoot = candidateWorkspace?.root ?? workspace?.root ?? null;
    const existingTab = openTabs.find((tab) => tabMatchesWorkspacePath(tab, document.path, workspaceRoot));
    if (existingTab?.id === activeTabId) {
      const existingMode = currentDocument?.kind === "lake" ? currentDocument.mode ?? existingTab.mode ?? "edit" : existingTab.mode;
      if (requestedMode && existingMode !== requestedMode) {
        if (!await setCurrentLakeDocumentMode(requestedMode)) {
          return;
        }
      }
      setAppError(null);
      return;
    }

    if (!options.skipSaveBeforeSwitch && !await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再切换")) {
      return;
    }

    try {
      if (existingTab) {
        const nextTabs = requestedMode
          ? openTabs.map((tab) => (tab.id === existingTab.id ? { ...tab, mode: requestedMode } : tab))
          : openTabs;
        if (requestedMode) {
          setOpenTabs(nextTabs);
        }
        await activateDocumentTab(existingTab.id, nextTabs, candidateWorkspace);
        return;
      }

      const activeTab = openTabs.find((tab) => tab.id === activeTabId);
      const nextTab = createOpenDocumentTab(document, requestedMode, workspaceRoot);
      const nextTabs = activeTab && !activeTab.locked
        ? openTabs.map((tab) => (tab.id === activeTab.id ? nextTab : tab))
        : [...openTabs, nextTab];

      if (activeTab && !activeTab.locked && activeTab.path !== nextTab.path) {
        deleteTabScrollSnapshot(tabScrollSnapshotsRef.current, activeTab.id);
      }
      setOpenTabs(nextTabs);
      await activateDocumentTab(nextTab.id, nextTabs, candidateWorkspace);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [activateDocumentTab, activeTabId, currentDocument, openTabs, saveBeforeLeavingCurrentTab, setCurrentLakeDocumentMode, workspace]);

  const toggleTabLocked = useCallback((tabId: string) => {
    setOpenTabs((tabs) => tabs.map((tab) => (
      tab.id === tabId ? { ...tab, locked: !tab.locked } : tab
    )));
  }, []);

  const reorderOpenTabs = useCallback((orderedTabIds: string[]) => {
    setOpenTabs((tabs) => reorderTabsByIds(tabs, orderedTabIds));
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
      deleteTabScrollSnapshot(tabScrollSnapshotsRef.current, closingTab.id);
      setOpenTabs(openTabs.filter((tab) => tab.id !== tabId));
      return;
    }

    if (!await saveBeforeLeavingCurrentTab("当前文档保存失败，请先处理后再关闭标签")) {
      return;
    }

    try {
      const nextTabs = openTabs.filter((tab) => tab.id !== tabId);
      deleteTabScrollSnapshot(tabScrollSnapshotsRef.current, closingTab.id);
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
      clearOpenDocumentTabs({ preserveLocked: true });
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
          clearOpenDocumentTabs({ preserveLocked: true });
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
      clearOpenDocumentTabs({ preserveLocked: true });
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
      const nextTabs = rewriteOpenTabs(openTabs, document.path, nextPath, payload.root);
      setOpenTabs(nextTabs);
      const nextActiveTabId = rewriteTabIdIfPathMatches(activeTabId, document.path, nextPath, payload.root);
      if (nextActiveTabId !== activeTabId) {
        setActiveTabId(nextActiveTabId);
      }
      if (activeTabId && tabIdMatchesWorkspacePath(activeTabId, document.path, payload.root)) {
        await activateDocumentTab(nextActiveTabId ?? createTabId(payload.root, nextPath), nextTabs, payload);
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
      const nextTabs = openTabs.filter((tab) => !tabMatchesWorkspacePath(tab, document.path, payload.root));
      deleteTabScrollSnapshotsForTabs(tabScrollSnapshotsRef.current, openTabs, nextTabs);
      setOpenTabs(nextTabs);
      if (activeTabId && tabIdMatchesWorkspacePath(activeTabId, document.path, payload.root)) {
        const deletedIndex = openTabs.findIndex((tab) => tabMatchesWorkspacePath(tab, document.path, payload.root));
        const nextTab = nextTabs[deletedIndex] ?? nextTabs[deletedIndex - 1] ?? null;
        if (nextTab) {
          await activateDocumentTab(nextTab.id, nextTabs, payload);
        } else {
          setActiveTabId(null);
          setCurrentDocument(null);
          setSaveStatus(emptySaveStatus);
        }
      } else if (activeTabId && !nextTabs.some((tab) => tab.id === activeTabId)) {
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
          const nextTabs = rewriteOpenTabsByPrefix(openTabs, directory.path, nextPrefix, payload.root);
          setOpenTabs(nextTabs);
          const nextActiveTabId = rewriteTabIdByPrefix(activeTabId, directory.path, nextPrefix, payload.root);
          if (nextActiveTabId !== activeTabId) {
            setActiveTabId(nextActiveTabId);
          }
          const currentDocumentPath = currentDocument?.entry.path;
          if (activeTabId && currentDocumentPath && tabIdInWorkspacePathPrefix(activeTabId, directory.path, payload.root)) {
            const nextPath = currentDocumentPath.replace(directory.path, nextPrefix);
            await activateDocumentTab(nextActiveTabId ?? createTabId(payload.root, nextPath), nextTabs, payload);
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
      const nextTabs = openTabs.filter((tab) => !tabInWorkspacePathPrefix(tab, directory.path, payload.root));
      deleteTabScrollSnapshotsForTabs(tabScrollSnapshotsRef.current, openTabs, nextTabs);
      setOpenTabs(nextTabs);
      if (activeTabId && tabIdInWorkspacePathPrefix(activeTabId, directory.path, payload.root)) {
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
    await openDocumentInTabs(document, workspace, { mode: "edit" });
  }, [openDocumentInTabs, workspace]);

  const openDocumentReadOnly = useCallback(async (document: WorkspaceDocument) => {
    await openDocumentInTabs(document, workspace, { mode: "read" });
  }, [openDocumentInTabs, workspace]);

  const saveDocument = useCallback(async (relativePath: string, content: string) => {
    await withWorkspaceRoot(currentDocument?.workspaceRoot, workspace?.root ?? null, () => (
      writeLakeDocument(relativePath, content)
    ));
  }, [currentDocument?.workspaceRoot, workspace?.root]);

  const saveSpreadsheet = useCallback(async (relativePath: string, content: string) => {
    await withWorkspaceRoot(currentDocument?.workspaceRoot, workspace?.root ?? null, () => (
      writeSpreadsheetDocument(relativePath, content)
    ));
  }, [currentDocument?.workspaceRoot, workspace?.root]);

  const saveMultidimensionalTable = useCallback(async (relativePath: string, content: string) => {
    await withWorkspaceRoot(currentDocument?.workspaceRoot, workspace?.root ?? null, () => (
      writeMultidimensionalTableDocument(relativePath, content)
    ));
  }, [currentDocument?.workspaceRoot, workspace?.root]);

  const createResourceExportOptions = useCallback((
    resourceStrategy?: LakeDocumentExportRequest["resourceStrategy"],
    signedUrlTtlSeconds?: number,
  ): LakeDocumentResourceExportOptions => {
    const requestedStrategy = resourceStrategy ?? ossSettings?.defaultExportResourceStrategy ?? "bundle";
    const strategy = ossSettings?.activeProvider === "s3" ? requestedStrategy : "bundle";

    return {
      strategy,
      signedUrlTtlSeconds: signedUrlTtlSeconds ?? ossSettings?.defaultSignedUrlTtlSeconds ?? 24 * 60 * 60,
      bucket: ossSettings?.bucket,
      publicBaseUrl: ossSettings?.publicBaseUrl,
      imagePrefix: ossSettings?.imagePrefix,
      filePrefix: ossSettings?.filePrefix,
      signResource: (resourceRef, filename, ttlSeconds) => createTemporaryResourceUrl(resourceRef, ttlSeconds, filename),
      loadResource: readResourceBytes,
    };
  }, [
    ossSettings?.activeProvider,
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
      setCurrentDocument((current) => current?.kind === "spreadsheet" && isSameCurrentDocument(current, currentDocument)
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
    const exportResourceUsage = analyzeLakeDocumentExportResources(content, request.format, exportOptions);
    const needsResourceBundle = request.resourceStrategy === "bundle" && exportResourceUsage.hasFileResources;
    setActiveAppOperation({ kind: "document-export", label: `正在导出 ${formatExportLabel(request.format)}` });
    try {
      if (request.format === "markdown") {
        if (needsResourceBundle) {
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
        if (needsResourceBundle) {
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
      // 导出请求是一次性指令，完成后清空，避免切换标签时新编辑器实例重复消费旧请求。
      setExportRequest((current) => (current?.id === request.id ? null : current));
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

  const saveModelSettings = useCallback(async (input: SaveAiSettingsInput): Promise<AiSettings> => {
    const saved = await saveAiSettings(input);
    setAiSettings(saved);
    return saved;
  }, []);

  const fetchAiModels = useCallback(async (profileId: string): Promise<AiFetchedModel[]> => {
    const output = await listAiModels({ profileId });
    return output.models;
  }, []);

  const addModelToProfile = useCallback(async (
    profileId: string,
    model: AiFetchedModel,
    capabilityTypes: AiModelCapabilityType[],
  ): Promise<AiSettings> => {
    const saved = await addAiModelToProfile({
      profileId,
      modelId: model.modelId,
      displayName: model.displayName,
      capabilityTypes,
    });
    setAiSettings(saved);
    return saved;
  }, []);

  const activateAiModel = useCallback(async (configuredModelId: string): Promise<AiSettings> => {
    const saved = await setActiveAiModel({ configuredModelId });
    setAiSettings(saved);
    return saved;
  }, []);

  const openAiAssistant = useCallback(() => {
    setAiAssistantOpen(true);
    setAiError(null);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    setAiPatchPreview(null);
    const selectedContent = readCurrentLakeSelectionRef.current?.();
    setAiContentScope(selectedContent?.trim() ? "selection" : "document");
  }, []);

  const applyAiDocumentPatchResult = useCallback((
    patch: AiDocumentPatch | undefined,
    patchedContent: string,
    contentScope: AiDocumentContentScope,
  ) => {
    if (!patch) {
      setAiError("AI 没有返回可应用的文档修改");
      return false;
    }

    if (contentScope === "selection") {
      const replaced = replaceCurrentLakeSelectionRef.current?.(patchedContent) ?? false;
      if (!replaced) {
        setAiError("当前 Lake 运行时未暴露稳定选区替换 API，无法直接替换选中区域");
        return false;
      }
      setAiPatchPreview(null);
      setAiAssistantOpen(false);
      return true;
    }

    const preparedContent = prepareAiMarkdownForLakeImport(patchedContent);
    // 文档级 patch 先在 Markdown 层定位，再交给 Lake 导入链路写回；表格类内容用 HTML 导入避免被识别成代码块。
    setAiPreviewRequest({ id: Date.now(), content: preparedContent.content, contentType: preparedContent.type });
    setAiPatchPreview(null);
    setAiAssistantOpen(false);
    return true;
  }, []);

  const runCurrentDocumentAiAction = useCallback(async (
    actionType: AiDocumentActionType,
    instruction: string,
  ) => {
    if (currentDocument?.kind !== "lake") {
      setAiError("请先打开 .lake 文档");
      return;
    }
    const shouldUseSelection = aiContentScope === "selection" && selectionActionTypes.has(actionType);
    const selectedContent = shouldUseSelection ? readCurrentLakeSelectionRef.current?.() ?? null : null;
    if (shouldUseSelection && !selectedContent?.trim()) {
      setAiError(lakeSelectionCapability.canReadSelection
        ? "请先在当前文档中选中一段区域"
        : "当前 Lake 运行时未暴露稳定选区读取 API");
      return;
    }
    const contentScope: AiDocumentContentScope = shouldUseSelection ? "selection" : "document";
    const content = selectedContent ?? readCurrentLakeContentRef.current?.() ?? currentDocument.content;
    setAiRunning(true);
    setAiError(null);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    setAiPatchPreview(null);
    try {
      if (actionType === "split-document") {
        setAiSplitResult(await runAiSplitDocument({
          documentTitle: documentTitleFromPath(currentDocument.entry.path),
          content,
          instruction,
        }));
      } else {
        const result = await runAiDocumentAction({
          actionType,
          documentTitle: documentTitleFromPath(currentDocument.entry.path),
          content,
          instruction,
          contentScope,
        });
        const patchPreview = previewCurrentAiDocumentPatch(content, result.patch, contentScope);
        setAiResult(result);
        setAiPatchPreview(patchPreview);
        if (aiAutoApply && result.previewMode === "patch" && patchPreview && !patchPreview.errors.length) {
          applyAiDocumentPatchResult(result.patch, patchPreview.after, contentScope);
        }
      }
    } catch (error) {
      setAiError(toMessage(error));
    } finally {
      setAiRunning(false);
    }
  }, [aiAutoApply, aiContentScope, applyAiDocumentPatchResult, currentDocument, lakeSelectionCapability.canReadSelection]);

  const applyAiResultToCurrentDocument = useCallback(() => {
    if (!aiResult) {
      return;
    }
    if (aiResult.previewMode === "patch") {
      if (!aiPatchPreview) {
        setAiError("AI 修改预览不存在，无法应用");
        return;
      }
      if (aiPatchPreview.errors.length) {
        setAiError(aiPatchPreview.errors.join("；"));
        return;
      }
      applyAiDocumentPatchResult(aiResult.patch, aiPatchPreview.after, aiResult.contentScope ?? "document");
      return;
    }
    if (aiResult.previewMode !== "replace-document") {
      return;
    }
    if (aiResult.contentScope === "selection") {
      const replaced = replaceCurrentLakeSelectionRef.current?.(aiResult.content) ?? false;
      if (!replaced) {
        setAiError("当前 Lake 运行时未暴露稳定选区替换 API，无法直接替换选中区域");
        return;
      }
      setAiAssistantOpen(false);
      return;
    }
    // AI 生成内容先进入编辑器预览和自动保存链路，表格内容转为 HTML 导入以保留 Lake 表格结构。
    const preparedContent = prepareAiMarkdownForLakeImport(aiResult.content);
    setAiPreviewRequest({ id: Date.now(), content: preparedContent.content, contentType: preparedContent.type });
    setAiAssistantOpen(false);
  }, [aiPatchPreview, aiResult, applyAiDocumentPatchResult]);

  const confirmSplitCurrentDocument = useCallback(async () => {
    if (!aiSplitResult || currentDocument?.kind !== "lake") {
      return;
    }

    setAiRunning(true);
    setAiError(null);
    try {
      await saveCurrentEditorNowRef.current?.();
      const parentPath = documentChildContainerPath(currentDocument.entry.path);
      let latestWorkspace: WorkspacePayload | null = workspace;
      let firstCreatedDocument: WorkspaceDocument | null = null;
      for (const part of aiSplitResult.parts) {
        const payload = await createLakeDocument(part.title, parentPath);
        latestWorkspace = {
          root: payload.root,
          directories: payload.directories,
          documents: payload.documents,
          order: payload.order,
        };
        firstCreatedDocument ??= payload.createdDocument;
        await writeLakeDocument(payload.createdDocument.path, part.content);
      }
      if (latestWorkspace) {
        setWorkspace(latestWorkspace);
      }
      if (firstCreatedDocument && latestWorkspace) {
        await openDocumentInTabs(firstCreatedDocument, latestWorkspace, { skipSaveBeforeSwitch: true });
      }
      setAiAssistantOpen(false);
      setAiSplitResult(null);
    } catch (error) {
      setAiError(toMessage(error));
    } finally {
      setAiRunning(false);
    }
  }, [aiSplitResult, currentDocument, openDocumentInTabs, workspace]);

  const runCurrentTableAiAction = useCallback(async (
    actionType: AiTableActionType,
    instruction: string,
  ) => {
    if (currentDocument?.kind !== "multidimensional-table") {
      setAiError("请先打开多维表格");
      return;
    }
    const tableDocument = readCurrentTableDocumentRef.current?.();
    const tableJson = tableDocument
      ? serializeMultidimensionalTableDocument(tableDocument)
      : currentDocument.content;
    setAiRunning(true);
    setAiError(null);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    try {
      setAiTableResult(await runAiTableAction({
        actionType,
        tableTitle: documentTitleFromPath(currentDocument.entry.path),
        tableJson,
        instruction,
      }));
    } catch (error) {
      setAiError(toMessage(error));
    } finally {
      setAiRunning(false);
    }
  }, [currentDocument]);

  const runCurrentSpreadsheetAiAction = useCallback(async (
    actionType: AiSpreadsheetActionType,
    instruction: string,
  ) => {
    if (currentDocument?.kind !== "spreadsheet") {
      setAiError("请先打开 Univer 表格");
      return;
    }
    const workbook = readCurrentSpreadsheetWorkbookRef.current?.() ?? parseSpreadsheetSnapshot(currentDocument.content, documentTitleFromPath(currentDocument.entry.path));
    const workbookJson = JSON.stringify(workbook, null, 2);
    setAiRunning(true);
    setAiError(null);
    setAiResult(null);
    setAiSplitResult(null);
    setAiTableResult(null);
    setAiSpreadsheetResult(null);
    try {
      setAiSpreadsheetResult(await runAiSpreadsheetAction({
        actionType,
        spreadsheetTitle: documentTitleFromPath(currentDocument.entry.path),
        workbookJson,
        instruction,
      }));
    } catch (error) {
      setAiError(toMessage(error));
    } finally {
      setAiRunning(false);
    }
  }, [currentDocument]);

  const applyAiSpreadsheetPatchToCurrentSpreadsheet = useCallback((patch: AiSpreadsheetPatch) => {
    if (currentDocument?.kind !== "spreadsheet") {
      return;
    }
    const workbook = readCurrentSpreadsheetWorkbookRef.current?.() ?? parseSpreadsheetSnapshot(currentDocument.content, documentTitleFromPath(currentDocument.entry.path));
    setAiSpreadsheetSnapshotRequest({
      id: Date.now(),
      workbook: applyAiSpreadsheetPatch(workbook, patch),
    });
    setAiAssistantOpen(false);
  }, [currentDocument]);

  const applyAiTablePatchToCurrentTable = useCallback((patch: AiTablePatch) => {
    if (currentDocument?.kind !== "multidimensional-table") {
      return;
    }
    setAiTablePatchRequest({ id: Date.now(), patch });
    setAiAssistantOpen(false);
  }, [currentDocument?.kind]);

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
      // 用户主动点击时才做密钥完整性检查，避免应用启动或普通浏览文档时触发不必要状态刷新。
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
      throw new Error("请先配置文件存储");
    }
    if (ossSettings.activeProvider !== "local" && !resourceKeyStatus.configured) {
      setSettingsOpen(true);
      throw new Error(resourceKeyStatus.needsKey ? "本机缺少资源加密密钥" : "请先设置资源加密密钥");
    }
    beginUploadOperation("image-upload", ossSettings.activeProvider === "local" ? "正在上传图片" : "正在上传并加密图片");
    try {
      return await uploadImage(input);
    } finally {
      endUploadOperation();
    }
  }, [beginUploadOperation, endUploadOperation, ossSettings, resourceKeyStatus.configured, resourceKeyStatus.needsKey]);

  const uploadEditorFile = useCallback(async (input: UploadImageInput): Promise<UploadImageOutput> => {
    if (!ossSettings) {
      setSettingsOpen(true);
      throw new Error("请先配置文件存储");
    }
    if (ossSettings.activeProvider !== "local" && !resourceKeyStatus.configured) {
      setSettingsOpen(true);
      throw new Error(resourceKeyStatus.needsKey ? "本机缺少资源加密密钥" : "请先设置资源加密密钥");
    }
    beginUploadOperation("file-upload", ossSettings.activeProvider === "local" ? "正在上传附件" : "正在上传并加密附件");
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
    const document = tab.document ?? documents.find((entry) => tabMatchesWorkspacePath(tab, entry.path, workspace?.root ?? null));
    return document ? [{ ...tab, document }] : [];
  }), [documents, openTabs, workspace?.root]);

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
    const optimisticActiveTabId = rebindActiveTabIdForMove(activeTabId, optimisticWorkspace.root, move, optimisticTabs);
    const previousScrollSnapshots = new Map(tabScrollSnapshotsRef.current);
    setWorkspace(optimisticWorkspace);
    setOpenTabs(optimisticTabs);
    if (optimisticActiveTabId !== activeTabId) {
      setActiveTabId(optimisticActiveTabId);
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
      tabScrollSnapshotsRef.current = previousScrollSnapshots;
      const nextActiveTabId = rebindActiveTabIdForMove(activeTabId, payload.root, move, tabBinding.tabs);
      setWorkspace(payload);
      setOpenTabs(tabBinding.tabs);
      if (nextActiveTabId !== activeTabId) {
        setActiveTabId(nextActiveTabId);
      }
      setCurrentDocument(currentBinding.document);
      setAppError(currentBinding.missing || tabBinding.missing ? "移动后找不到当前文档，已关闭编辑区" : null);
    } catch (error) {
      setWorkspace(previousWorkspace);
      setOpenTabs(previousOpenTabs);
      setActiveTabId(previousActiveTabId);
      setCurrentDocument(previousCurrentDocument);
      tabScrollSnapshotsRef.current = previousScrollSnapshots;
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

  const aiDocumentAssistantVisible = Boolean(aiAssistantOpen && currentDocument?.kind === "lake");

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${aiDocumentAssistantVisible ? " is-ai-assistant-open" : ""}`}
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
        onOpenDocumentReadOnly={openDocumentReadOnly}
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
      <main ref={editorWorkspaceRef} className="editor-workspace">
        <TopBar
          document={currentDocument?.entry ?? null}
          openTabs={visibleOpenTabs}
          activeTabId={activeTabId}
          documentMode={currentDocument?.kind === "lake" ? currentDocument.mode ?? "edit" : "edit"}
          saveStatus={saveStatus}
          onManualSave={() => setManualSaveRequest((current) => current + 1)}
          onOpenAiAssistant={openAiAssistant}
          onSetDocumentMode={(mode) => {
            void setCurrentLakeDocumentMode(mode);
          }}
          onActivateTab={activateTab}
          onReorderTabs={reorderOpenTabs}
          onToggleTabLocked={toggleTabLocked}
          onCloseTab={closeTab}
          onExportDocument={exportDocument}
          exportBusy={activeAppOperation?.kind === "document-export"}
          onImportSpreadsheetExcel={importSpreadsheetExcel}
          onExportSpreadsheetExcel={exportSpreadsheetExcel}
          spreadsheetExcelBusy={activeAppOperation?.kind === "spreadsheet-excel"}
          defaultExportResourceStrategy={ossSettings?.defaultExportResourceStrategy}
          defaultSignedUrlTtlSeconds={ossSettings?.defaultSignedUrlTtlSeconds}
          signedUrlExportEnabled={ossSettings?.activeProvider === "s3"}
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
              onRegisterReadWorkbook={registerSpreadsheetReadWorkbook}
              aiWorkbookSnapshot={aiSpreadsheetSnapshotRequest?.workbook ?? null}
              aiWorkbookSnapshotRequestId={aiSpreadsheetSnapshotRequest?.id}
              onAiWorkbookSnapshotApplied={() => setAiSpreadsheetSnapshotRequest(null)}
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
              resourcePreviewConcurrency={ossSettings?.resourcePreviewConcurrency}
              onSaveStatusChange={setSaveStatus}
              onRegisterSaveNow={registerEditorSaveNow}
              onRegisterReadTable={registerTableReadDocument}
              aiTablePatch={aiTablePatchRequest?.patch ?? null}
              aiTablePatchRequestId={aiTablePatchRequest?.id}
              onAiTablePatchApplied={() => setAiTablePatchRequest(null)}
            />
          </Suspense>
        ) : (
          <LakeEditor
            document={currentDocument?.entry ?? null}
            content={currentDocument?.kind === "lake" ? currentDocument.content : ""}
            mode={currentDocument?.kind === "lake" ? currentDocument.mode ?? "edit" : "edit"}
            manualSaveRequest={manualSaveRequest}
            exportRequest={exportRequest}
            onSave={saveDocument}
            onExportContent={writeDocumentExport}
            onUploadImage={uploadEditorImage}
            onUploadFile={uploadEditorFile}
            onDownloadFile={downloadEditorFile}
            onPrepareResourcePreview={prepareEditorResourcePreview}
            resourcePreviewConcurrency={ossSettings?.resourcePreviewConcurrency}
            onSaveStatusChange={setSaveStatus}
            onRegisterSaveNow={registerEditorSaveNow}
            onRegisterReadContent={registerLakeReadContent}
            onRegisterReadSelection={registerLakeReadSelection}
            onRegisterReplaceSelection={registerLakeReplaceSelection}
            onSelectionCapabilityChange={setLakeSelectionCapability}
            aiPreviewContent={aiPreviewRequest?.content ?? null}
            aiPreviewContentType={aiPreviewRequest?.contentType}
            aiPreviewRequestId={aiPreviewRequest?.id}
            onAiPreviewApplied={() => setAiPreviewRequest(null)}
          />
        )}
        {aiResult?.previewMode === "patch" && aiPatchPreview ? (
          <section className="ai-document-diff-overlay" aria-label="文档修改预览">
            <header className="ai-document-diff-overlay__header">
              <div>
                <span>文档修改预览</span>
                <strong>{aiResult.title}</strong>
              </div>
              <div className="ai-document-diff-overlay__actions">
                <button type="button" className="secondary-button" onClick={() => {
                  setAiResult(null);
                  setAiPatchPreview(null);
                }}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={Boolean(aiPatchPreview.errors.length) || (aiResult.contentScope === "selection" && !lakeSelectionCapability.canReplaceSelection)}
                  onClick={applyAiResultToCurrentDocument}
                >
                  {aiResult.contentScope === "selection" ? "允许并替换选中区域" : "允许并应用修改"}
                </button>
              </div>
            </header>
            <AiDocumentPatchDiff preview={aiPatchPreview} />
          </section>
        ) : null}
      </main>
      <AiDocumentAssistant
        open={aiDocumentAssistantVisible}
        documentTitle={currentDocument?.entry ? documentTitleFromPath(currentDocument.entry.path) : ""}
        result={aiResult}
        patchPreview={aiPatchPreview}
        splitResult={aiSplitResult}
        running={aiRunning}
        error={aiError}
        scope={aiContentScope}
        autoApply={aiAutoApply}
        selectionAvailable={lakeSelectionCapability.canReadSelection}
        selectionReplaceAvailable={lakeSelectionCapability.canReplaceSelection}
        onClose={() => setAiAssistantOpen(false)}
        onScopeChange={setAiContentScope}
        onAutoApplyChange={setAiAutoApply}
        onRunAction={runCurrentDocumentAiAction}
        onApplyResult={applyAiResultToCurrentDocument}
        onConfirmSplit={confirmSplitCurrentDocument}
      />
      <AiTableAssistant
        open={aiAssistantOpen && currentDocument?.kind === "multidimensional-table"}
        tableTitle={currentDocument?.entry ? documentTitleFromPath(currentDocument.entry.path) : ""}
        result={aiTableResult}
        running={aiRunning}
        error={aiError}
        onClose={() => setAiAssistantOpen(false)}
        onRunAction={runCurrentTableAiAction}
        onApplyPatch={applyAiTablePatchToCurrentTable}
      />
      <AiSpreadsheetAssistant
        open={aiAssistantOpen && currentDocument?.kind === "spreadsheet"}
        spreadsheetTitle={currentDocument?.entry ? documentTitleFromPath(currentDocument.entry.path) : ""}
        result={aiSpreadsheetResult}
        running={aiRunning}
        error={aiError}
        onClose={() => setAiAssistantOpen(false)}
        onRunAction={runCurrentSpreadsheetAiAction}
        onApplyPatch={applyAiSpreadsheetPatchToCurrentSpreadsheet}
      />
      <OssSettingsPanel
        open={settingsOpen}
        settings={ossSettings}
        aiSettings={aiSettings}
        databaseLocation={databaseLocation}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        onSaveAiSettings={saveModelSettings}
        onListAiModels={fetchAiModels}
        onAddAiModel={addModelToProfile}
        onSetActiveAiModel={activateAiModel}
        onChooseDatabaseDirectory={chooseDatabaseDirectory}
        onChooseStorageDirectory={chooseStorageDirectory}
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
        onTestStorageConnection={testStorageConnection}
        onAnalyzeResourceMigration={analyzeResourceMigration}
        onRunResourceMigration={async (input) => {
          const output = await runResourceMigration(input);
          await refreshCurrentDocumentFromDisk();
          return output;
        }}
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

const editorScrollContainerSelectors = [
  ".lake-editor-root .ne-editor-wrap",
  ".lake-editor-root.is-read-mode",
  ".multitable-grid",
  ".multitable-board",
  ".spreadsheet-editor-container",
  ".spreadsheet-editor-host",
  ".lake-editor-root",
  ".multitable-editor-root",
  ".spreadsheet-editor-root",
];

function saveTabScrollSnapshot(
  snapshots: Map<string, EditorScrollSnapshot>,
  workspaceElement: HTMLElement | null,
  tabId: string | null,
): void {
  if (!tabId) {
    return;
  }

  const scrollElement = findEditorScrollContainer(workspaceElement);
  if (!scrollElement) {
    snapshots.delete(tabId);
    return;
  }

  snapshots.set(tabId, {
    top: scrollElement.scrollTop,
    left: scrollElement.scrollLeft,
  });
}

function restoreTabScrollSnapshot(
  snapshots: Map<string, EditorScrollSnapshot>,
  workspaceElement: HTMLElement | null,
  tabId: string,
): void {
  const snapshot = snapshots.get(tabId);
  if (!snapshot) {
    return;
  }

  const scrollElement = findEditorScrollContainer(workspaceElement);
  if (!scrollElement) {
    return;
  }

  scrollElement.scrollTo?.({ top: snapshot.top, left: snapshot.left });
  scrollElement.scrollTop = snapshot.top;
  scrollElement.scrollLeft = snapshot.left;
}

function findEditorScrollContainer(workspaceElement: HTMLElement | null): HTMLElement | null {
  if (!workspaceElement) {
    return null;
  }

  const candidates = editorScrollContainerSelectors
    .flatMap((selector) => Array.from(workspaceElement.querySelectorAll<HTMLElement>(selector)));

  // 优先记录已经发生过滚动的内部容器；没有滚动时再落到第一个编辑器滚动面。
  return candidates.find((element) => element.scrollTop > 0 || element.scrollLeft > 0) ?? candidates[0] ?? null;
}

function scheduleTabScrollRestore(restore: () => void): () => void {
  let timeoutId: number | null = null;
  let frameId: number | null = window.requestAnimationFrame(() => {
    restore();
    timeoutId = window.setTimeout(restore, 0);
  });

  return () => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

function deleteTabScrollSnapshot(snapshots: Map<string, EditorScrollSnapshot>, tabId: string): void {
  snapshots.delete(tabId);
}

function deleteTabScrollSnapshotsForTabs(
  snapshots: Map<string, EditorScrollSnapshot>,
  previousTabs: OpenDocumentTab[],
  nextTabs: OpenDocumentTab[],
): void {
  const nextTabIds = new Set(nextTabs.map((tab) => tab.id));
  for (const tab of previousTabs) {
    if (!nextTabIds.has(tab.id)) {
      snapshots.delete(tab.id);
    }
  }
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

async function readDocumentState(
  document: WorkspaceDocument,
  mode: DocumentOpenMode = "edit",
  workspaceRoot?: string | null,
  visibleWorkspaceRoot?: string | null,
): Promise<CurrentDocumentState> {
  if (document.kind === "spreadsheet") {
    return {
      kind: "spreadsheet",
      entry: asSpreadsheetDocument(document),
      content: await withWorkspaceRoot(workspaceRoot, visibleWorkspaceRoot, () => readSpreadsheetDocument(document.path)),
      workspaceRoot: workspaceRoot ?? undefined,
    };
  }
  if (document.kind === "multidimensional-table") {
    return {
      kind: "multidimensional-table",
      entry: asMultidimensionalTableDocument(document),
      content: await withWorkspaceRoot(workspaceRoot, visibleWorkspaceRoot, () => readMultidimensionalTableDocument(document.path)),
      workspaceRoot: workspaceRoot ?? undefined,
    };
  }
  return {
    kind: "lake",
    entry: asLakeDocument(document),
    content: await withWorkspaceRoot(workspaceRoot, visibleWorkspaceRoot, () => readLakeDocument(document.path)),
    workspaceRoot: workspaceRoot ?? undefined,
    mode,
  };
}

async function resolveTabDocument(
  tab: OpenDocumentTab,
  candidateWorkspace: WorkspacePayload | null,
  visibleWorkspaceRoot: string | null,
  targetWorkspaceRoot: string | null,
): Promise<WorkspaceDocument | null> {
  if (candidateWorkspace?.root === targetWorkspaceRoot) {
    return candidateWorkspace.documents.find((entry) => entry.path === tab.path) ?? null;
  }
  if (tab.document) {
    return tab.document;
  }
  if (!targetWorkspaceRoot) {
    return null;
  }

  const payload = await loadWorkspacePayload(targetWorkspaceRoot, visibleWorkspaceRoot);
  return payload.documents.find((entry) => entry.path === tab.path) ?? null;
}

async function loadWorkspacePayload(
  targetWorkspaceRoot: string,
  visibleWorkspaceRoot: string | null | undefined,
): Promise<WorkspacePayload> {
  if (targetWorkspaceRoot === visibleWorkspaceRoot) {
    return setWorkspaceRoot(targetWorkspaceRoot);
  }

  const payload = await setWorkspaceRoot(targetWorkspaceRoot);
  try {
    return payload;
  } finally {
    // 只读取锁定标签所属知识库的目录元数据，不把侧栏上下文切过去。
    if (visibleWorkspaceRoot) {
      await setWorkspaceRoot(visibleWorkspaceRoot);
    }
  }
}

async function withWorkspaceRoot<T>(
  targetWorkspaceRoot: string | null | undefined,
  visibleWorkspaceRoot: string | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (!targetWorkspaceRoot || targetWorkspaceRoot === visibleWorkspaceRoot) {
    return action();
  }

  await setWorkspaceRoot(targetWorkspaceRoot);
  try {
    return await action();
  } finally {
    // 读写跨知识库锁定标签时只借用后端 root，完成后恢复当前侧栏知识库，避免左侧列表跟着跳转。
    if (visibleWorkspaceRoot) {
      await setWorkspaceRoot(visibleWorkspaceRoot);
    }
  }
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

function createOpenDocumentTab(document: WorkspaceDocument, mode?: DocumentOpenMode, workspaceRoot?: string | null): OpenDocumentTab {
  const normalizedWorkspaceRoot = workspaceRoot ?? undefined;
  return {
    id: createTabId(normalizedWorkspaceRoot, document.path),
    path: document.path,
    workspaceRoot: normalizedWorkspaceRoot,
    document,
    locked: false,
    mode,
  };
}

function createTabId(workspaceRoot: string | null | undefined, path: string): string {
  return workspaceRoot ? `${workspaceRoot}::${path}` : path;
}

function tabWorkspaceRoot(tab: OpenDocumentTab | undefined, currentWorkspaceRoot: string | null): string | null {
  return tab?.workspaceRoot ?? currentWorkspaceRoot;
}

function tabMatchesWorkspacePath(tab: OpenDocumentTab, path: string, workspaceRoot: string | null): boolean {
  if (tab.path !== path) {
    return false;
  }
  if (tab.workspaceRoot) {
    return tab.workspaceRoot === workspaceRoot;
  }
  return workspaceRoot === null;
}

function isSameCurrentDocument(current: CurrentDocumentState, expected: CurrentDocumentState): boolean {
  return current.entry.path === expected.entry.path && current.workspaceRoot === expected.workspaceRoot;
}

function tabIdMatchesWorkspacePath(tabId: string, path: string, workspaceRoot: string): boolean {
  return tabId === createTabId(workspaceRoot, path) || tabId === path;
}

function reorderTabsByIds(tabs: OpenDocumentTab[], orderedTabIds: string[]): OpenDocumentTab[] {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));
  const orderedTabs = orderedTabIds
    .map((tabId) => tabById.get(tabId))
    .filter((tab): tab is OpenDocumentTab => Boolean(tab));
  const orderedIdSet = new Set(orderedTabs.map((tab) => tab.id));
  // 拖拽过程只改变已有标签顺序；兜底保留未出现在拖拽结果里的标签，避免异常事件导致标签丢失。
  return [
    ...orderedTabs,
    ...tabs.filter((tab) => !orderedIdSet.has(tab.id)),
  ];
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
    if (!tabBelongsToWorkspace(tab, workspace.root)) {
      return [tab];
    }

    const nextPath = pathMovesWithResolution(tab.path, move) ? rewriteMovedPath(tab.path, move) : tab.path;
    const nextDocument = workspace.documents.find((entry) => entry.path === nextPath);
    if (!nextDocument) {
      missing = true;
      return [];
    }
    return [{ ...tab, id: createTabId(workspace.root, nextPath), path: nextPath, workspaceRoot: workspace.root, document: nextDocument }];
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

function rebindActiveTabIdForMove(
  activeTabId: string | null,
  workspaceRoot: string,
  move: WorkspaceMoveResolution,
  tabs: OpenDocumentTab[],
): string | null {
  if (!activeTabId || !move.ok) {
    return activeTabId;
  }
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (!activeTab || !tabBelongsToWorkspace(activeTab, workspaceRoot) || !pathMovesWithResolution(activeTab.path, move)) {
    return tabs.some((tab) => tab.id === activeTabId) ? activeTabId : null;
  }
  const nextPath = rewriteMovedPath(activeTab.path, move);
  const nextActiveTabId = createTabId(workspaceRoot, nextPath);
  return tabs.some((tab) => tab.id === nextActiveTabId) ? nextActiveTabId : null;
}

function rewriteOpenTabs(tabs: OpenDocumentTab[], fromPath: string, toPath: string, workspaceRoot: string): OpenDocumentTab[] {
  return tabs.map((tab) => (
    tabMatchesWorkspacePath(tab, fromPath, workspaceRoot)
      ? { ...tab, id: createTabId(workspaceRoot, toPath), path: toPath, workspaceRoot, document: rebindTabDocumentPath(tab, toPath) }
      : tab
  ));
}

function rewriteOpenTabsByPrefix(tabs: OpenDocumentTab[], fromPath: string, toPath: string, workspaceRoot: string): OpenDocumentTab[] {
  return tabs.map((tab) => {
    if (!tabInWorkspacePathPrefix(tab, fromPath, workspaceRoot)) {
      return tab;
    }
    const nextPath = replacePathPrefix(tab.path, fromPath, toPath);
    return { ...tab, id: createTabId(workspaceRoot, nextPath), path: nextPath, workspaceRoot, document: rebindTabDocumentPath(tab, nextPath) };
  });
}

function rewriteTabIdIfPathMatches(
  tabId: string | null,
  fromPath: string,
  toPath: string,
  workspaceRoot: string,
): string | null {
  return tabId === createTabId(workspaceRoot, fromPath) || tabId === fromPath
    ? createTabId(workspaceRoot, toPath)
    : tabId;
}

function rewriteTabIdByPrefix(
  tabId: string | null,
  fromPath: string,
  toPath: string,
  workspaceRoot: string,
): string | null {
  if (!tabId) {
    return null;
  }
  const prefix = createTabId(workspaceRoot, fromPath);
  if (tabId === prefix || tabId.startsWith(`${prefix}/`)) {
    return createTabId(workspaceRoot, replacePathPrefix(tabId.slice(`${workspaceRoot}::`.length), fromPath, toPath));
  }
  if (isSameOrChildPath(tabId, fromPath)) {
    return createTabId(workspaceRoot, replacePathPrefix(tabId, fromPath, toPath));
  }
  return tabId;
}

function tabInWorkspacePathPrefix(tab: OpenDocumentTab, pathPrefix: string, workspaceRoot: string): boolean {
  return tabBelongsToWorkspace(tab, workspaceRoot) && isSameOrChildPath(tab.path, pathPrefix);
}

function tabIdInWorkspacePathPrefix(tabId: string, pathPrefix: string, workspaceRoot: string): boolean {
  const rootPrefix = `${workspaceRoot}::`;
  const path = tabId.startsWith(rootPrefix) ? tabId.slice(rootPrefix.length) : tabId;
  return tabId.startsWith(rootPrefix) && isSameOrChildPath(path, pathPrefix);
}

function tabBelongsToWorkspace(tab: OpenDocumentTab, workspaceRoot: string): boolean {
  return (tab.workspaceRoot ?? workspaceRoot) === workspaceRoot;
}

function rebindTabDocumentPath(tab: OpenDocumentTab, path: string): WorkspaceDocument | undefined {
  return tab.document ? { ...tab.document, id: path, path, name: documentTitleFromPath(path) } : undefined;
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
