import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type { OssSettings, UploadImageInput, UploadImageOutput } from "../app/appState";
import type {
  CreateDocumentPayload,
  WorkspaceDirectory,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";

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
    return stored ? normalizeBrowserWorkspace(JSON.parse(stored) as Partial<WorkspacePayload>) : null;
  }

  return invoke<WorkspacePayload | null>("get_recent_workspace");
}

export async function setWorkspaceRoot(path: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const payload: WorkspacePayload = {
      root: path,
      directories: [],
      documents: [],
      order: [],
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
      return normalizeBrowserWorkspace(JSON.parse(stored) as Partial<WorkspacePayload>);
    }
    return { root: "/browser-preview", directories: [], documents: [], order: [] };
  }

  return invoke<WorkspacePayload>("list_lake_documents");
}

export async function renameWorkspace(name: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const payload = { ...workspace, root: `/browser-preview/${safeBrowserName(name)}` };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("rename_workspace", { name });
}

export async function createLakeDirectory(parentPath: string, name: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const safeName = safeBrowserName(name);
    const path = parentPath ? `${parentPath}/${safeName}` : safeName;
    const directory: WorkspaceDirectory = {
      id: path,
      path,
      name: safeName,
      parentPath,
    };
    const payload = {
      ...workspace,
      directories: [...workspace.directories, directory],
      order: [...workspace.order, `folder:${path}`],
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("create_lake_directory", { parentPath, name });
}

export async function renameLakeDirectory(relativePath: string, name: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const safeName = safeBrowserName(name);
    const parentPath = workspace.directories.find((directory) => directory.path === relativePath)?.parentPath ?? "";
    const nextPath = parentPath ? `${parentPath}/${safeName}` : safeName;
    const payload: WorkspacePayload = {
      ...workspace,
      directories: workspace.directories.map((directory) => {
        if (directory.path === relativePath) {
          return { ...directory, id: nextPath, path: nextPath, name: safeName };
        }
        if (isSameOrChildPath(directory.path, relativePath)) {
          const nextDirectoryPath = replacePathPrefix(directory.path, relativePath, nextPath);
          return {
            ...directory,
            id: nextDirectoryPath,
            path: nextDirectoryPath,
            parentPath: replacePathPrefix(directory.parentPath, relativePath, nextPath),
          };
        }
        return directory;
      }),
      documents: workspace.documents.map((document) => {
        if (isSameOrChildPath(document.parentPath, relativePath)) {
          const nextParentPath = replacePathPrefix(document.parentPath, relativePath, nextPath);
          const nextDocumentPath = replacePathPrefix(document.path, relativePath, nextPath);
          moveBrowserDocument(document.path, nextDocumentPath);
          return { ...document, id: nextDocumentPath, path: nextDocumentPath, parentPath: nextParentPath };
        }
        return document;
      }),
      order: workspace.order.map((itemId) => replaceOrderedItemPath(itemId, relativePath, nextPath)),
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("rename_lake_directory", { relativePath, name });
}

export async function deleteLakeDirectory(relativePath: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const payload: WorkspacePayload = {
      ...workspace,
      directories: workspace.directories.filter((directory) => directory.path !== relativePath && !directory.path.startsWith(`${relativePath}/`)),
      documents: workspace.documents.filter((document) => {
        const keep = document.parentPath !== relativePath && !document.parentPath.startsWith(`${relativePath}/`);
        if (!keep) {
          window.localStorage.removeItem(browserDocumentKey(document.path));
        }
        return keep;
      }),
      order: workspace.order.filter((itemId) => !orderedItemMatchesPath(itemId, relativePath)),
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("delete_lake_directory", { relativePath });
}

export async function saveWorkspaceOrder(order: string[]): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const payload = { ...workspace, order };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("save_workspace_order", { order });
}

export async function createLakeDocument(title: string, parentPath = ""): Promise<CreateDocumentPayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const path = nextBrowserDocumentPath(title, parentPath, workspace.documents.map((document) => document.path));
    const createdDocument = {
      id: path,
      path,
      name: path.replace(/\.lake$/i, ""),
      parentPath,
      size: 0,
    };
    const payload: CreateDocumentPayload = {
      root: workspace.root,
      directories: workspace.directories,
      documents: [...workspace.documents, createdDocument],
      order: [...workspace.order, `document:${path}`],
      createdDocument,
    };
    saveBrowserWorkspace(payload);
    window.localStorage.setItem(browserDocumentKey(createdDocument.path), "<p><span class=\"ne-text\"> </span></p>");
    return payload;
  }

  return invoke<CreateDocumentPayload>("create_lake_document", { title, parentPath });
}

export async function renameLakeDocument(relativePath: string, title: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const document = workspace.documents.find((entry) => entry.path === relativePath);
    if (!document) {
      return workspace;
    }
    const safeTitle = safeBrowserName(title);
    const nextPath = document.parentPath ? `${document.parentPath}/${safeTitle}.lake` : `${safeTitle}.lake`;
    moveBrowserDocument(relativePath, nextPath);
    const payload = {
      ...workspace,
      documents: workspace.documents.map((entry) => entry.path === relativePath ? {
        ...entry,
        id: nextPath,
        path: nextPath,
        name: safeTitle,
      } : entry),
      order: workspace.order.map((itemId) => itemId === `document:${relativePath}` ? `document:${nextPath}` : itemId),
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("rename_lake_document", { relativePath, title });
}

export async function deleteLakeDocument(relativePath: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    window.localStorage.removeItem(browserDocumentKey(relativePath));
    const payload = {
      ...workspace,
      documents: workspace.documents.filter((document) => document.path !== relativePath),
      order: workspace.order.filter((itemId) => itemId !== `document:${relativePath}`),
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("delete_lake_document", { relativePath });
}

function nextBrowserDocumentPath(title: string, parentPath: string, existingPaths: string[]): string {
  const takenPaths = new Set(existingPaths);
  const baseName = title.trim() || "未命名文档";
  let candidate = parentPath ? `${parentPath}/${baseName}.lake` : `${baseName}.lake`;
  let counter = 2;

  while (takenPaths.has(candidate)) {
    candidate = parentPath ? `${parentPath}/${baseName}-${counter}.lake` : `${baseName}-${counter}.lake`;
    counter += 1;
  }

  return candidate;
}

export async function readLakeDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return window.localStorage.getItem(browserDocumentKey(relativePath)) ?? "";
  }

  return invoke<string>("read_lake_document", { relativePath });
}

export async function writeLakeDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(browserDocumentKey(relativePath), content);
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

function browserDocumentKey(relativePath: string): string {
  return `yuque-lake-notes.browser-doc:${relativePath}`;
}

function saveBrowserWorkspace(workspace: WorkspacePayload): void {
  window.localStorage.setItem(browserWorkspaceKey, JSON.stringify(workspace));
}

function normalizeBrowserWorkspace(workspace: Partial<WorkspacePayload>): WorkspacePayload {
  return {
    root: workspace.root ?? "/browser-preview",
    directories: workspace.directories ?? [],
    documents: workspace.documents ?? [],
    order: workspace.order ?? [],
  };
}

function moveBrowserDocument(fromPath: string, toPath: string): void {
  const content = window.localStorage.getItem(browserDocumentKey(fromPath));
  if (content !== null) {
    window.localStorage.setItem(browserDocumentKey(toPath), content);
    window.localStorage.removeItem(browserDocumentKey(fromPath));
  }
}

function isSameOrChildPath(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

function replacePathPrefix(path: string, fromPath: string, toPath: string): string {
  if (!path) {
    return "";
  }
  return isSameOrChildPath(path, fromPath) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

function replaceOrderedItemPath(itemId: string, fromPath: string, toPath: string): string {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex < 0) {
    return itemId;
  }

  const kind = itemId.slice(0, separatorIndex);
  const path = itemId.slice(separatorIndex + 1);
  return isSameOrChildPath(path, fromPath) ? `${kind}:${replacePathPrefix(path, fromPath, toPath)}` : itemId;
}

function orderedItemMatchesPath(itemId: string, basePath: string): boolean {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex < 0) {
    return false;
  }

  return isSameOrChildPath(itemId.slice(separatorIndex + 1), basePath);
}

function safeBrowserName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "未命名";
}
