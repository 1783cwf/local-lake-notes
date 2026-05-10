import type { OssSettings } from "../../app/appState";
import { defaultResourcePreviewConcurrency, normalizeResourcePreviewConcurrency } from "../lake-editor/resourceReference";

export const defaultOssSettings: OssSettings = {
  activeProvider: "s3",
  endpoint: "",
  bucket: "",
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  publicBaseUrl: "",
  forcePathStyle: true,
  imagePrefix: "images",
  filePrefix: "files",
  backupPrefix: "backups",
  defaultExportResourceStrategy: "bundle",
  defaultSignedUrlTtlSeconds: 24 * 60 * 60,
  maxSignedUrlTtlSeconds: 7 * 24 * 60 * 60,
  allowSignedUrlExport: true,
  resourcePreviewConcurrency: defaultResourcePreviewConcurrency,
  local: {
    rootDirectory: "",
    storageId: "local",
  },
  webdav: {
    endpoint: "",
    username: "",
    password: "",
    rootPath: "",
    storageId: "webdav",
  },
};

export function mergeOssSettings(settings: OssSettings | null): OssSettings {
  const merged = {
    ...defaultOssSettings,
    ...(settings ?? {}),
    local: {
      ...defaultOssSettings.local,
      ...(settings?.local ?? {}),
    },
    webdav: {
      ...defaultOssSettings.webdav,
      ...(settings?.webdav ?? {}),
    },
  };

  return {
    ...merged,
    activeProvider: isStorageProviderKind(merged.activeProvider) ? merged.activeProvider : "s3",
    resourcePreviewConcurrency: normalizeResourcePreviewConcurrency(merged.resourcePreviewConcurrency),
  };
}

export function validateOssSettings(settings: OssSettings): string | null {
  if (settings.activeProvider === "s3") {
    if (!settings.endpoint.trim()) {
      return "请填写 S3 Endpoint";
    }
    if (!settings.bucket.trim()) {
      return "请填写 S3 Bucket";
    }
    if (!settings.region.trim()) {
      return "请填写 S3 Region";
    }
    if (!settings.accessKeyId.trim()) {
      return "请填写 S3 Access Key";
    }
    if (!settings.secretAccessKey.trim()) {
      return "请填写 S3 Secret Key";
    }
  } else if (settings.activeProvider === "local") {
    if (!settings.local.rootDirectory.trim()) {
      return "请选择本地存储目录";
    }
  } else if (settings.activeProvider === "webdav") {
    if (!settings.webdav.endpoint.trim()) {
      return "请填写 WebDAV 地址";
    }
    if (!settings.webdav.username.trim()) {
      return "请填写 WebDAV 用户名";
    }
    if (!settings.webdav.password.trim()) {
      return "请填写 WebDAV 密码";
    }
  } else {
    return "不支持的文件存储类型";
  }
  if (!settings.imagePrefix.trim()) {
    return "请填写图片目录";
  }
  if (!settings.filePrefix.trim()) {
    return "请填写附件目录";
  }
  if (!settings.backupPrefix.trim()) {
    return "请填写备份目录";
  }
  if (settings.defaultSignedUrlTtlSeconds <= 0 || settings.defaultSignedUrlTtlSeconds > settings.maxSignedUrlTtlSeconds) {
    return "签名链接默认有效期不能超过最大有效期";
  }
  if (settings.activeProvider !== "s3" && settings.defaultExportResourceStrategy === "signed-url") {
    return "本地和 WebDAV 存储暂不支持短时签名链接导出";
  }
  return null;
}

function isStorageProviderKind(value: unknown): value is OssSettings["activeProvider"] {
  return value === "s3" || value === "local" || value === "webdav";
}
