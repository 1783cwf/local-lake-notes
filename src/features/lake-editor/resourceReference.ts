import type { UploadImageOutput } from "../../app/appState";

export type ResourceKind = "image" | "file";

export interface LakeResourceReference {
  bucket: string;
  key: string;
  kind: ResourceKind;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface ResourcePreview {
  resourceRef: string;
  previewUrl: string;
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

export function createResourceReference(input: LakeResourceReference): string {
  const url = new URL(`${resourceProtocol}//${encodeURIComponent(input.bucket)}/${encodePath(input.key)}`);
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
  return url.toString();
}

export function parseResourceReference(value: string): LakeResourceReference | null {
  if (!value.startsWith(resourceProtocol)) {
    return null;
  }

  try {
    const url = new URL(value);
    const bucket = decodeURIComponent(url.hostname);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const kind = url.searchParams.get("kind") === "file" ? "file" : "image";
    const sizeText = url.searchParams.get("size");
    const sizeValue = sizeText === null ? Number.NaN : Number(sizeText);
    if (!bucket || !key) {
      return null;
    }
    return {
      bucket,
      key,
      kind,
      name: url.searchParams.get("name") ?? undefined,
      size: Number.isFinite(sizeValue) ? sizeValue : undefined,
      mimeType: url.searchParams.get("type") ?? undefined,
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
  });
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

export function rewriteLakeResourceUrls(content: string, rewrite: (value: string) => string): string {
  const template = document.createElement("template");
  template.innerHTML = content;

  template.content.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src");
    if (src) {
      image.setAttribute("src", rewrite(src));
    }
  });

  template.content.querySelectorAll("card[name='file'], card[name='localdoc']").forEach((card) => {
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

export function collectResourceReferences(content: string): string[] {
  const refs: string[] = [];
  rewriteLakeResourceUrls(content, (value) => {
    if (parseResourceReference(value)) {
      refs.push(value);
    }
    return value;
  });
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
