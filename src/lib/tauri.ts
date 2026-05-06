import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  BackupKeyStatus,
  BackupOperationOutput,
  BackupRecord,
  CreateBackupInput,
  DatabaseLocationSettings,
  DeleteBackupInput,
  DeleteBackupOutput,
  FileDownloadInput,
  OssSettings,
  RestoreBackupInput,
  RestoreBackupOutput,
  ResourceKeyStatus,
  UploadImageInput,
  UploadImageOutput,
} from "../app/appState";
import type {
  CreateDocumentPayload,
  MoveWorkspaceItemInput,
  WorkspaceDirectory,
  WorkspaceDocumentKind,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import { createEmptySpreadsheetWorkbookData } from "../features/spreadsheet/spreadsheetDocument";
import { serializeSpreadsheetSnapshot } from "../features/spreadsheet/spreadsheetSnapshot";

const browserWorkspaceKey = "yuque-lake-notes.browser-workspace";
const browserSettingsKey = "yuque-lake-notes.browser-oss-settings";
const browserDatabaseLocationKey = "yuque-lake-notes.browser-database-location";
const browserBackupKeyStatusKey = "yuque-lake-notes.browser-backup-key-status";
const browserResourceKeyStatusKey = "yuque-lake-notes.browser-resource-key-status";
const browserBackupsKey = "yuque-lake-notes.browser-backups";

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

export async function chooseDatabaseDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return "/browser-preview/database";
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择数据库目录",
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
    const path = nextBrowserDocumentPath(title, parentPath, workspace.documents.map((document) => document.path), "lake");
    const createdDocument = {
      id: path,
      path,
      name: pathBasename(path).replace(/\.lake$/i, ""),
      parentPath,
      kind: "lake" as const,
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

export async function createSpreadsheetDocument(title: string, parentPath = ""): Promise<CreateDocumentPayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const path = nextBrowserDocumentPath(title, parentPath, workspace.documents.map((document) => document.path), "spreadsheet");
    const content = serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData(title || "未命名表格"));
    const createdDocument = {
      id: path,
      path,
      name: pathBasename(path).replace(/\.json$/i, ""),
      parentPath,
      kind: "spreadsheet" as const,
      size: new Blob([content]).size,
    };
    const payload: CreateDocumentPayload = {
      root: workspace.root,
      directories: workspace.directories,
      documents: [...workspace.documents, createdDocument],
      order: [...workspace.order, `document:${path}`],
      createdDocument,
    };
    saveBrowserWorkspace(payload);
    window.localStorage.setItem(browserDocumentKey(createdDocument.path), content);
    return payload;
  }

  return invoke<CreateDocumentPayload>("create_spreadsheet_document", { title, parentPath });
}

export async function renameLakeDocument(relativePath: string, title: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return renameBrowserDocument(relativePath, title, "lake");
  }

  return invoke<WorkspacePayload>("rename_lake_document", { relativePath, title });
}

export async function renameSpreadsheetDocument(relativePath: string, title: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return renameBrowserDocument(relativePath, title, "spreadsheet");
  }

  return invoke<WorkspacePayload>("rename_spreadsheet_document", { relativePath, title });
}

export async function deleteLakeDocument(relativePath: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return deleteBrowserDocument(relativePath);
  }

  return invoke<WorkspacePayload>("delete_lake_document", { relativePath });
}

export async function deleteSpreadsheetDocument(relativePath: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return deleteBrowserDocument(relativePath);
  }

  return invoke<WorkspacePayload>("delete_spreadsheet_document", { relativePath });
}

function nextBrowserDocumentPath(
  title: string,
  parentPath: string,
  existingPaths: string[],
  kind: WorkspaceDocumentKind,
): string {
  const takenPaths = new Set(existingPaths);
  const baseName = safeBrowserName(title || (kind === "spreadsheet" ? "未命名表格" : "未命名文档"));
  const extension = kind === "spreadsheet" ? "json" : "lake";
  let candidate = parentPath ? `${parentPath}/${baseName}.${extension}` : `${baseName}.${extension}`;
  let counter = 2;

  while (takenPaths.has(candidate)) {
    candidate = parentPath ? `${parentPath}/${baseName}-${counter}.${extension}` : `${baseName}-${counter}.${extension}`;
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

export async function readSpreadsheetDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return window.localStorage.getItem(browserDocumentKey(relativePath)) ?? serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData());
  }

  return invoke<string>("read_spreadsheet_document", { relativePath });
}

export async function writeSpreadsheetDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.localStorage.setItem(browserDocumentKey(relativePath), content);
    return;
  }

  await invoke("write_spreadsheet_document", { relativePath, content });
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

export async function getDatabaseLocation(): Promise<DatabaseLocationSettings> {
  if (!isTauriRuntime()) {
    const stored = window.localStorage.getItem(browserDatabaseLocationKey);
    return stored
      ? (JSON.parse(stored) as DatabaseLocationSettings)
      : {
          directory: "/browser-preview/database",
          databasePath: "/browser-preview/database/yuque-lake-notes.sqlite3",
          custom: false,
        };
  }

  return invoke<DatabaseLocationSettings>("get_database_location");
}

export async function saveDatabaseLocation(directory: string): Promise<DatabaseLocationSettings> {
  if (!isTauriRuntime()) {
    const settings: DatabaseLocationSettings = {
      directory,
      databasePath: `${directory.replace(/\/$/, "")}/yuque-lake-notes.sqlite3`,
      custom: true,
    };
    window.localStorage.setItem(browserDatabaseLocationKey, JSON.stringify(settings));
    return settings;
  }

  return invoke<DatabaseLocationSettings>("save_database_location_settings", { input: { directory } });
}

export async function getBackupKeyStatus(): Promise<BackupKeyStatus> {
  if (!isTauriRuntime()) {
    return readBrowserBackupKeyStatus();
  }

  return invoke<BackupKeyStatus>("get_backup_key_status");
}

export async function verifyBackupKeyStatus(): Promise<BackupKeyStatus> {
  if (!isTauriRuntime()) {
    return readBrowserBackupKeyStatus();
  }

  return invoke<BackupKeyStatus>("verify_backup_key_status");
}

export async function setBackupKey(secret: string): Promise<BackupKeyStatus> {
  if (!isTauriRuntime()) {
    const status: BackupKeyStatus = {
      configured: true,
      needsKey: false,
      fingerprint: browserFingerprint(secret),
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(browserBackupKeyStatusKey, JSON.stringify(status));
    return status;
  }

  return invoke<BackupKeyStatus>("set_backup_key", { input: { secret } });
}

export async function resetBackupKey(secret: string): Promise<BackupKeyStatus> {
  if (!isTauriRuntime()) {
    return setBackupKey(secret);
  }

  return invoke<BackupKeyStatus>("reset_backup_key", { input: { secret, confirmReset: true } });
}

export async function getResourceKeyStatus(): Promise<ResourceKeyStatus> {
  if (!isTauriRuntime()) {
    return readBrowserResourceKeyStatus();
  }

  return invoke<ResourceKeyStatus>("get_resource_key_status");
}

export async function verifyResourceKeyStatus(): Promise<ResourceKeyStatus> {
  if (!isTauriRuntime()) {
    return readBrowserResourceKeyStatus();
  }

  return invoke<ResourceKeyStatus>("verify_resource_key_status");
}

export async function setResourceKey(secret: string): Promise<ResourceKeyStatus> {
  if (!isTauriRuntime()) {
    const fingerprint = browserFingerprint(secret);
    const status: ResourceKeyStatus = {
      configured: true,
      needsKey: false,
      fingerprint,
      createdAt: new Date().toISOString(),
      knownFingerprints: [fingerprint],
    };
    window.localStorage.setItem(browserResourceKeyStatusKey, JSON.stringify(status));
    return status;
  }

  return invoke<ResourceKeyStatus>("set_resource_key", { input: { secret } });
}

export async function resetResourceKey(secret: string): Promise<ResourceKeyStatus> {
  if (!isTauriRuntime()) {
    return setResourceKey(secret);
  }

  return invoke<ResourceKeyStatus>("reset_resource_key", { input: { secret, confirmReset: true } });
}

export async function listBackups(): Promise<BackupRecord[]> {
  if (!isTauriRuntime()) {
    return readBrowserBackups();
  }

  return invoke<BackupRecord[]>("list_backups");
}

export async function createBackup(input: CreateBackupInput): Promise<BackupOperationOutput> {
  if (!isTauriRuntime()) {
    const status = readBrowserBackupKeyStatus();
    if (!status.configured || !status.fingerprint) {
      throw new Error("请先设置备份加密密钥");
    }
    const existing = readBrowserBackups();
    const record: BackupRecord = {
      id: crypto.randomUUID(),
      backupType: input.forceFull || existing.length === 0 ? "full" : "incremental",
      createdAt: new Date().toISOString(),
      baseBackupId: input.forceFull || existing.length === 0 ? undefined : existing[0].id,
      keyFingerprint: status.fingerprint,
      encryptedSize: 1024,
      archiveHash: "browser-preview",
      objectKey: "browser-preview.ylbackup",
      canRestore: true,
    };
    const backups = [record, ...existing];
    window.localStorage.setItem(browserBackupsKey, JSON.stringify(backups));
    return { record, warnings: [] };
  }

  return invoke<BackupOperationOutput>("create_backup", { input });
}

export async function restoreBackup(input: RestoreBackupInput): Promise<RestoreBackupOutput> {
  if (!isTauriRuntime()) {
    return {
      restoredBackupId: input.backupId,
      restoredAt: new Date().toISOString(),
      requiresRestart: false,
      warnings: [],
    };
  }

  return invoke<RestoreBackupOutput>("restore_backup", { input });
}

export async function deleteBackup(input: DeleteBackupInput): Promise<DeleteBackupOutput> {
  if (!isTauriRuntime()) {
    const existing = readBrowserBackups();
    const idsToDelete = collectBackupIdsToDelete(existing, input.backupId);
    window.localStorage.setItem(
      browserBackupsKey,
      JSON.stringify(existing.filter((record) => !idsToDelete.includes(record.id))),
    );
    return { deletedBackupIds: idsToDelete };
  }

  return invoke<DeleteBackupOutput>("delete_backup", { input });
}

export async function uploadImage(input: UploadImageInput): Promise<UploadImageOutput> {
  if (!isTauriRuntime()) {
    const resourceRef = `yuque-resource://browser/images/${encodeURIComponent(input.filename)}?kind=image&name=${encodeURIComponent(input.filename)}&size=${input.bytes.length}`;
    return {
      url: resourceRef,
      size: input.bytes.length,
      filename: input.filename,
      extname: fileExtension(input.filename),
      resourceRef,
      previewUrl: `https://oss-preview.local/images/${encodeURIComponent(input.filename)}`,
    };
  }

  return normalizeUploadOutputPreview(await invoke<UploadImageOutput>("upload_image", { input }));
}

export async function uploadFile(input: UploadImageInput): Promise<UploadImageOutput> {
  if (!isTauriRuntime()) {
    const resourceRef = `yuque-resource://browser/files/${encodeURIComponent(input.filename)}?kind=file&name=${encodeURIComponent(input.filename)}&size=${input.bytes.length}`;
    return {
      url: resourceRef,
      size: input.bytes.length,
      filename: input.filename,
      extname: fileExtension(input.filename),
      resourceRef,
      previewUrl: `https://oss-preview.local/files/${encodeURIComponent(input.filename)}`,
    };
  }

  return normalizeUploadOutputPreview(await invoke<UploadImageOutput>("upload_file", { input }));
}

export async function prepareResourcePreview(resourceRef: string): Promise<string> {
  if (!isTauriRuntime()) {
    return resourceRef;
  }

  const output = await invoke<{ previewUrl: string; localPath: string; dataUrl?: string }>("prepare_resource_preview", {
    input: { resourceRef },
  });
  if (output.dataUrl) {
    return output.dataUrl;
  }
  return convertFileSrc(output.localPath);
}

export async function createTemporaryResourceUrl(
  resourceRef: string,
  ttlSeconds: number,
  filename?: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return `${resourceRef}${resourceRef.includes("?") ? "&" : "?"}signed=preview&ttl=${ttlSeconds}`;
  }

  const output = await invoke<{ url: string }>("create_temporary_resource_url", {
    input: { resourceRef, ttlSeconds, filename },
  });
  return output.url;
}

export async function readResourceBytes(resourceRef: string): Promise<Uint8Array> {
  if (!isTauriRuntime()) {
    return new TextEncoder().encode(resourceRef);
  }

  const bytes = await invoke<number[]>("read_resource_bytes", {
    input: { resourceRef },
  });
  return new Uint8Array(bytes);
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

export async function downloadResourceFile(input: FileDownloadInput): Promise<string | null> {
  if (!input.resourceRef) {
    return downloadExternalFile(input.url, input.filename);
  }

  const defaultPath = safeDownloadFileName(input.filename) || "附件";
  if (!isTauriRuntime()) {
    await downloadBrowserRemoteFile(input.url, defaultPath);
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

  await invoke("download_resource", { input: { resourceRef: input.resourceRef, path: selected } });
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

function readBrowserBackupKeyStatus(): BackupKeyStatus {
  const stored = window.localStorage.getItem(browserBackupKeyStatusKey);
  return stored
    ? JSON.parse(stored) as BackupKeyStatus
    : { configured: false, needsKey: false };
}

function readBrowserResourceKeyStatus(): ResourceKeyStatus {
  const stored = window.localStorage.getItem(browserResourceKeyStatusKey);
  return stored
    ? JSON.parse(stored) as ResourceKeyStatus
    : { configured: false, needsKey: false, knownFingerprints: [] };
}

function readBrowserBackups(): BackupRecord[] {
  const stored = window.localStorage.getItem(browserBackupsKey);
  return stored ? JSON.parse(stored) as BackupRecord[] : [];
}

function collectBackupIdsToDelete(backups: BackupRecord[], backupId: string): string[] {
  const pending = [backupId];
  const ids: string[] = [];
  while (pending.length > 0) {
    const currentId = pending.pop()!;
    if (ids.includes(currentId)) {
      continue;
    }
    ids.push(currentId);
    pending.push(...backups
      .filter((record) => record.baseBackupId === currentId)
      .map((record) => record.id));
  }
  return ids;
}

function browserFingerprint(secret: string): string {
  let hash = 0;
  for (const char of secret) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return `browser-${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function normalizeUploadOutputPreview(output: UploadImageOutput): UploadImageOutput {
  if (!output.previewUrl || output.previewUrl === output.resourceRef || output.previewUrl.startsWith("http")) {
    return output;
  }
  return {
    ...output,
    previewUrl: convertFileSrc(output.previewUrl),
  };
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

async function renameBrowserDocument(
  relativePath: string,
  title: string,
  kind: WorkspaceDocumentKind,
): Promise<WorkspacePayload> {
  const workspace = await listLakeDocuments();
  const document = workspace.documents.find((entry) => entry.path === relativePath);
  if (!document) {
    return workspace;
  }
  const safeTitle = safeBrowserName(title);
  const extension = kind === "spreadsheet" ? "json" : "lake";
  const nextPath = document.parentPath ? `${document.parentPath}/${safeTitle}.${extension}` : `${safeTitle}.${extension}`;
  moveBrowserDocument(relativePath, nextPath);
  const payload = {
    ...workspace,
    documents: workspace.documents.map((entry) => entry.path === relativePath ? {
      ...entry,
      id: nextPath,
      path: nextPath,
      name: safeTitle,
      kind,
    } : entry),
    order: workspace.order.map((itemId) => itemId === `document:${relativePath}` ? `document:${nextPath}` : itemId),
  };
  saveBrowserWorkspace(payload);
  return payload;
}

async function deleteBrowserDocument(relativePath: string): Promise<WorkspacePayload> {
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
    documents: (workspace.documents ?? []).map((document) => ({
      ...document,
      kind: document.kind ?? (document.path.toLowerCase().endsWith(".json") ? "spreadsheet" : "lake"),
    })),
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
