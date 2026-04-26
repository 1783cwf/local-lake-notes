import { useCallback, useEffect, useMemo, useState } from "react";

import { AppRail } from "../components/AppRail";
import { DocumentSidebar } from "../components/DocumentSidebar";
import { OutlinePanel } from "../components/OutlinePanel";
import { TopBar } from "../components/TopBar";
import { LakeEditor } from "../features/lake-editor/LakeEditor";
import { OssSettingsPanel } from "../features/settings/OssSettingsPanel";
import type { WorkspaceDocument, WorkspacePayload } from "../features/workspace/workspaceStore";
import {
  chooseWorkspaceDirectory,
  createLakeDocument,
  getOssSettings,
  getRecentWorkspace,
  readLakeDocument,
  saveOssSettings,
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

  const createDocument = useCallback(async () => {
    try {
      const title = "未命名文档";
      const payload = await createLakeDocument(title);
      setWorkspace({ root: payload.root, documents: payload.documents });
      setCurrentDocument({
        entry: payload.createdDocument,
        content: await readLakeDocument(payload.createdDocument.path),
      });
      setAppError(null);
    } catch (error) {
      setAppError(toMessage(error));
    }
  }, []);

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

  return (
    <div className="app-shell">
      <AppRail
        onChooseWorkspace={chooseWorkspace}
        onCreateDocument={createDocument}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DocumentSidebar
        workspaceRoot={workspace?.root ?? null}
        documents={documents}
        currentPath={currentPath}
        onOpenDocument={openDocument}
        onCreateDocument={createDocument}
      />
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
          onSaveStatusChange={setSaveStatus}
        />
      </main>
      <OutlinePanel />
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
