import type { WorkspaceDocument } from "../features/workspace/workspaceStore";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatus {
  state: SaveState;
  message?: string;
  savedAt?: string;
}

export type CurrentDocumentState =
  | {
    kind: "lake";
    entry: WorkspaceDocument & { kind: "lake" };
    content: string;
  }
  | {
    kind: "spreadsheet";
    entry: WorkspaceDocument & { kind: "spreadsheet" };
    content: string;
  }
  | {
    kind: "multidimensional-table";
    entry: WorkspaceDocument & { kind: "multidimensional-table" };
    content: string;
  };

export interface OpenDocumentTab {
  id: string;
  path: string;
  locked: boolean;
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
