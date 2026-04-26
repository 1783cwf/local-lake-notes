import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type { OssSettings, UploadImageInput, UploadImageOutput } from "../app/appState";
import type {
  CreateDocumentPayload,
  MoveWorkspaceItemInput,
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

export async function moveWorkspaceItem(input: MoveWorkspaceItemInput): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const movedItem = resolveBrowserMovedItem(workspace, input);
    const payload: WorkspacePayload = {
      ...workspace,
      directories: workspace.directories.map((directory) => {
        if (!isSameOrChildPath(directory.path, movedItem.sourcePath)) {
          return directory;
        }
        const path = replacePathPrefix(directory.path, movedItem.sourcePath, movedItem.targetPath);
        return {
          ...directory,
          id: path,
          path,
          parentPath: directory.path === movedItem.sourcePath
            ? movedItem.targetParentPath
            : replacePathPrefix(directory.parentPath, movedItem.sourcePath, movedItem.targetPath),
        };
      }),
      documents: workspace.documents.map((document) => {
        if (!isSameOrChildPath(document.path, movedItem.sourcePath)) {
          return document;
        }
        const path = replacePathPrefix(document.path, movedItem.sourcePath, movedItem.targetPath);
        if (document.path === movedItem.sourcePath) {
          moveBrowserDocument(document.path, path);
        } else if (movedItem.kind === "folder") {
          moveBrowserDocument(document.path, path);
        }
        return {
          ...document,
          id: path,
          path,
          parentPath: document.path === movedItem.sourcePath
            ? movedItem.targetParentPath
            : replacePathPrefix(document.parentPath, movedItem.sourcePath, movedItem.targetPath),
        };
      }),
      order: input.order.map((itemId) => replaceOrderedItemPath(itemId, movedItem.sourcePath, movedItem.targetPath)),
    };
    saveBrowserWorkspace(payload);
    return payload;
  }

  return invoke<WorkspacePayload>("move_workspace_item", { input });
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

export async function saveTextExport(
  defaultPath: string,
  content: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    downloadBrowserFile(defaultPath, new Blob([content], { type: "text/plain;charset=utf-8" }));
    return defaultPath;
  }

  const selected = await save({
    defaultPath,
    filters,
    title: "导出文件",
  });
  if (typeof selected !== "string") {
    return null;
  }

  await invoke("write_export_file", { path: selected, content });
  return selected;
}

export async function saveBinaryExport(
  defaultPath: string,
  bytes: Uint8Array,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    const browserBytes: Uint8Array<ArrayBuffer> = new Uint8Array(bytes);
    downloadBrowserFile(defaultPath, new Blob([browserBytes], { type: "application/zip" }));
    return defaultPath;
  }

  const selected = await save({
    defaultPath,
    filters,
    title: "导出文件",
  });
  if (typeof selected !== "string") {
    return null;
  }

  await invoke("write_export_bytes", { path: selected, bytes: Array.from(bytes) });
  return selected;
}

export async function savePdfExport(
  defaultPath: string,
  html: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    printBrowserHtml(html);
    return defaultPath;
  }

  const selected = await save({
    defaultPath,
    filters,
    title: "导出文件",
  });
  if (typeof selected !== "string") {
    return null;
  }

  await invoke("export_pdf_from_html", { path: selected, html });
  return selected;
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
      extname: fileExtension(input.filename),
    };
  }

  return invoke<UploadImageOutput>("upload_image", { input });
}

export async function uploadFile(input: UploadImageInput): Promise<UploadImageOutput> {
  if (!isTauriRuntime()) {
    return {
      url: `https://oss-preview.local/files/${encodeURIComponent(input.filename)}`,
      size: input.bytes.length,
      filename: input.filename,
      extname: fileExtension(input.filename),
    };
  }

  return invoke<UploadImageOutput>("upload_file", { input });
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  return invoke<void>("open_external_url", { url });
}

export async function downloadExternalFile(url: string, filename: string): Promise<string | null> {
  const defaultPath = safeDownloadFileName(filename) || fileNameFromUrl(url) || "附件";
  if (!isTauriRuntime()) {
    await downloadBrowserRemoteFile(url, defaultPath);
    return defaultPath;
  }

  const selected = await save({
    defaultPath,
    filters: downloadFileFilters(defaultPath),
    title: "下载附件",
  });
  if (typeof selected !== "string") {
    return null;
  }

  await invoke("download_external_file", { url, path: selected });
  return selected;
}

function fileExtension(filename: string): string | undefined {
  const extension = filename.split(".").pop();
  return extension && extension !== filename ? extension : undefined;
}

function downloadFileFilters(filename: string): Array<{ name: string; extensions: string[] }> {
  const extension = fileExtension(filename);
  return extension ? [{ name: extension.toUpperCase(), extensions: [extension] }] : [];
}

function safeDownloadFileName(filename: string): string {
  return filename.trim().replace(/[\\/:*?"<>|\r\n\t]+/g, "-").replace(/^-+|-+$/g, "");
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return safeDownloadFileName(decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? ""));
  } catch {
    return safeDownloadFileName(url.split("/").filter(Boolean).pop() ?? "");
  }
}

function browserDocumentKey(relativePath: string): string {
  return `yuque-lake-notes.browser-doc:${relativePath}`;
}

function saveBrowserWorkspace(workspace: WorkspacePayload): void {
  window.localStorage.setItem(browserWorkspaceKey, JSON.stringify(workspace));
}

function downloadBrowserFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadBrowserRemoteFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      downloadBrowserFile(filename, await response.blob());
      return;
    }
  } catch {
    // 跨域资源可能不允许 fetch，退回到带 download 文件名的链接。
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.click();
}

function printBrowserHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  document.body.append(frame);
}

function normalizeBrowserWorkspace(workspace: Partial<WorkspacePayload>): WorkspacePayload {
  return {
    root: workspace.root ?? "/browser-preview",
    directories: workspace.directories ?? [],
    documents: workspace.documents ?? [],
    order: workspace.order ?? [],
  };
}

function resolveBrowserMovedItem(
  workspace: WorkspacePayload,
  input: MoveWorkspaceItemInput,
): {
  kind: "folder" | "document";
  sourcePath: string;
  targetParentPath: string;
  targetPath: string;
} {
  const [kind, sourcePath] = parseBrowserItemId(input.sourceId);
  const targetParentPath = input.targetParentPath.trim().replace(/^\/+|\/+$/g, "");
  if (kind === "folder" && isSameOrChildPath(targetParentPath, sourcePath)) {
    throw new Error("不能把目录移动到自身或子目录内");
  }

  const sourceExists = kind === "folder"
    ? workspace.directories.some((directory) => directory.path === sourcePath)
    : workspace.documents.some((document) => document.path === sourcePath);
  if (!sourceExists) {
    throw new Error(`移动源不存在：${input.sourceId}`);
  }

  const targetParentExists = !targetParentPath ||
    workspace.directories.some((directory) => directory.path === targetParentPath);
  if (!targetParentExists) {
    throw new Error(`拖拽目标不存在：${targetParentPath}`);
  }

  const targetPath = targetParentPath ? `${targetParentPath}/${pathBasename(sourcePath)}` : pathBasename(sourcePath);
  if (targetPath !== sourcePath) {
    const targetExists = kind === "folder"
      ? workspace.directories.some((directory) => directory.path === targetPath)
      : workspace.documents.some((document) => document.path === targetPath);
    if (targetExists) {
      throw new Error(`目标位置已存在同名项目：${targetPath}`);
    }
  }

  return {
    kind,
    sourcePath,
    targetParentPath,
    targetPath,
  };
}

function parseBrowserItemId(itemId: string): ["folder" | "document", string] {
  const separatorIndex = itemId.indexOf(":");
  const kind = itemId.slice(0, separatorIndex);
  const path = itemId.slice(separatorIndex + 1);
  if (separatorIndex < 0 || !path) {
    throw new Error("无效的移动源");
  }
  if (kind !== "folder" && kind !== "document") {
    throw new Error("无效的移动源类型");
  }
  return [kind, path];
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

function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
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
