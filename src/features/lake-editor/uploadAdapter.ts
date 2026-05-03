import type { UploadImageInput, UploadImageOutput } from "../../app/appState";

type EditorUploadRequest = {
  type?: "url" | "file" | "base64";
  data?: File | string;
  file?: File | string;
};

export async function createEditorImageUpload(
  request: unknown,
  uploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>,
): Promise<UploadImageOutput> {
  const normalized = request as EditorUploadRequest;
  const payload = normalized.data ?? normalized.file;

  if (normalized.type === "url" || typeof payload === "string") {
    if (typeof payload === "string" && payload.startsWith("data:")) {
      return uploadBase64Image(payload, uploadImage);
    }
    throw new Error("暂不支持远程图片转存，请插入本地图片文件");
  }

  if (!(payload instanceof File)) {
    throw new Error("无法识别图片上传内容");
  }

  return uploadLocalImageFile(payload, uploadImage, "image.png");
}

export async function createEditorFileUpload(
  request: unknown,
  uploadFile: (input: UploadImageInput) => Promise<UploadImageOutput>,
): Promise<UploadImageOutput> {
  const payload = request instanceof File ? request : (request as EditorUploadRequest).data ?? (request as EditorUploadRequest).file;
  if (!(payload instanceof File)) {
    throw new Error("无法识别附件上传内容");
  }

  return uploadLocalFile(payload, uploadFile, "attachment.bin");
}

async function uploadBase64Image(
  dataUrl: string,
  uploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>,
): Promise<UploadImageOutput> {
  const [header, body] = dataUrl.split(",", 2);
  const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] ?? "image/png";
  const binary = atob(body);
  const bytes = Array.from(binary, (char) => char.charCodeAt(0));

  const output = await uploadImage({
    bytes,
    filename: defaultFilenameForMime(mimeType),
    mimeType,
  });
  return withEditorImagePreview(output, dataUrl);
}

async function uploadLocalImageFile(
  file: File,
  uploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>,
  fallbackFilename: string,
): Promise<UploadImageOutput> {
  const output = await uploadLocalFile(file, uploadImage, fallbackFilename);
  return withEditorImagePreview(output, createLocalObjectUrl(file));
}

async function uploadLocalFile(
  file: File,
  uploadFile: (input: UploadImageInput) => Promise<UploadImageOutput>,
  fallbackFilename: string,
): Promise<UploadImageOutput> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return uploadFile({
    bytes,
    filename: file.name || fallbackFilename,
    mimeType: file.type || undefined,
  });
}

function withEditorImagePreview(output: UploadImageOutput, previewUrl: string | undefined): UploadImageOutput {
  if (!previewUrl) {
    return output;
  }

  return {
    ...output,
    // Lake 图片卡片上传成功后只读取 url 写入内部 src，因此这里保留 OSS 引用的同时，
    // 额外把本次编辑会话可直接渲染的地址交给上层做 url/src 替换。
    src: previewUrl,
    previewUrl,
  };
}

function createLocalObjectUrl(file: File): string | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  return URL.createObjectURL(file);
}

function defaultFilenameForMime(mimeType: string): string {
  const extension = mimeType.split("/")[1] || "png";
  return `image.${extension}`;
}
