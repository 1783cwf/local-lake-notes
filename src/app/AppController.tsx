import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { OutlinePanel } from "../components/OutlinePanel";
import { TopBar } from "../components/TopBar";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import type { LakeOutlineItem } from "../features/lake-editor/lakeOutline";
import { OssSettingsPanel } from "../features/settings/OssSettingsPanel";
import type { WorkspaceDocument, WorkspacePayload } from "../features/workspace/workspaceStore";
import { buildDocumentTree, flattenTreeOrder } from "../features/workspace/workspaceStore";
import {
  chooseWorkspaceDirectory,
  createLakeDirectory,
  createLakeDocument,
  deleteLakeDirectory,
  deleteLakeDocument,
  getOssSettings,
  getRecentWorkspace,
  readLakeDocument,
  renameLakeDirectory,
  renameLakeDocument,
  renameWorkspace,
  saveOssSettings,
  saveWorkspaceOrder,
  setWorkspaceRoot,
  uploadImage,
  writeLakeDocument,
} from "../lib/tauri";
import type { CurrentDocumentState, OssSettings, SaveStatus, UploadImageInput, UploadImageOutput } from "./appState";
import { emptySaveStatus } from "./appState";

export function AppController() {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [currentDocument, setCurrentDocument] = useState<CurrentDocumentState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(emptySaveStatus);
  const [manualSaveRequest, setManualSaveRequest] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ossSettings, setOssSettings] = useState<OssSettings | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [outlineItems, setOutlineItems] = useState<LakeOutlineItem[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(296);
  const [outlineWidth, setOutlineWidth] = useState(280);

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
      setOutlineItems([]);
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

  const createDirectory = useCallback(async (parentPath = "") => {
    const name = window.prompt("目录名称", "新目录");
    if (!name) {
      return;
    }

    try {
      setWorkspace(await createLakeDirectory(parentPath, name));
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

  const renameCurrentWorkspace = useCallback(async () => {
    if (!workspace) {
      return;
    }
    const name = window.prompt("知识库名称", basename(workspace.root));
    if (!name) {
      return;
    }

    try {
      setWorkspace(await renameWorkspace(name));
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [workspace]);

  const renameDocument = useCallback(async (document: WorkspaceDocument) => {
    const title = window.prompt("文档名称", document.name);
    if (!title) {
      return;
    }

    try {
      const payload = await renameLakeDocument(document.path, title);
      setWorkspace(payload);
      if (currentDocument?.entry.path === document.path) {
        const nextPath = document.parentPath ? `${document.parentPath}/${safeName(title)}.lake` : `${safeName(title)}.lake`;
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

  const deleteDocument = useCallback(async (document: WorkspaceDocument) => {
    if (!window.confirm(`删除文档「${document.name}」？`)) {
      return;
    }

    try {
      const payload = await deleteLakeDocument(document.path);
      setWorkspace(payload);
      if (currentDocument?.entry.path === document.path) {
        setCurrentDocument(null);
        setOutlineItems([]);
      }
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [currentDocument?.entry.path]);

  const renameDirectory = useCallback(async (directory: { path: string; name: string; parentPath: string }) => {
    const name = window.prompt("目录名称", directory.name);
    if (!name) {
      return;
    }

    try {
      const payload = await renameLakeDirectory(directory.path, name);
      setWorkspace(payload);
      if (currentDocument?.entry.path.startsWith(`${directory.path}/`)) {
        const nextPrefix = directory.parentPath ? `${directory.parentPath}/${safeName(name)}` : safeName(name);
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
        setOutlineItems([]);
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

  const currentPath = currentDocument?.entry.path ?? null;
  const documents = useMemo(() => workspace?.documents ?? [], [workspace]);
  const directories = useMemo(() => workspace?.directories ?? [], [workspace]);
  const order = useMemo(() => workspace?.order ?? [], [workspace]);

  const moveNode = useCallback(async (sourceId: string, targetId: string) => {
    if (!workspace) {
      return;
    }

    const currentOrder = flattenTreeOrder(buildDocumentTree(workspace.documents, workspace.directories, workspace.order));
    const nextOrder = currentOrder.filter((itemId) => itemId !== sourceId);
    const targetIndex = nextOrder.indexOf(targetId);
    nextOrder.splice(targetIndex >= 0 ? targetIndex : nextOrder.length, 0, sourceId);

    try {
      setWorkspace(await saveWorkspaceOrder(nextOrder));
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, [workspace]);

  const beginPaneResize = useCallback((pane: "sidebar" | "outline", event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = pane === "sidebar" ? sidebarWidth : outlineWidth;

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (pane === "sidebar") {
        setSidebarWidth(clamp(startWidth + delta, 220, 440));
      } else {
        setOutlineWidth(clamp(startWidth - delta, 220, 460));
      }
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [outlineWidth, sidebarWidth]);

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `var(--rail-width) ${sidebarWidth}px 8px minmax(0, 1fr) 8px ${outlineWidth}px`,
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
        onRenameDocument={renameDocument}
        onDeleteDocument={deleteDocument}
        onRenameDirectory={renameDirectory}
        onDeleteDirectory={deleteDirectory}
        onMoveNode={moveNode}
      />
      <PaneResizer label="调整目录宽度" onPointerDown={(event) => beginPaneResize("sidebar", event)} />
      <main className="editor-workspace">
        <TopBar
          document={currentDocument?.entry ?? null}
          saveStatus={saveStatus}
          onManualSave={() => setManualSaveRequest((current) => current + 1)}
        />
        {appError ? <div className="app-error">{appError}</div> : null}
        <LakeEditor
          document={currentDocument?.entry ?? null}
          content={currentDocument?.content ?? ""}
          manualSaveRequest={manualSaveRequest}
          onSave={saveDocument}
          onUploadImage={uploadEditorImage}
          onOutlineChange={setOutlineItems}
          onSaveStatusChange={setSaveStatus}
        />
      </main>
      <PaneResizer label="调整大纲宽度" onPointerDown={(event) => beginPaneResize("outline", event)} />
      <OutlinePanel items={outlineItems} />
      <OssSettingsPanel
        open={settingsOpen}
        settings={ossSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />
    </div>
  );
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
