import type { WorkspaceDocument } from "../features/workspace/workspaceStore";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatus {
  state: SaveState;
  message?: string;
  savedAt?: string;
}

export interface CurrentDocumentState {
  entry: WorkspaceDocument;
  content: string;
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

export interface OssSettings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  forcePathStyle: boolean;
  imagePrefix: string;
  filePrefix: string;
  defaultExportResourceStrategy: ExportResourceStrategy;
  defaultSignedUrlTtlSeconds: number;
  maxSignedUrlTtlSeconds: number;
  allowSignedUrlExport: boolean;
}

export type ExportResourceStrategy = "bundle" | "signed-url";

export const emptySaveStatus: SaveStatus = {
  state: "clean",
};
