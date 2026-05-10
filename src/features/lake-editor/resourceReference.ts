import type { UploadImageOutput } from "../../app/appState";

export type ResourceKind = "image" | "file";
export type ResourceProviderKind = "s3" | "local" | "webdav";

export interface LakeResourceReference {
  bucket: string;
  storageId?: string;
  provider?: ResourceProviderKind;
  key: string;
  kind: ResourceKind;
  name?: string;
  size?: number;
  mimeType?: string;
  encryption?: {
    algorithm: "age-v1";
    keyFingerprint: string;
  };
}

export interface ResourcePreview {
  resourceRef: string;
  previewUrl: string;
}

interface RewriteLakeResourceOptions {
  includeFileCards?: boolean;
}

export interface PublicResourceReferenceOptions {
  bucket?: string;
  publicBaseUrl?: string;
  imagePrefix?: string;
  filePrefix?: string;
}

export interface PublicResourceReferenceMetadata {
  kind?: ResourceKind;
  name?: string;
  size?: number;
  mimeType?: string;
}

const resourceProtocol = "yuque-resource:";
export const defaultResourcePreviewConcurrency = 6;
const minResourcePreviewConcurrency = 4;
const maxResourcePreviewConcurrency = 8;

export function createResourceReference(input: LakeResourceReference): string {
  const storageId = input.storageId ?? input.bucket;
  const url = new URL(`${resourceProtocol}//${encodeURIComponent(storageId)}/${encodePath(input.key)}`);
  if (input.provider) {
    url.searchParams.set("provider", input.provider);
  }
  url.searchParams.set("kind", input.kind);
  if (input.name) {
    url.searchParams.set("name", input.name);
  }
  if (typeof input.size === "number" && Number.isFinite(input.size)) {
    url.searchParams.set("size", String(input.size));
  }
  if (input.mimeType) {
    url.searchParams.set("type", input.mimeType);
  }
  if (input.encryption) {
    url.searchParams.set("enc", input.encryption.algorithm);
    url.searchParams.set("keyFingerprint", input.encryption.keyFingerprint);
  }
  return url.toString();
}

export function parseResourceReference(value: string): LakeResourceReference | null {
  if (!value.startsWith(resourceProtocol)) {
    return null;
  }

  try {
    const url = new URL(value);
    const bucket = decodeURIComponent(url.hostname);
    const provider = parseResourceProvider(url.searchParams.get("provider"));
    if (provider === false) {
      return null;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const kind = url.searchParams.get("kind") === "file" ? "file" : "image";
    const sizeText = url.searchParams.get("size");
    const sizeValue = sizeText === null ? Number.NaN : Number(sizeText);
    const encryption = parseEncryptionMetadata(url);
    if (encryption === false) {
      return null;
    }
    if (!bucket || !key) {
      return null;
    }
    return {
      bucket,
      storageId: provider ? bucket : undefined,
      provider: provider ?? undefined,
      key,
      kind,
      name: url.searchParams.get("name") ?? undefined,
      size: Number.isFinite(sizeValue) ? sizeValue : undefined,
      mimeType: url.searchParams.get("type") ?? undefined,
      encryption: encryption ?? undefined,
    };
  } catch {
    return null;
  }
}

export function resourceReferenceFromUpload(output: UploadImageOutput): string | null {
  return output.resourceRef ?? parseMaybeResourceUrl(output.url);
}

export function resourceReferenceFromPublicUrl(
  value: string,
  options: PublicResourceReferenceOptions,
  metadata: PublicResourceReferenceMetadata = {},
): string | null {
  if (parseResourceReference(value)) {
    return value;
  }

  const bucket = options.bucket?.trim();
  const key = resourceKeyFromPublicUrl(value, options.publicBaseUrl);
  const kind = key ? inferResourceKindFromKey(key, options, metadata.kind) : null;
  if (!bucket || !key || !kind) {
    return null;
  }

  return createResourceReference({
    bucket,
    key,
    kind,
    name: metadata.name,
    size: metadata.size,
    mimeType: metadata.mimeType,
  });
}

export function dehydrateLakeResources(content: string, previews: ResourcePreview[]): string {
  return rewriteLakeResourceUrls(content, (value) => {
    const preview = previews.find((item) => item.previewUrl === value);
    return preview?.resourceRef ?? value;
  }, { includeFileCards: true });
}

export function dehydrateResourceText(content: string, previews: ResourcePreview[]): string {
  return previews.reduce((nextContent, preview) => (
    nextContent.split(preview.previewUrl).join(preview.resourceRef)
  ), content);
}

export async function hydrateLakeResources(
  content: string,
  preparePreview: (resourceRef: string) => Promise<string>,
): Promise<string> {
  const refs = Array.from(new Set(collectResourceReferences(content)));
  if (refs.length === 0) {
    return content;
  }

  const previews = new Map<string, string>();
  for (const ref of refs) {
    previews.set(ref, await preparePreview(ref));
  }
  return rewriteLakeResourceUrls(content, (value) => previews.get(value) ?? value);
}

export function hydrateLakeResourcesWithPreviews(
  content: string,
  previews: ResourcePreview[],
  options: RewriteLakeResourceOptions = {},
): string {
  if (previews.length === 0) {
    return content;
  }
  return rewriteLakeResourceUrls(content, (value) => (
    previews.find((preview) => preview.resourceRef === value)?.previewUrl ?? value
  ), options);
}

export function createLakeResourcePlaceholder(resourceRef: string): string {
  const kind = parseResourceReference(resourceRef)?.kind;
  const label = kind === "file" ? "资源加载中..." : "图片加载中...";
  const svg = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"360\" viewBox=\"0 0 640 360\">",
    "<rect width=\"640\" height=\"360\" rx=\"18\" fill=\"#f4f7f5\"/>",
    "<rect x=\"1\" y=\"1\" width=\"638\" height=\"358\" rx=\"17\" fill=\"none\" stroke=\"#d8e2dd\"/>",
    `<title>${escapeSvgText(resourceRef)}</title>`,
    `<text x=\"320\" y=\"182\" text-anchor=\"middle\" dominant-baseline=\"middle\" fill=\"#66736c\" font-size=\"24\" font-family=\"-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif\">${label}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function normalizeResourcePreviewConcurrency(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return defaultResourcePreviewConcurrency;
  }
  return Math.min(maxResourcePreviewConcurrency, Math.max(minResourcePreviewConcurrency, Math.floor(value ?? defaultResourcePreviewConcurrency)));
}

export async function runResourcePreviewQueue(
  resourceRefs: string[],
  concurrency: number,
  worker: (resourceRef: string) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(normalizeResourcePreviewConcurrency(concurrency), resourceRefs.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < resourceRefs.length) {
      const resourceRef = resourceRefs[nextIndex];
      nextIndex += 1;
      await worker(resourceRef);
    }
  }));
}

export function rewriteLakeResourceUrls(
  content: string,
  rewrite: (value: string) => string,
  options: RewriteLakeResourceOptions = {},
): string {
  const template = document.createElement("template");
  template.innerHTML = content;

  template.content.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src");
    if (src) {
      image.setAttribute("src", rewrite(src));
    }
  });

  // 打开文档时只需要预加载图片；附件下载/导出时再读取资源内容，避免大附件拖慢文档打开。
  const cardSelector = options.includeFileCards
    ? "card[name='image'], card[name='file'], card[name='localdoc']"
    : "card[name='image']";

  // Lake 的图片块、附件块都会把真实资源地址放在 value.src；
  // 保存时必须把一次性的 blob/asset 预览地址还原为私有资源引用，否则重开应用后预览地址会失效。
  template.content.querySelectorAll(cardSelector).forEach((card) => {
    const value = decodeLakeCardValue(card.getAttribute("value"));
    if (!value) {
      return;
    }
    const src = value?.src;
    if (typeof src !== "string") {
      return;
    }
    value.src = rewrite(src);
    card.setAttribute("value", encodeLakeCardValue(value));
  });

  return template.innerHTML;
}

export function collectResourceReferences(content: string, options: RewriteLakeResourceOptions = {}): string[] {
  const refs: string[] = [];
  rewriteLakeResourceUrls(content, (value) => {
    if (parseResourceReference(value)) {
      refs.push(value);
    }
    return value;
  }, options);
  return refs;
}

export function decodeLakeCardValue(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const payload = value.startsWith("data:") ? value.slice("data:".length) : value;
  try {
    return JSON.parse(decodeURIComponent(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function encodeLakeCardValue(value: Record<string, unknown>): string {
  return `data:${encodeURIComponent(JSON.stringify(value))}`;
}

function parseMaybeResourceUrl(value: string): string | null {
  return parseResourceReference(value) ? value : null;
}

function parseResourceProvider(value: string | null): ResourceProviderKind | false | null {
  if (!value) {
    return null;
  }
  if (value === "s3" || value === "local" || value === "webdav") {
    return value;
  }
  return false;
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function parseEncryptionMetadata(url: URL): LakeResourceReference["encryption"] | false | null {
  const algorithm = url.searchParams.get("enc");
  if (!algorithm) {
    return null;
  }
  const keyFingerprint = url.searchParams.get("keyFingerprint");
  if (algorithm !== "age-v1" || !keyFingerprint?.trim()) {
    return false;
  }
  return { algorithm, keyFingerprint };
}

function resourceKeyFromPublicUrl(value: string, publicBaseUrl?: string): string | null {
  if (!publicBaseUrl?.trim()) {
    return null;
  }

  try {
    const inputUrl = new URL(value);
    const baseUrl = new URL(publicBaseUrl);
    if (inputUrl.origin !== baseUrl.origin) {
      return null;
    }

    const inputPath = normalizeUrlPath(inputUrl.pathname);
    const basePath = normalizeUrlPath(baseUrl.pathname);
    if (!basePath) {
      return inputPath || null;
    }
    if (inputPath === basePath || !inputPath.startsWith(`${basePath}/`)) {
      return null;
    }
    return inputPath.slice(basePath.length + 1) || null;
  } catch {
    return null;
  }
}

function inferResourceKindFromKey(
  key: string,
  options: PublicResourceReferenceOptions,
  fallback?: ResourceKind,
): ResourceKind | null {
  const prefixes: Array<{ kind: ResourceKind; prefix: string }> = [
    { kind: "image", prefix: normalizePrefix(options.imagePrefix || "images") },
    { kind: "file", prefix: normalizePrefix(options.filePrefix || "files") },
  ];
  const matched = prefixes.find(({ prefix }) => prefix && (key === prefix || key.startsWith(`${prefix}/`)));
  return matched?.kind ?? fallback ?? null;
}

function normalizeUrlPath(path: string): string {
  try {
    return decodeURIComponent(path).replace(/^\/+|\/+$/g, "");
  } catch {
    return path.replace(/^\/+|\/+$/g, "");
  }
}

function normalizePrefix(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
