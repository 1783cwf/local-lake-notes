import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  AiAddModelInput,
  AiListModelsInput,
  AiListModelsOutput,
  AiRunDocumentActionInput,
  AiRunDocumentActionOutput,
  AiRunSpreadsheetActionInput,
  AiRunSpreadsheetActionOutput,
  AiRunTableActionInput,
  AiRunTableActionOutput,
  AiSetActiveModelInput,
  AiSettings,
  AiSplitDocumentInput,
  AiSplitDocumentOutput,
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
  ResourceMigrationAnalysisOutput,
  ResourceMigrationInput,
  ResourceMigrationRunOutput,
  ResourceKeyStatus,
  SaveAiSettingsInput,
  StorageConnectionTestOutput,
  UploadImageInput,
  UploadImageOutput,
} from "../app/appState";
import type {
  CreateDocumentPayload,
  KnownWorkspace,
  MoveWorkspaceItemInput,
  WorkspaceDirectory,
  WorkspaceDocumentKind,
  WorkspacePayload,
} from "../features/workspace/workspaceStore";
import { createEmptySpreadsheetWorkbookData } from "../features/spreadsheet/spreadsheetDocument";
import { serializeSpreadsheetSnapshot } from "../features/spreadsheet/spreadsheetSnapshot";
import {
  createDefaultMultidimensionalTableDocument,
  MULTIDIMENSIONAL_TABLE_EXTENSION,
  serializeMultidimensionalTableDocument,
} from "../features/multidimensional-table/multidimensionalTableDocument";
import { mergeAiSettings } from "../features/settings/aiSettingsStore";
import { mergeOssSettings } from "../features/settings/ossSettingsStore";

const browserWorkspaceKey = "yuque-lake-notes.browser-workspace";
const browserCurrentWorkspaceRootKey = "yuque-lake-notes.browser-current-workspace-root";
const browserKnownWorkspacesKey = "yuque-lake-notes.browser-known-workspaces";
const browserSettingsKey = "yuque-lake-notes.browser-oss-settings";
const browserAiSettingsKey = "yuque-lake-notes.browser-ai-settings";
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

export async function chooseStorageDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return "/browser-preview/storage";
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择文件存储目录",
  });

  return typeof selected === "string" ? selected : null;
}

export async function getRecentWorkspace(): Promise<WorkspacePayload | null> {
  if (!isTauriRuntime()) {
    migrateLegacyBrowserWorkspace();
    const root = window.localStorage.getItem(browserCurrentWorkspaceRootKey);
    return root ? readBrowserWorkspace(root) : null;
  }

  return invoke<WorkspacePayload | null>("get_recent_workspace");
}

export async function setWorkspaceRoot(path: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const payload = readBrowserWorkspace(path) ?? emptyBrowserWorkspace(path);
    return saveBrowserWorkspace(payload);
  }

  return invoke<WorkspacePayload>("set_workspace_root", { path });
}

export async function createWorkspaceRoot(parentPath: string, name: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const root = `${parentPath.replace(/\/+$/, "")}/${safeBrowserWorkspaceName(name)}`;
    if (readBrowserWorkspace(root)) {
      throw new Error("无效的文件名");
    }
    return saveBrowserWorkspace(emptyBrowserWorkspace(root));
  }

  return invoke<WorkspacePayload>("create_workspace_root", { parentPath, name });
}

export async function listKnownWorkspaces(): Promise<KnownWorkspace[]> {
  if (!isTauriRuntime()) {
    migrateLegacyBrowserWorkspace();
    return readBrowserKnownWorkspaces();
  }

  return invoke<KnownWorkspace[]>("list_known_workspaces");
}

export async function forgetWorkspaceRoot(path: string): Promise<KnownWorkspace[]> {
  if (!isTauriRuntime()) {
    migrateLegacyBrowserWorkspace();
    const knownWorkspaces = readBrowserKnownWorkspaces()
      .filter((workspace) => workspace.root !== path);
    writeBrowserKnownWorkspaces(knownWorkspaces);
    window.localStorage.removeItem(browserWorkspacePayloadKey(path));
    if (window.localStorage.getItem(browserCurrentWorkspaceRootKey) === path) {
      window.localStorage.removeItem(browserCurrentWorkspaceRootKey);
    }
    return knownWorkspaces;
  }

  return invoke<KnownWorkspace[]>("forget_workspace_root", { path });
}

export async function listLakeDocuments(): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    migrateLegacyBrowserWorkspace();
    const root = window.localStorage.getItem(browserCurrentWorkspaceRootKey);
    if (!root) {
      return saveBrowserWorkspace(emptyBrowserWorkspace("/browser-preview"));
    }
    return readBrowserWorkspace(root) ?? saveBrowserWorkspace(emptyBrowserWorkspace(root));
  }

  return invoke<WorkspacePayload>("list_lake_documents");
}

export async function renameWorkspace(name: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const payload = { ...workspace, root: `/browser-preview/${safeBrowserName(name)}` };
    moveBrowserWorkspaceDocumentKeys(workspace, payload.root);
    removeBrowserWorkspace(workspace.root);
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
          moveBrowserDocument(workspace.root, document.path, nextDocumentPath);
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
          removeBrowserDocument(workspace.root, document.path);
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
    const nextDirectories = ensureBrowserMoveTargetDirectory(workspace, workspace.directories, movedItem);
    const payload: WorkspacePayload = {
      ...workspace,
      directories: nextDirectories.map((directory) => {
        if (!pathMovesWithBrowserItem(directory.path, movedItem)) {
          return directory;
        }
        const path = rewriteBrowserMovedPath(directory.path, movedItem);
        return {
          ...directory,
          id: path,
          path,
          parentPath: directory.path === movedItem.sourcePath || directory.path === movedItem.sourceChildContainerPath
            ? movedItem.targetParentPath
            : rewriteBrowserMovedPath(directory.parentPath, movedItem),
        };
      }),
      documents: workspace.documents.map((document) => {
        if (!pathMovesWithBrowserItem(document.path, movedItem)) {
          return document;
        }
        const path = rewriteBrowserMovedPath(document.path, movedItem);
        moveBrowserDocument(workspace.root, document.path, path);
        return {
          ...document,
          id: path,
          path,
          parentPath: document.path === movedItem.sourcePath
            ? movedItem.targetParentPath
            : rewriteBrowserMovedPath(document.parentPath, movedItem),
        };
      }),
      order: input.order.map((itemId) => replaceMovedOrderedItemPath(itemId, movedItem)),
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
    const parentDirectory = parentPath && !workspace.directories.some((directory) => directory.path === parentPath)
      ? {
          id: parentPath,
          path: parentPath,
          name: pathBasename(parentPath),
          parentPath: parentDirname(parentPath),
          isDocumentChildContainer: true,
        }
      : null;
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
      directories: parentDirectory ? [...workspace.directories, parentDirectory] : workspace.directories,
      documents: [...workspace.documents, createdDocument],
      order: [...workspace.order, ...(parentDirectory ? [`folder:${parentPath}`] : []), `document:${path}`],
      createdDocument,
    };
    saveBrowserWorkspace(payload);
    writeBrowserDocument(workspace.root, createdDocument.path, "<p><span class=\"ne-text\"> </span></p>");
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
    writeBrowserDocument(workspace.root, createdDocument.path, content);
    return payload;
  }

  return invoke<CreateDocumentPayload>("create_spreadsheet_document", { title, parentPath });
}

export async function createMultidimensionalTableDocument(title: string, parentPath = ""): Promise<CreateDocumentPayload> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    const path = nextBrowserDocumentPath(title, parentPath, workspace.documents.map((document) => document.path), "multidimensional-table");
    const content = serializeMultidimensionalTableDocument(createDefaultMultidimensionalTableDocument());
    const createdDocument = {
      id: path,
      path,
      name: pathBasename(path).replace(/\.dbtable\.json$/i, ""),
      parentPath,
      kind: "multidimensional-table" as const,
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
    writeBrowserDocument(workspace.root, createdDocument.path, content);
    return payload;
  }

  return invoke<CreateDocumentPayload>("create_multidimensional_table_document", { title, parentPath });
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

export async function renameMultidimensionalTableDocument(relativePath: string, title: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return renameBrowserDocument(relativePath, title, "multidimensional-table");
  }

  return invoke<WorkspacePayload>("rename_multidimensional_table_document", { relativePath, title });
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

export async function deleteMultidimensionalTableDocument(relativePath: string): Promise<WorkspacePayload> {
  if (!isTauriRuntime()) {
    return deleteBrowserDocument(relativePath);
  }

  return invoke<WorkspacePayload>("delete_multidimensional_table_document", { relativePath });
}

function nextBrowserDocumentPath(
  title: string,
  parentPath: string,
  existingPaths: string[],
  kind: WorkspaceDocumentKind,
): string {
  const takenPaths = new Set(existingPaths);
  const baseName = safeBrowserName(title || defaultBrowserTitle(kind));
  const extension = browserDocumentExtension(kind);
  let candidate = parentPath ? `${parentPath}/${baseName}${extension}` : `${baseName}${extension}`;
  let counter = 2;

  while (takenPaths.has(candidate)) {
    candidate = parentPath ? `${parentPath}/${baseName}-${counter}${extension}` : `${baseName}-${counter}${extension}`;
    counter += 1;
  }

  return candidate;
}

export async function readLakeDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return readBrowserDocument(relativePath) ?? "";
  }

  return invoke<string>("read_lake_document", { relativePath });
}

export async function writeLakeDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    writeBrowserDocument(workspace.root, relativePath, content);
    return;
  }

  await invoke("write_lake_document", { relativePath, content });
}

export async function readSpreadsheetDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return readBrowserDocument(relativePath) ?? serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData());
  }

  return invoke<string>("read_spreadsheet_document", { relativePath });
}

export async function readMultidimensionalTableDocument(relativePath: string): Promise<string> {
  if (!isTauriRuntime()) {
    return readBrowserDocument(relativePath) ??
      serializeMultidimensionalTableDocument(createDefaultMultidimensionalTableDocument());
  }

  return invoke<string>("read_multidimensional_table_document", { relativePath });
}

export async function writeSpreadsheetDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    writeBrowserDocument(workspace.root, relativePath, content);
    return;
  }

  await invoke("write_spreadsheet_document", { relativePath, content });
}

export async function writeMultidimensionalTableDocument(relativePath: string, content: string): Promise<void> {
  if (!isTauriRuntime()) {
    const workspace = await listLakeDocuments();
    writeBrowserDocument(workspace.root, relativePath, content);
    return;
  }

  await invoke("write_multidimensional_table_document", { relativePath, content });
}

export interface SelectedExcelFile {
  path: string;
  name: string;
  bytes: Uint8Array;
}

export async function chooseExcelImportFile(): Promise<SelectedExcelFile | null> {
  if (!isTauriRuntime()) {
    const selected = await chooseBrowserFile([".xlsx"]);
    if (!selected) {
      return null;
    }
    return {
      path: selected.name,
      name: selected.name,
      bytes: new Uint8Array(await selected.arrayBuffer()),
    };
  }

  const selected = await open({
    multiple: false,
    title: "导入 Excel 表格",
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (typeof selected !== "string") {
    return null;
  }

  const bytes = await invoke<number[]>("read_external_excel_file", { path: selected });
  return {
    path: selected,
    name: pathBasename(selected),
    bytes: new Uint8Array(bytes),
  };
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
    return stored ? mergeOssSettings(JSON.parse(stored) as OssSettings) : null;
  }

  return invoke<OssSettings | null>("get_oss_settings");
}

export async function saveOssSettings(settings: OssSettings): Promise<OssSettings> {
  const normalized = mergeOssSettings(settings);
  if (!isTauriRuntime()) {
    window.localStorage.setItem(browserSettingsKey, JSON.stringify(normalized));
    return normalized;
  }

  return invoke<OssSettings>("save_oss_settings", { settings: normalized });
}

export async function testStorageConnection(settings: OssSettings): Promise<StorageConnectionTestOutput> {
  const normalized = mergeOssSettings(settings);
  if (!isTauriRuntime()) {
    return {
      provider: normalized.activeProvider,
      storageId: activeStorageId(normalized),
      ok: true,
      message: "浏览器预览环境已跳过真实连接测试",
    };
  }

  return invoke<StorageConnectionTestOutput>("test_storage_connection", { settings: normalized });
}

export async function getAiSettings(): Promise<AiSettings> {
  if (!isTauriRuntime()) {
    const stored = window.localStorage.getItem(browserAiSettingsKey);
    return mergeAiSettings(stored ? JSON.parse(stored) as AiSettings : null);
  }

  return invoke<AiSettings>("get_ai_settings");
}

export async function saveAiSettings(input: SaveAiSettingsInput): Promise<AiSettings> {
  const settings = mergeAiSettings(input.settings);
  if (!isTauriRuntime()) {
    const secretProfileIds = new Set((input.apiKeys ?? []).map((key) => key.profileId));
    const sanitized: AiSettings = {
      ...settings,
      profiles: settings.profiles.map((profile) => ({
        ...profile,
        hasApiKey: profile.hasApiKey || secretProfileIds.has(profile.id),
      })),
    };
    window.localStorage.setItem(browserAiSettingsKey, JSON.stringify(sanitized));
    return sanitized;
  }

  return invoke<AiSettings>("save_ai_settings", {
    input: {
      ...input,
      settings,
    },
  });
}

export async function listAiModels(input: AiListModelsInput): Promise<AiListModelsOutput> {
  if (!isTauriRuntime()) {
    const settings = await getAiSettings();
    const profile = settings.profiles.find((item) => item.id === input.profileId);
    if (!profile?.hasApiKey) {
      throw new Error("请先保存模型 API Key");
    }
    return { profileId: input.profileId, models: [] };
  }

  return invoke<AiListModelsOutput>("list_ai_models", { input });
}

export async function addAiModelToProfile(input: AiAddModelInput): Promise<AiSettings> {
  if (!isTauriRuntime()) {
    const settings = await getAiSettings();
    const nextSettings = mergeAiSettings({
      ...settings,
      profiles: settings.profiles.map((profile) => {
        if (profile.id !== input.profileId) {
          return profile;
        }
        const model = {
          id: `${profile.id}:${input.modelId}`,
          profileId: profile.id,
          modelId: input.modelId,
          displayName: input.displayName || input.modelId,
          protocol: profile.protocol,
          enabled: true,
          capabilityTypes: input.capabilityTypes,
          supportedInputModalities: input.capabilityTypes.includes("vision")
            ? ["text" as const, "image" as const]
            : ["text" as const],
        };
        return {
          ...profile,
          models: [...profile.models.filter((item) => item.id !== model.id), model],
        };
      }),
    });
    window.localStorage.setItem(browserAiSettingsKey, JSON.stringify(nextSettings));
    return nextSettings;
  }

  return invoke<AiSettings>("add_ai_model_to_profile", { input });
}

export async function setActiveAiModel(input: AiSetActiveModelInput): Promise<AiSettings> {
  if (!isTauriRuntime()) {
    const settings = await getAiSettings();
    const nextSettings = mergeAiSettings({
      ...settings,
      activeModelId: input.configuredModelId || undefined,
    });
    window.localStorage.setItem(browserAiSettingsKey, JSON.stringify(nextSettings));
    return nextSettings;
  }

  return invoke<AiSettings>("set_active_ai_model", { input });
}

export async function runAiDocumentAction(input: AiRunDocumentActionInput): Promise<AiRunDocumentActionOutput> {
  if (!isTauriRuntime()) {
    const previewMode = previewModeForBrowserAction(input.actionType);
    return {
      actionType: input.actionType,
      title: "AI 预览",
      content: previewMode === "patch" ? "浏览器预览环境未连接真实模型，模拟追加修改。" : `浏览器预览环境未连接真实模型。\n\n${input.content.slice(0, 600)}`,
      previewMode,
      contentScope: input.contentScope,
      patch: previewMode === "patch" ? {
        summary: "模拟追加修改",
        operations: [{ type: "append-document", markdown: input.instruction || "AI 模拟修改" }],
      } : undefined,
    };
  }

  return invoke<AiRunDocumentActionOutput>("run_ai_document_action", { input });
}

export async function runAiSplitDocument(input: AiSplitDocumentInput): Promise<AiSplitDocumentOutput> {
  if (!isTauriRuntime()) {
    const baseTitle = input.documentTitle.trim() || "拆分文档";
    return {
      title: "浏览器预览拆分方案",
      parts: [
        { title: `${baseTitle}-上`, content: input.content.slice(0, 600) || "第一部分内容" },
        { title: `${baseTitle}-下`, content: input.content.slice(600, 1200) || "第二部分内容" },
      ],
    };
  }

  return invoke<AiSplitDocumentOutput>("run_ai_split_document", { input });
}

export async function runAiTableAction(input: AiRunTableActionInput): Promise<AiRunTableActionOutput> {
  if (!isTauriRuntime()) {
    const instruction = input.instruction?.trim() ?? "";
    return {
      actionType: input.actionType,
      title: "多维表格 AI 预览",
      summary: "浏览器预览环境未连接真实模型。",
      patch: input.actionType === "summarize-table" ? undefined : {
        fields: [{ name: "AI 标签", type: "multiSelect", options: ["待确认"] }],
        records: instruction ? [{ title: "待确认任务", values: { "AI 标签": ["待确认"] }, body: instruction }] : [],
        preferBoard: input.actionType === "meeting-to-task-board",
      },
    };
  }

  return invoke<AiRunTableActionOutput>("run_ai_table_action", { input });
}

export async function runAiSpreadsheetAction(input: AiRunSpreadsheetActionInput): Promise<AiRunSpreadsheetActionOutput> {
  if (!isTauriRuntime()) {
    const instruction = input.instruction?.trim() ?? "";
    return {
      actionType: input.actionType,
      title: "表格 AI 预览",
      summary: "浏览器预览环境未连接真实模型。",
      patch: input.actionType === "summarize-spreadsheet" ? undefined : input.actionType === "append-rows" ? {
        appendRows: instruction ? [[instruction, "待确认"]] : [],
      } : {
        sheets: [{ name: "AI 生成表", rows: [["内容", "状态"], [instruction || "示例内容", "待确认"]] }],
      },
    };
  }

  return invoke<AiRunSpreadsheetActionOutput>("run_ai_spreadsheet_action", { input });
}

function activeStorageId(settings: OssSettings): string {
  if (settings.activeProvider === "local") {
    return settings.local.storageId.trim() || "local";
  }
  if (settings.activeProvider === "webdav") {
    return settings.webdav.storageId.trim() || "webdav";
  }
  return settings.bucket.trim();
}

function previewModeForBrowserAction(actionType: AiRunDocumentActionInput["actionType"]): AiRunDocumentActionOutput["previewMode"] {
  return [
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
  ].includes(actionType) ? "patch" : "informational";
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

export async function analyzeResourceMigration(input: ResourceMigrationInput): Promise<ResourceMigrationAnalysisOutput> {
  if (!isTauriRuntime()) {
    return emptyBrowserResourceMigrationAnalysis();
  }

  return invoke<ResourceMigrationAnalysisOutput>("analyze_resource_migration", { input });
}

export async function runResourceMigration(input: ResourceMigrationInput): Promise<ResourceMigrationRunOutput> {
  if (!isTauriRuntime()) {
    return {
      analysis: emptyBrowserResourceMigrationAnalysis(),
      rewrittenDocuments: [],
      copiedResources: 0,
    };
  }

  return invoke<ResourceMigrationRunOutput>("run_resource_migration", { input });
}

export async function uploadImage(input: UploadImageInput): Promise<UploadImageOutput> {
  if (!isTauriRuntime()) {
    const resourceRef = buildBrowserResourceRef(input, "image");
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
    const resourceRef = buildBrowserResourceRef(input, "file");
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

function buildBrowserResourceRef(input: UploadImageInput, kind: "image" | "file"): string {
  const stored = window.localStorage.getItem(browserSettingsKey);
  const settings = mergeOssSettings(stored ? JSON.parse(stored) as OssSettings : null);
  const storageId = browserStorageId(settings);
  const prefix = kind === "image" ? settings.imagePrefix : settings.filePrefix;
  const key = `${trimSlashes(prefix)}/${encodeURIComponent(input.filename)}`;
  const url = new URL(`yuque-resource://${encodeURIComponent(storageId)}/${key}`);
  url.searchParams.set("kind", kind);
  url.searchParams.set("name", input.filename);
  url.searchParams.set("size", String(input.bytes.length));
  url.searchParams.set("provider", settings.activeProvider === "s3" ? "s3" : settings.activeProvider);
  if (input.mimeType) {
    url.searchParams.set("type", input.mimeType);
  }
  return url.toString();
}

function emptyBrowserResourceMigrationAnalysis(): ResourceMigrationAnalysisOutput {
  return {
    totalReferences: 0,
    uniqueResources: 0,
    documentCount: 0,
    totalBytes: 0,
    migratedResources: [],
    skippedResources: [],
    unreadableResources: [],
    conflictResources: [],
  };
}

function browserStorageId(settings: OssSettings): string {
  if (settings.activeProvider === "local") {
    return settings.local.storageId.trim() || "local";
  }
  if (settings.activeProvider === "webdav") {
    return settings.webdav.storageId.trim() || "webdav";
  }
  return settings.bucket.trim() || "browser";
}

function trimSlashes(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "") || "files";
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

function browserWorkspacePayloadKey(root: string): string {
  return `yuque-lake-notes.browser-workspace:${encodeURIComponent(root)}`;
}

function browserDocumentKey(root: string, relativePath: string): string {
  return `yuque-lake-notes.browser-doc:${encodeURIComponent(root)}:${relativePath}`;
}

function legacyBrowserDocumentKey(relativePath: string): string {
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
  const extension = browserDocumentExtension(kind);
  const nextPath = document.parentPath ? `${document.parentPath}/${safeTitle}${extension}` : `${safeTitle}${extension}`;
  moveBrowserDocument(workspace.root, relativePath, nextPath);
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
  removeBrowserDocument(workspace.root, relativePath);
  const payload = {
    ...workspace,
    documents: workspace.documents.filter((document) => document.path !== relativePath),
    order: workspace.order.filter((itemId) => itemId !== `document:${relativePath}`),
  };
  saveBrowserWorkspace(payload);
  return payload;
}

function saveBrowserWorkspace(workspace: WorkspacePayload): WorkspacePayload {
  const normalized = normalizeBrowserWorkspace(workspace);
  window.localStorage.setItem(browserWorkspacePayloadKey(normalized.root), JSON.stringify(normalized));
  window.localStorage.setItem(browserCurrentWorkspaceRootKey, normalized.root);
  upsertBrowserKnownWorkspace(normalized.root);
  return normalized;
}

function readBrowserWorkspace(root: string): WorkspacePayload | null {
  migrateLegacyBrowserWorkspace();
  const stored = window.localStorage.getItem(browserWorkspacePayloadKey(root));
  return stored ? normalizeBrowserWorkspace(JSON.parse(stored) as Partial<WorkspacePayload>) : null;
}

function emptyBrowserWorkspace(root: string): WorkspacePayload {
  return {
    root,
    directories: [],
    documents: [],
    order: [],
  };
}

function removeBrowserWorkspace(root: string): void {
  window.localStorage.removeItem(browserWorkspacePayloadKey(root));
}

function readBrowserKnownWorkspaces(): KnownWorkspace[] {
  const stored = window.localStorage.getItem(browserKnownWorkspacesKey);
  return stored ? JSON.parse(stored) as KnownWorkspace[] : [];
}

function writeBrowserKnownWorkspaces(workspaces: KnownWorkspace[]): void {
  window.localStorage.setItem(browserKnownWorkspacesKey, JSON.stringify(workspaces));
}

function upsertBrowserKnownWorkspace(root: string): void {
  const now = new Date().toISOString();
  const name = pathBasename(root) || "知识库";
  const next = [
    { root, name, lastOpenedAt: now },
    ...readBrowserKnownWorkspaces().filter((workspace) => workspace.root !== root),
  ];
  writeBrowserKnownWorkspaces(next);
}

function migrateLegacyBrowserWorkspace(): void {
  if (window.localStorage.getItem(browserCurrentWorkspaceRootKey)) {
    return;
  }

  const stored = window.localStorage.getItem(browserWorkspaceKey);
  if (!stored) {
    return;
  }

  const workspace = normalizeBrowserWorkspace(JSON.parse(stored) as Partial<WorkspacePayload>);
  window.localStorage.setItem(browserWorkspacePayloadKey(workspace.root), JSON.stringify(workspace));
  window.localStorage.setItem(browserCurrentWorkspaceRootKey, workspace.root);
  upsertBrowserKnownWorkspace(workspace.root);
}

function readBrowserDocument(relativePath: string): string | null {
  const workspace = window.localStorage.getItem(browserCurrentWorkspaceRootKey);
  if (!workspace) {
    return window.localStorage.getItem(legacyBrowserDocumentKey(relativePath));
  }
  return window.localStorage.getItem(browserDocumentKey(workspace, relativePath)) ??
    window.localStorage.getItem(legacyBrowserDocumentKey(relativePath));
}

function writeBrowserDocument(root: string, relativePath: string, content: string): void {
  window.localStorage.setItem(browserDocumentKey(root, relativePath), content);
}

function removeBrowserDocument(root: string, relativePath: string): void {
  window.localStorage.removeItem(browserDocumentKey(root, relativePath));
  window.localStorage.removeItem(legacyBrowserDocumentKey(relativePath));
}

function moveBrowserWorkspaceDocumentKeys(fromWorkspace: WorkspacePayload, toRoot: string): void {
  for (const document of fromWorkspace.documents) {
    const content = window.localStorage.getItem(browserDocumentKey(fromWorkspace.root, document.path)) ??
      window.localStorage.getItem(legacyBrowserDocumentKey(document.path));
    if (content !== null) {
      writeBrowserDocument(toRoot, document.path, content);
      removeBrowserDocument(fromWorkspace.root, document.path);
    }
  }
}

function downloadBrowserFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function chooseBrowserFile(accept: string[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
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
      kind: document.kind ?? browserDocumentKindFromPath(document.path),
    })),
    order: workspace.order ?? [],
  };
}

function defaultBrowserTitle(kind: WorkspaceDocumentKind): string {
  if (kind === "spreadsheet") {
    return "未命名表格";
  }
  if (kind === "multidimensional-table") {
    return "未命名多维表格";
  }
  return "未命名文档";
}

function browserDocumentExtension(kind: WorkspaceDocumentKind): string {
  if (kind === "spreadsheet") {
    return ".json";
  }
  if (kind === "multidimensional-table") {
    return MULTIDIMENSIONAL_TABLE_EXTENSION;
  }
  return ".lake";
}

function browserDocumentKindFromPath(path: string): WorkspaceDocumentKind {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(MULTIDIMENSIONAL_TABLE_EXTENSION)) {
    return "multidimensional-table";
  }
  return lowerPath.endsWith(".json") ? "spreadsheet" : "lake";
}

function resolveBrowserMovedItem(
  workspace: WorkspacePayload,
  input: MoveWorkspaceItemInput,
): {
  kind: "folder" | "document";
  sourcePath: string;
  sourceChildContainerPath?: string;
  targetParentPath: string;
  targetPath: string;
  targetChildContainerPath?: string;
} {
  const [kind, sourcePath] = parseBrowserItemId(input.sourceId);
  const targetParentPath = input.targetParentPath.trim().replace(/^\/+|\/+$/g, "");
  const sourceChildContainerPath = kind === "document" ? documentChildContainerPath(sourcePath) : undefined;
  const blockedPath = kind === "folder" ? sourcePath : sourceChildContainerPath;
  if (blockedPath && isSameOrChildPath(targetParentPath, blockedPath)) {
    throw new Error("不能把项目移动到自身或子级内");
  }

  const sourceExists = kind === "folder"
    ? workspace.directories.some((directory) => directory.path === sourcePath)
    : workspace.documents.some((document) => document.path === sourcePath);
  if (!sourceExists) {
    throw new Error(`移动源不存在：${input.sourceId}`);
  }

  const targetParentExists = !targetParentPath ||
    workspace.directories.some((directory) => directory.path === targetParentPath) ||
    workspace.documents.some((document) => documentChildContainerPath(document.path) === targetParentPath);
  if (!targetParentExists) {
    throw new Error(`拖拽目标不存在：${targetParentPath}`);
  }

  const targetPath = targetParentPath ? `${targetParentPath}/${pathBasename(sourcePath)}` : pathBasename(sourcePath);
  const targetChildContainerPath = kind === "document" ? documentChildContainerPath(targetPath) : undefined;
  if (targetPath !== sourcePath) {
    const targetExists = kind === "folder"
      ? workspace.directories.some((directory) => directory.path === targetPath) ||
        workspace.documents.some((document) => documentChildContainerPath(document.path) === targetPath)
      : workspace.documents.some((document) => document.path === targetPath);
    if (targetExists) {
      throw new Error(`目标位置已存在同名项目：${targetPath}`);
    }
  }

  return {
    kind,
    sourcePath,
    sourceChildContainerPath,
    targetParentPath,
    targetPath,
    targetChildContainerPath,
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

function moveBrowserDocument(root: string, fromPath: string, toPath: string): void {
  const content = window.localStorage.getItem(browserDocumentKey(root, fromPath)) ??
    window.localStorage.getItem(legacyBrowserDocumentKey(fromPath));
  if (content !== null) {
    writeBrowserDocument(root, toPath, content);
    removeBrowserDocument(root, fromPath);
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

function parentDirname(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function documentChildContainerPath(path: string): string {
  return path
    .replace(/\.dbtable\.json$/i, "")
    .replace(/\.(lake|json)$/i, "");
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

function replaceMovedOrderedItemPath(
  itemId: string,
  movedItem: {
    sourcePath: string;
    sourceChildContainerPath?: string;
    targetPath: string;
    targetChildContainerPath?: string;
  },
): string {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex < 0) {
    return itemId;
  }

  const kind = itemId.slice(0, separatorIndex);
  const path = itemId.slice(separatorIndex + 1);
  if (
    movedItem.sourceChildContainerPath &&
    movedItem.targetChildContainerPath &&
    isSameOrChildPath(path, movedItem.sourceChildContainerPath)
  ) {
    return `${kind}:${replacePathPrefix(path, movedItem.sourceChildContainerPath, movedItem.targetChildContainerPath)}`;
  }
  return isSameOrChildPath(path, movedItem.sourcePath)
    ? `${kind}:${replacePathPrefix(path, movedItem.sourcePath, movedItem.targetPath)}`
    : itemId;
}

function ensureBrowserMoveTargetDirectory(
  workspace: WorkspacePayload,
  directories: WorkspaceDirectory[],
  movedItem: {
    targetParentPath: string;
  },
): WorkspaceDirectory[] {
  if (!movedItem.targetParentPath || directories.some((directory) => directory.path === movedItem.targetParentPath)) {
    return directories;
  }
  if (!workspace.documents.some((document) => documentChildContainerPath(document.path) === movedItem.targetParentPath)) {
    throw new Error(`拖拽目标不存在：${movedItem.targetParentPath}`);
  }

  return [
    ...directories,
    {
      id: movedItem.targetParentPath,
      path: movedItem.targetParentPath,
      name: pathBasename(movedItem.targetParentPath),
      parentPath: movedItem.targetParentPath.split("/").slice(0, -1).join("/"),
    },
  ];
}

function pathMovesWithBrowserItem(
  path: string,
  movedItem: {
    sourcePath: string;
    sourceChildContainerPath?: string;
  },
): boolean {
  return isSameOrChildPath(path, movedItem.sourcePath) ||
    Boolean(movedItem.sourceChildContainerPath && isSameOrChildPath(path, movedItem.sourceChildContainerPath));
}

function rewriteBrowserMovedPath(
  path: string,
  movedItem: {
    sourcePath: string;
    sourceChildContainerPath?: string;
    targetPath: string;
    targetChildContainerPath?: string;
  },
): string {
  if (
    movedItem.sourceChildContainerPath &&
    movedItem.targetChildContainerPath &&
    isSameOrChildPath(path, movedItem.sourceChildContainerPath)
  ) {
    return replacePathPrefix(path, movedItem.sourceChildContainerPath, movedItem.targetChildContainerPath);
  }
  return replacePathPrefix(path, movedItem.sourcePath, movedItem.targetPath);
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

function safeBrowserWorkspaceName(name: string): string {
  const safeName = name.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safeName) {
    throw new Error("无效的文件名");
  }
  return safeName;
}
