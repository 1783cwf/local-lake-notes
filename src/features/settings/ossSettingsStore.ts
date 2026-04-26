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
  if (!settings.publicBaseUrl.trim()) {
    return "请填写公开访问 URL";
  }
  return null;
}
