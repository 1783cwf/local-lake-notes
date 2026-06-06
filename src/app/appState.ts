import type { WorkspaceDocument } from "../features/workspace/workspaceStore";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatus {
  state: SaveState;
  message?: string;
  savedAt?: string;
}

export type DocumentOpenMode = "edit" | "read";

export type CurrentDocumentState =
  | {
    kind: "lake";
    entry: WorkspaceDocument & { kind: "lake" };
    content: string;
    workspaceRoot?: string;
    mode?: DocumentOpenMode;
  }
  | {
    kind: "spreadsheet";
    entry: WorkspaceDocument & { kind: "spreadsheet" };
    content: string;
    workspaceRoot?: string;
  }
  | {
    kind: "multidimensional-table";
    entry: WorkspaceDocument & { kind: "multidimensional-table" };
    content: string;
    workspaceRoot?: string;
  };

export interface OpenDocumentTab {
  id: string;
  path: string;
  workspaceRoot?: string;
  document?: WorkspaceDocument;
  locked: boolean;
  mode?: DocumentOpenMode;
}

export interface UploadImageInput {
  bytes: number[];
  filename: string;
  mimeType?: string;
}

export interface UploadImageOutput {
  url: string;
  src?: string;
  size: number;
  filename: string;
  extname?: string;
  resourceRef?: string;
  previewUrl?: string;
}

export interface FileDownloadInput {
  url: string;
  filename: string;
  resourceRef?: string;
}

export type StorageProviderKind = "s3" | "local" | "webdav";

export interface LocalStorageSettings {
  rootDirectory: string;
  storageId: string;
}

export interface WebDavStorageSettings {
  endpoint: string;
  username: string;
  password: string;
  rootPath: string;
  storageId: string;
}

export interface OssSettings {
  activeProvider: StorageProviderKind;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
  imagePrefix: string;
  filePrefix: string;
  backupPrefix: string;
  defaultExportResourceStrategy: ExportResourceStrategy;
  defaultSignedUrlTtlSeconds: number;
  maxSignedUrlTtlSeconds: number;
  allowSignedUrlExport: boolean;
  resourcePreviewConcurrency: number;
  local: LocalStorageSettings;
  webdav: WebDavStorageSettings;
}

export interface StorageConnectionTestOutput {
  provider: StorageProviderKind;
  storageId: string;
  ok: boolean;
  message: string;
}

export type AiProtocol = "openai-responses" | "openai-chat-completions" | "anthropic-messages";

export type AiModelCapabilityType = "vision" | "web" | "reasoning" | "tool" | "rerank" | "embedding";

export type AiInputModality = "text" | "image";

export interface AiSettings {
  activeModelId?: string;
  profiles: AiModelProfile[];
}

export interface AiModelProfile {
  id: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  enabled: boolean;
  models: AiConfiguredModel[];
  hasApiKey: boolean;
}

export interface AiConfiguredModel {
  id: string;
  profileId: string;
  modelId: string;
  displayName: string;
  protocol: AiProtocol;
  enabled: boolean;
  capabilityTypes: AiModelCapabilityType[];
  supportedInputModalities: AiInputModality[];
}

export interface AiProfileApiKeyInput {
  profileId: string;
  apiKey: string;
}

export interface SaveAiSettingsInput {
  settings: AiSettings;
  apiKeys?: AiProfileApiKeyInput[];
  deletedProfileIds?: string[];
}

export interface AiListModelsInput {
  profileId: string;
}

export interface AiFetchedModel {
  modelId: string;
  displayName: string;
  capabilityTypes: AiModelCapabilityType[];
}

export interface AiListModelsOutput {
  profileId: string;
  models: AiFetchedModel[];
}

export interface AiAddModelInput {
  profileId: string;
  modelId: string;
  displayName: string;
  capabilityTypes: AiModelCapabilityType[];
}

export interface AiSetActiveModelInput {
  configuredModelId: string;
}

export type AiDocumentContentScope = "document" | "selection";

export type AiDocumentActionType =
  | "summarize-document"
  | "answer-question"
  | "generate-title"
  | "generate-abstract"
  | "generate-todos"
  | "generate-meeting-minutes"
  | "rewrite"
  | "polish"
  | "expand"
  | "compress"
  | "organize-headings"
  | "outline-to-draft"
  | "notes-to-article"
  | "long-form-structure"
  | "tech-to-tutorial"
  | "tech-to-readme"
  | "tech-to-release-notes"
  | "custom-edit"
  | "split-document";

export type AiActionPreviewMode = "informational" | "replace-document" | "patch";

export type AiDocumentPatchOperation =
  | { type: "replace-selection"; markdown: string; summary?: string }
  | { type: "insert-before"; anchor: string; markdown: string; summary?: string }
  | { type: "insert-after"; anchor: string; markdown: string; summary?: string }
  | { type: "replace-text"; anchor: string; markdown: string; summary?: string }
  | { type: "delete-text"; anchor: string; summary?: string }
  | { type: "prepend-document"; markdown: string; summary?: string }
  | { type: "append-document"; markdown: string; summary?: string };

export interface AiDocumentPatch {
  summary?: string;
  operations: AiDocumentPatchOperation[];
}

export interface AiRunDocumentActionInput {
  actionType: AiDocumentActionType;
  documentTitle: string;
  content: string;
  instruction?: string;
  contentScope?: AiDocumentContentScope;
}

export interface AiRunDocumentActionOutput {
  actionType: AiDocumentActionType;
  title: string;
  content: string;
  previewMode: AiActionPreviewMode;
  contentScope?: AiDocumentContentScope;
  patch?: AiDocumentPatch;
}

export interface AiSplitDocumentInput {
  documentTitle: string;
  content: string;
  instruction?: string;
}

export interface AiSplitDocumentPart {
  title: string;
  content: string;
}

export interface AiSplitDocumentOutput {
  title: string;
  parts: AiSplitDocumentPart[];
}

export type AiTableActionType =
  | "generate-fields"
  | "create-records"
  | "extract-tasks"
  | "summarize-table"
  | "suggest-tags-status"
  | "meeting-to-task-board";

export type AiTableFieldCandidateType =
  | "text"
  | "longText"
  | "singleSelect"
  | "multiSelect"
  | "number"
  | "progress"
  | "time"
  | "url";

export type AiTableValueCandidate = string | string[] | number | null;

export interface AiTableFieldCandidate {
  name: string;
  type: AiTableFieldCandidateType;
  options?: string[];
}

export interface AiTableRecordCandidate {
  title?: string;
  values?: Record<string, AiTableValueCandidate>;
  body?: string;
}

export interface AiTablePatch {
  fields?: AiTableFieldCandidate[];
  records?: AiTableRecordCandidate[];
  preferBoard?: boolean;
}

export interface AiRunTableActionInput {
  actionType: AiTableActionType;
  tableTitle: string;
  tableJson: string;
  instruction?: string;
}

export interface AiRunTableActionOutput {
  actionType: AiTableActionType;
  title: string;
  summary: string;
  patch?: AiTablePatch;
}

export type AiSpreadsheetActionType =
  | "create-sheet"
  | "append-rows"
  | "summarize-spreadsheet";

export type AiSpreadsheetCellValue = string | number | boolean | null;

export interface AiSpreadsheetSheetCandidate {
  name: string;
  rows: AiSpreadsheetCellValue[][];
}

export interface AiSpreadsheetPatch {
  sheets?: AiSpreadsheetSheetCandidate[];
  appendRows?: AiSpreadsheetCellValue[][];
}

export interface AiRunSpreadsheetActionInput {
  actionType: AiSpreadsheetActionType;
  spreadsheetTitle: string;
  workbookJson: string;
  instruction?: string;
}

export interface AiRunSpreadsheetActionOutput {
  actionType: AiSpreadsheetActionType;
  title: string;
  summary: string;
  patch?: AiSpreadsheetPatch;
}

export interface DatabaseLocationSettings {
  directory: string;
  databasePath: string;
  custom: boolean;
}

export interface BackupKeyStatus {
  configured: boolean;
  needsKey: boolean;
  fingerprint?: string;
  createdAt?: string;
}

export interface ResourceKeyStatus {
  configured: boolean;
  needsKey: boolean;
  fingerprint?: string;
  createdAt?: string;
  knownFingerprints: string[];
}

export type BackupRecordType = "full" | "incremental";

export interface BackupRecord {
  id: string;
  backupType: BackupRecordType;
  createdAt: string;
  baseBackupId?: string;
  keyFingerprint: string;
  encryptedSize: number;
  archiveHash: string;
  objectKey: string;
  canRestore: boolean;
}

export interface CreateBackupInput {
  forceFull: boolean;
}

export interface BackupOperationOutput {
  record: BackupRecord;
  warnings: string[];
}

export interface RestoreBackupInput {
  backupId: string;
  allowKeyMismatch?: boolean;
}

export interface RestoreBackupOutput {
  restoredBackupId: string;
  restoredAt: string;
  requiresRestart: boolean;
  warnings: string[];
}

export interface DeleteBackupInput {
  backupId: string;
}

export interface DeleteBackupOutput {
  deletedBackupIds: string[];
}

export interface ResourceMigrationTargetInput {
  provider: StorageProviderKind;
  storageId: string;
}

export interface ResourceMigrationInput {
  source: ResourceMigrationTargetInput;
  target: ResourceMigrationTargetInput;
}

export interface ResourceMigrationReference {
  resourceRef: string;
  provider: StorageProviderKind;
  storageId: string;
  key: string;
  documentPath: string;
  location: string;
}

export interface ResourceMigrationIssue {
  resourceRef: string;
  documentPath: string;
  message: string;
}

export interface ResourceMigrationAnalysisOutput {
  totalReferences: number;
  uniqueResources: number;
  documentCount: number;
  totalBytes: number;
  migratedResources: ResourceMigrationReference[];
  skippedResources: ResourceMigrationReference[];
  unreadableResources: ResourceMigrationIssue[];
  conflictResources: ResourceMigrationIssue[];
}

export interface ResourceMigrationRunOutput {
  analysis: ResourceMigrationAnalysisOutput;
  rewrittenDocuments: string[];
  copiedResources: number;
}

export type ExportResourceStrategy = "bundle" | "signed-url";

export const emptySaveStatus: SaveStatus = {
  state: "clean",
};
