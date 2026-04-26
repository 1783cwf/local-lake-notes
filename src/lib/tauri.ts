import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { OssSettings, UploadImageInput, UploadImageOutput } from "../app/appState";
import type { CreateDocumentPayload, WorkspacePayload } from "../features/workspace/workspaceStore";

const browserWorkspaceKey = "yuque-lake-notes.browser-workspace";
const browserSettingsKey = "yuque-lake-notes.browser-oss-settings";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === "function"
  );
}

export async function chooseWorkspaceDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return "/browser-preview";
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择知识库目录",
  });

  return typeof selected === "string" ? selected : null;
}

export async function getRecentWorkspace(): Promise<WorkspacePayload | null> {
  if (!isTauriRuntime()) {
    const stored = window.localStorage.getItem(browserWorkspaceKey);
    return stored ? (JSON.parse(stored) as WorkspacePayload) : null;
  }

  return invoke<WorkspacePayload | null>("get_recent_workspace");
}

export async function setWorkspaceRoot(path: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const payload: WorkspacePayload = {
      root: path,
      documents: [],
    };
    window.localStorage.setItem(browserWorkspaceKey, JSON.stringify(payload));
    return payload;
  }

  return invoke<WorkspacePayload>("set_workspace_root", { path });
}

export async function listLakeDocuments(): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const stored = window.localStorage.getItem(browserWorkspaceKey);
    if (stored) {
      return JSON.parse(stored) as WorkspacePayload;
    }
    return { root: "/browser-preview", documents: [] };
  }

  return invoke<WorkspacePayload>("list_lake_documents");
}

export async function createLakeDocument(title: string): Promise<CreateDocumentPayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const path = nextBrowserDocumentPath(title, workspace.documents.map((document) => document.path));
    const createdDocument = {
      id: path,
      path,
      name: path.replace(/\.lake$/i, ""),
      parentPath: "",
      size: 0,
    };
    const payload: CreateDocumentPayload = {
      root: workspace.root,
      documents: [...workspace.documents, createdDocument],
      createdDocument,
    };
    window.localStorage.setItem(browserWorkspaceKey, JSON.stringify({
      root: payload.root,
      documents: payload.documents,
    }));
    window.localStorage.setItem(`yuque-lake-notes.browser-doc:${createdDocument.path}`, "<p><span class=\"ne-text\"> </span></p>");
    return payload;
  }

  return invoke<CreateDocumentPayload>("create_lake_document", { title });
}

function nextBrowserDocumentPath(title: string, existingPaths: string[]): string {
  const takenPaths = new Set(existingPaths);
  const baseName = title.trim() || "未命名文档";
  let candidate = `${baseName}.lake`;
  let counter = 2;

  while (takenPaths.has(candidate)) {
    candidate = `${baseName}-${counter}.lake`;
    counter += 1;
  }

  return candidate;
}

export async function readLakeDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return window.localStorage.getItem(`yuque-lake-notes.browser-doc:${relativePath}`) ?? "";
  }

  return invoke<string>("read_lake_document", { relativePath });
}

export async function writeLakeDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(`yuque-lake-notes.browser-doc:${relativePath}`, content);
    return;
  }

  await invoke("write_lake_document", { relativePath, content });
}

export async function getOssSettings(): Promise<OssSettings | null> {
  if (!isTauriRuntime()) {
    const stored = window.localStorage.getItem(browserSettingsKey);
    return stored ? (JSON.parse(stored) as OssSettings) : null;
  }

  return invoke<OssSettings | null>("get_oss_settings");
}

export async function saveOssSettings(settings: OssSettings): Promise<OssSettings> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(browserSettingsKey, JSON.stringify(settings));
    return settings;
  }

  return invoke<OssSettings>("save_oss_settings", { settings });
}

export async function uploadImage(input: UploadImageInput): Promise<UploadImageOutput> {
  if (!isTauriRuntime()) {
    return {
      url: `https://oss-preview.local/images/${encodeURIComponent(input.filename)}`,
      size: input.bytes.length,
      filename: input.filename,
    };
  }

  return invoke<UploadImageOutput>("upload_image", { input });
}
