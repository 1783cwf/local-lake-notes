import type { FormEvent, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { TopBar } from "../components/TopBar";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import {
  createOfficialLakeMarkdownConverter,
  exportFileName,
  lakeDocumentToHtml,
  lakeDocumentToMarkdown,
  lakeWorkspaceToMarkdownZip,
  workspaceExportFileName,
  type DocumentExportFormat,
  type LakeDocumentExportRequest,
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
  deleteLakeDirectory,
  deleteLakeDocument,
  getOssSettings,
  getRecentWorkspace,
  moveWorkspaceItem,
  openExternalUrl,
  readLakeDocument,
  renameLakeDirectory,
  renameLakeDocument,
  renameWorkspace,
  saveOssSettings,
  saveBinaryExport,
  savePdfExport,
  saveTextExport,
  setWorkspaceRoot,
  uploadFile,
  uploadImage,
  writeLakeDocument,
} from "../lib/tauri";
import type { CurrentDocumentState, OssSettings, SaveStatus, UploadImageInput, UploadImageOutput } from "./appState";
import { emptySaveStatus } from "./appState";

interface TextDialogState {
  title: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
}

export function AppController() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [currentDocument, setCurrentDocument] = useState<CurrentDocumentState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(emptySaveStatus);
  const [manualSaveRequest, setManualSaveRequest] = useState(0);
  const [exportRequest, setExportRequest] = useState<LakeDocumentExportRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ossSettings, setOssSettings] = useState<OssSettings | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(296);
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);

  useEffect(() => {
    void boot();
  }, []);

  const boot = async () => {
    try {
      const [recentWorkspace, settings] = await Promise.all([getRecentWorkspace(), getOssSettings()]);
      setWorkspace(recentWorkspace);
      setOssSettings(settings);
    } catch (error) {
      setAppError(toMessage(error));
    }
  };

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

  const exportDocument = useCallback((format: DocumentExportFormat) => {
    if (!currentDocument) {
      return;
    }

    setExportRequest((request) => ({
      id: (request?.id ?? 0) + 1,
      format,
      document: currentDocument.entry,
    }));
  }, [currentDocument]);

  const writeDocumentExport = useCallback(async (
    request: LakeDocumentExportRequest,
    content: string,
  ) => {
    const title = documentTitleFromPath(request.document.path);
    try {
      if (request.format === "markdown") {
        await saveTextExport(
          exportFileName(request.document, request.format),
          lakeDocumentToMarkdown(title, content),
          [{ name: "Markdown", extensions: ["md"] }],
        );
      } else if (request.format === "html") {
        await saveTextExport(
          exportFileName(request.document, request.format),
          await lakeDocumentToHtml(title, content),
          [{ name: "HTML", extensions: ["html"] }],
        );
      } else {
        await savePdfExport(
          exportFileName(request.document, request.format),
          await lakeDocumentToHtml(title, content),
          [{ name: "PDF", extensions: ["pdf"] }],
        );
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

  const exportWorkspaceMarkdownZip = useCallback(async () => {
    if (!workspace) {
      return;
    }

    try {
      const converter = createOfficialLakeMarkdownConverter();
      let zip: Uint8Array;
      try {
        zip = await lakeWorkspaceToMarkdownZip(workspace, readLakeDocument, converter.convert);
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
    }
  }, [workspace]);

  const saveSettings = useCallback(async (settings: OssSettings) => {
    const saved = await saveOssSettings(settings);
    setOssSettings(saved);
  }, []);

  const uploadEditorImage = useCallback(async (input: UploadImageInput): Promise<UploadImageOutput> => {
    if (!ossSettings) {
      setSettingsOpen(true);
      throw new Error("请先配置 OSS 上传信息");
    }
    return uploadImage(input);
  }, [ossSettings]);

  const uploadEditorFile = useCallback(async (input: UploadImageInput): Promise<UploadImageOutput> => {
    if (!ossSettings) {
      setSettingsOpen(true);
      throw new Error("请先配置 OSS 上传信息");
    }
    return uploadFile(input);
  }, [ossSettings]);

  const openEditorFileUrl = useCallback(async (url: string) => {
    try {
      await openExternalUrl(url);
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
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
  }, [sidebarWidth]);

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `var(--rail-width) ${sidebarWidth}px 8px minmax(0, 1fr)`,
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
      <PaneResizer label="调整目录宽度" onPointerDown={beginSidebarResize} />
      <main className="editor-workspace">
        <TopBar
          document={currentDocument?.entry ?? null}
          saveStatus={saveStatus}
          onManualSave={() => setManualSaveRequest((current) => current + 1)}
          onExportDocument={exportDocument}
          onRenameDocument={(title) => {
            if (currentDocument) {
              return renameDocumentTo(currentDocument.entry, title);
            }
          }}
        />
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
          onOpenFileUrl={openEditorFileUrl}
          onSaveStatusChange={setSaveStatus}
        />
      </main>
      <OssSettingsPanel
        open={settingsOpen}
        settings={ossSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
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
  label,
  onPointerDown,
}: {
  label: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="pane-resizer"
      role="separator"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
    />
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
