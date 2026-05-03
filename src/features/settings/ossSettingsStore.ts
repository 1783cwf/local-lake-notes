import type { OssSettings } from "../../app/appState";

export const defaultOssSettings: OssSettings = {
  endpoint: "",
  bucket: "",
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  publicBaseUrl: "",
  forcePathStyle: true,
  imagePrefix: "images",
  filePrefix: "files",
  defaultExportResourceStrategy: "bundle",
  defaultSignedUrlTtlSeconds: 24 * 60 * 60,
  maxSignedUrlTtlSeconds: 7 * 24 * 60 * 60,
  allowSignedUrlExport: true,
};

export function mergeOssSettings(settings: OssSettings | null): OssSettings {
  return {
    ...defaultOssSettings,
    ...(settings ?? {}),
  };
}

export function validateOssSettings(settings: OssSettings): string | null {
  if (!settings.endpoint.trim()) {
    return "请填写 endpoint";
  }
  if (!settings.bucket.trim()) {
    return "请填写 bucket";
  }
  if (!settings.region.trim()) {
    return "请填写 region";
  }
  if (!settings.accessKeyId.trim()) {
    return "请填写 access key";
  }
  if (!settings.secretAccessKey.trim()) {
    return "请填写 secret key";
  }
  if (!settings.imagePrefix.trim()) {
    return "请填写图片目录";
  }
  if (!settings.filePrefix.trim()) {
    return "请填写附件目录";
  }
  if (settings.defaultSignedUrlTtlSeconds <= 0 || settings.defaultSignedUrlTtlSeconds > settings.maxSignedUrlTtlSeconds) {
    return "签名链接默认有效期不能超过最大有效期";
  }
  return null;
}
