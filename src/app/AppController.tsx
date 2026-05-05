import type { FormEvent, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { TopBar } from "../components/TopBar";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import {
  createOfficialLakeMarkdownConverter,
  exportFileName,
  lakeDocumentToHtmlWithResources,
  lakeDocumentToHtmlBundle,
  lakeDocumentMarkdownToBundle,
  lakeDocumentMarkdownToTextWithResources,
  lakeWorkspaceToMarkdownZipWithResources,
  workspaceExportFileName,
  type DocumentExportFormat,
  type LakeDocumentExportRequest,
  type LakeDocumentResourceExportOptions,
} from "../features/lake-editor/lakeExport";
import { OssSettingsPanel } from "../features/settings/OssSettingsPanel";
import type {
  WorkspaceDocument,
  WorkspaceDropIntent,
  WorkspaceMoveResolution,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import {
  applyWorkspaceMove,
  buildDocumentTree,
  documentTitleFromPath,
  resolveWorkspaceMove,
} from "../features/workspace/workspaceStore";
import {
  chooseWorkspaceDirectory,
  createLakeDirectory,
  createLakeDocument,
  createBackup,
  deleteLakeDirectory,
  deleteLakeDocument,
  deleteBackup,
  createTemporaryResourceUrl,
  downloadResourceFile,
  prepareResourcePreview,
  readResourceBytes,
  getOssSettings,
  getRecentWorkspace,
  getBackupKeyStatus,
  getResourceKeyStatus,
  listBackups,
  moveWorkspaceItem,
  readLakeDocument,
  renameLakeDirectory,
  renameLakeDocument,
  renameWorkspace,
  saveOssSettings,
  saveBinaryExport,
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
} from "../lib/tauri";
import type {
  CurrentDocumentState,
  BackupKeyStatus,
  BackupRecord,
  FileDownloadInput,
  OssSettings,
  ResourceKeyStatus,
  RestoreBackupOutput,
  SaveStatus,
  UploadImageInput,
  UploadImageOutput,
} from "./appState";
import { emptySaveStatus } from "./appState";

interface TextDialogState {
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}

interface AppOperationState {
  kind: "document-export" | "workspace-export" | "image-upload" | "file-upload";
  label: string;
  count?: number;
}

export function AppController() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [currentDocument, setCurrentDocument] = useState<CurrentDocumentState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(emptySaveStatus);
  const [manualSaveRequest, setManualSaveRequest] = useState(0);
  const [exportRequest, setExportRequest] = useState<LakeDocumentExportRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ossSettings, setOssSettings] = useState<OssSettings | null>(null);
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
      const [recentWorkspace, settings, keyStatus, resourceStatus] = await Promise.all([
        getRecentWorkspace(),
        getOssSettings(),
        getBackupKeyStatus(),
        getResourceKeyStatus(),
      ]);
      setWorkspace(recentWorkspace);
      setOssSettings(settings);
      setBackupKeyStatus(keyStatus);
      setResourceKeyStatus(resourceStatus);
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

  const refreshCurrentDocumentFromDisk = useCallback(async () => {
    if (!currentDocument) {
      setSaveStatus(emptySaveStatus);
      return;
    }

    try {
      const content = await readLakeDocument(currentDocument.entry.path);
      setCurrentDocument({ entry: currentDocument.entry, content });
      setSaveStatus(emptySaveStatus);
    } catch {
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
    }
  }, [currentDocument]);

  const registerEditorSaveNow = useCallback((saveNow: (() => Promise<void>) | null) => {
    saveCurrentEditorNowRef.current = saveNow;
  }, []);

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
      setCurrentDocument(null);
      setSaveStatus(emptySaveStatus);
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

  const createDocument = useCallback(async (parentPath = "") => {
    try {
      const title = "未命名文档";
      const payload = await createLakeDocument(title, parentPath);
      setWorkspace({
        root: payload.root,
        directories: payload.directories,
        documents: payload.documents,
        order: payload.order,
      });
      setCurrentDocument({
        entry: payload.createdDocument,
        content: await readLakeDocument(payload.createdDocument.path),
      });
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

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
      const payload = await renameLakeDocument(document.path, nextName);
      setWorkspace(payload);
      if (currentDocument?.entry.path === document.path) {
        const nextPath = document.parentPath ? `${document.parentPath}/${nextName}.lake` : `${nextName}.lake`;
        const nextDocument = payload.documents.find((entry) => entry.path === nextPath);
        if (nextDocument) {
          setCurrentDocument({ entry: nextDocument, content: await readLakeDocument(nextDocument.path) });
        }
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [currentDocument?.entry.path]);

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
      const payload = await deleteLakeDocument(document.path);
      setWorkspace(payload);
      if (currentDocument?.entry.path === document.path) {
        setCurrentDocument(null);
        setSaveStatus(emptySaveStatus);
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [currentDocument?.entry.path]);

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
          if (currentDocument?.entry.path.startsWith(`${directory.path}/`)) {
            const nextPrefix = directory.parentPath ? `${directory.parentPath}/${nextName}` : nextName;
            const nextPath = currentDocument.entry.path.replace(directory.path, nextPrefix);
            const nextDocument = payload.documents.find((entry) => entry.path === nextPath);
            if (nextDocument) {
              setCurrentDocument({ entry: nextDocument, content: await readLakeDocument(nextDocument.path) });
            }
          }
          setAppError(null);
        } catch (error) {
          setAppError(toMessage(error));
        }
      },
    });
  }, [currentDocument]);

  const deleteDirectory = useCallback(async (directory: { path: string; name: string }) => {
    if (!window.confirm(`删除目录「${directory.name}」及其所有文档？`)) {
      return;
    }

    try {
      const payload = await deleteLakeDirectory(directory.path);
      setWorkspace(payload);
      if (currentDocument?.entry.path.startsWith(`${directory.path}/`)) {
        setCurrentDocument(null);
        setSaveStatus(emptySaveStatus);
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [currentDocument?.entry.path]);

  const openDocument = useCallback(async (document: WorkspaceDocument) => {
    if (saveStatus.state === "error") {
      setAppError("当前文档保存失败，请先处理后再切换");
      return;
    }

    try {
      const content = await readLakeDocument(document.path);
      setCurrentDocument({ entry: document, content });
      setSaveStatus(emptySaveStatus);
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [saveStatus.state]);

  const saveDocument = useCallback(async (relativePath: string, content: string) => {
    await writeLakeDocument(relativePath, content);
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
    if (!currentDocument) {
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

    setActiveAppOperation({ kind: "workspace-export", label: "正在导出知识库 Markdown ZIP" });
    try {
      const converter = createOfficialLakeMarkdownConverter();
      let zip: Uint8Array;
      try {
        zip = await lakeWorkspaceToMarkdownZipWithResources(
          workspace,
          readLakeDocument,
          createResourceExportOptions(),
          converter.convert,
        );
      } finally {
        converter.dispose();
      }
      await saveBinaryExport(
        workspaceExportFileName(workspace.root),
        zip,
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
    const optimisticWorkspace = applyWorkspaceMove(workspace, move);
    setWorkspace(optimisticWorkspace);
    setCurrentDocument(rebindCurrentDocument(currentDocument, optimisticWorkspace, move).document);

    try {
      const payload = await moveWorkspaceItem({
        sourceId,
        targetParentPath: move.targetParentPath,
        order: move.order,
      });
      const currentBinding = rebindCurrentDocument(currentDocument, payload, move);
      setWorkspace(payload);
      setCurrentDocument(currentBinding.document);
      setAppError(currentBinding.missing ? "移动后找不到当前文档，已关闭编辑区" : null);
    } catch (error) {
      setWorkspace(previousWorkspace);
      setCurrentDocument(previousCurrentDocument);
      setAppError(toMessage(error));
    }
  }, [currentDocument, workspace]);

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
        onChooseWorkspace={chooseWorkspace}
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
          saveStatus={saveStatus}
          onManualSave={() => setManualSaveRequest((current) => current + 1)}
          onExportDocument={exportDocument}
          exportBusy={activeAppOperation?.kind === "document-export"}
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
        <LakeEditor
          document={currentDocument?.entry ?? null}
          content={currentDocument?.content ?? ""}
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
      </main>
      <OssSettingsPanel
        open={settingsOpen}
        settings={ossSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
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

function rebindCurrentDocument(
  currentDocument: CurrentDocumentState | null,
  workspace: WorkspacePayload,
  move: WorkspaceMoveResolution,
): { document: CurrentDocumentState | null; missing: boolean } {
  if (!currentDocument || !move.ok) {
    return { document: currentDocument, missing: false };
  }

  if (!isSameOrChildPath(currentDocument.entry.path, move.sourcePath)) {
    const refreshedEntry = workspace.documents.find((entry) => entry.path === currentDocument.entry.path);
    return {
      document: refreshedEntry ? { ...currentDocument, entry: refreshedEntry } : currentDocument,
      missing: false,
    };
  }

  const nextPath = replacePathPrefix(currentDocument.entry.path, move.sourcePath, move.targetPath);
  const nextEntry = workspace.documents.find((entry) => entry.path === nextPath);
  return nextEntry
    ? { document: { ...currentDocument, entry: nextEntry }, missing: false }
    : { document: null, missing: true };
}

function replacePathPrefix(path: string, fromPath: string, toPath: string): string {
  return isSameOrChildPath(path, fromPath) ? `${toPath}${path.slice(fromPath.length)}` : path;
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
