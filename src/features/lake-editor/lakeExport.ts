import type { WorkspaceDocument, WorkspacePayload } from "../workspace/workspaceStore";
import { buildDocumentTree, documentTitleFromPath, flattenDocumentTree } from "../workspace/workspaceStore";
import type { LakeEditorInstance } from "./editorTypes";
import {
  decodeLakeCardValue,
  encodeLakeCardValue,
  resourceReferenceFromPublicUrl,
  parseResourceReference,
  type LakeResourceReference,
  type ResourceKind,
} from "./resourceReference";

export type DocumentExportFormat = "markdown" | "html" | "pdf";
export type ExportResourceStrategy = "bundle" | "signed-url";
export type LakeWorkspaceMarkdownConverter = (
  document: WorkspaceDocument,
  lakeContent: string,
) => Promise<string> | string;
export type ExportResourceSigner = (resourceRef: string, filename: string | undefined, ttlSeconds: number) => Promise<string>;
export type ExportResourceLoader = (resourceRef: string) => Promise<Uint8Array>;

export interface LakeDocumentExportRequest {
  id: number;
  format: DocumentExportFormat;
  document: WorkspaceDocument;
  resourceStrategy: ExportResourceStrategy;
  signedUrlTtlSeconds: number;
}

export interface OfficialLakeMarkdownConverter {
  convert: LakeWorkspaceMarkdownConverter;
  dispose: () => void;
}

const markdownExtension = ".md";
const zipExtension = ".zip";
const lakeStylePaths = ["/vendor/lakex-doc/antd.css", "/vendor/lakex-doc/doc.css"];

interface ExportHeading {
  id: string;
  level: number;
  text: string;
}

interface LakeCodeblockExportMetadata {
  name?: string;
  mode?: string;
  theme?: string;
  code?: string;
}

export interface LakeDocumentResourceExportOptions {
  strategy: ExportResourceStrategy;
  signedUrlTtlSeconds: number;
  embedImages?: boolean;
  bucket?: string;
  publicBaseUrl?: string;
  imagePrefix?: string;
  filePrefix?: string;
  signResource?: ExportResourceSigner;
  loadResource?: ExportResourceLoader;
}

interface ResourceRewriteResult {
  content: string;
  resources: ZipEntryInput[];
}

export interface WorkspaceZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

export interface LakeDocumentExportResourceUsage {
  hasResources: boolean;
  hasImageResources: boolean;
  hasFileResources: boolean;
}

export function lakeDocumentToMarkdown(title: string, content: string): string {
  return normalizeMarkdown(`# ${title}\n\n${lakeContentToMarkdown(content)}`);
}

export function lakeContentToMarkdown(content: string): string {
  const template = document.createElement("template");
  template.innerHTML = content;
  return normalizeMarkdown(nodesToMarkdown(Array.from(template.content.childNodes)));
}

export function restoreLakeCodeblockMetadata(htmlContent: string, readLakeContent: () => string): string {
  const htmlTemplate = document.createElement("template");
  htmlTemplate.innerHTML = htmlContent;
  const codeblocks = Array.from(htmlTemplate.content.querySelectorAll("pre.ne-codeblock, pre[data-language]"));
  if (codeblocks.length === 0) {
    return htmlContent;
  }

  const lakeTemplate = document.createElement("template");
  lakeTemplate.innerHTML = readLakeContent();
  const metadata = Array.from(lakeTemplate.content.querySelectorAll("card[name='codeblock']"))
    .map((card) => readLakeCodeblockExportMetadata(card));
  if (!metadata.some(Boolean)) {
    return htmlContent;
  }

  const usedMetadataIndexes = new Set<number>();
  codeblocks.forEach((codeblock, index) => {
    const code = normalizeCodeblockContent(codeblock.textContent ?? "");
    const directItem = metadata[index];
    const metadataIndex = directItem &&
      !usedMetadataIndexes.has(index) &&
      (!directItem.code || normalizeCodeblockContent(directItem.code) === code)
      ? index
      : metadata.findIndex((item, candidateIndex) => (
        !usedMetadataIndexes.has(candidateIndex) &&
        item?.code !== undefined &&
        normalizeCodeblockContent(item.code) === code
      ));
    const item = metadata[metadataIndex];
    if (!item) {
      return;
    }
    usedMetadataIndexes.add(metadataIndex);

    // Lake 的 HTML writer 不输出稳定 ID；优先按顺序匹配，顺序不一致时用代码内容避免名称错位。
    setCodeblockExportAttribute(codeblock, "data-title", item.name);
    setCodeblockExportAttribute(codeblock, "data-language", item.mode);
    setCodeblockExportAttribute(codeblock, "data-theme", item.theme);
  });
  return htmlTemplate.innerHTML;
}

function readLakeCodeblockExportMetadata(card: Element): LakeCodeblockExportMetadata | null {
  const value = decodeLakeCardValue(card.getAttribute("value"));
  if (!value) {
    return null;
  }
  return {
    name: readOptionalText(value.name),
    mode: readOptionalText(value.mode),
    theme: readOptionalText(value.theme),
    code: typeof value.code === "string" ? value.code : undefined,
  };
}

function normalizeCodeblockContent(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
}

function setCodeblockExportAttribute(element: Element, attribute: string, value: string | undefined): void {
  if (value) {
    element.setAttribute(attribute, value);
  }
}

function readOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim() || undefined;
}

export async function lakeDocumentMarkdownToTextWithResources(
  title: string,
  markdown: string,
  options: LakeDocumentResourceExportOptions,
): Promise<string> {
  const result = await rewriteMarkdownResourceReferences(markdown, options, options.strategy === "bundle" ? {
    inlineImages: true,
  } : undefined);
  return markdownWithTitle(title, result.content);
}

export async function lakeDocumentMarkdownToBundle(
  title: string,
  markdown: string,
  options: LakeDocumentResourceExportOptions,
): Promise<Uint8Array> {
  const result = await rewriteMarkdownResourceReferences(markdown, options, {
    assetPrefix: "assets",
    attachmentPrefix: "attachments",
  });
  return createZip([
    { path: `${safeFileName(title)}.md`, content: markdownWithTitle(title, result.content) },
    ...result.resources,
  ]);
}

export async function lakeDocumentToHtml(title: string, content: string): Promise<string> {
  const styles = await loadExportStyles();
  const rendered = renderHtmlExportContent(content);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${styles}
      @page {
        margin: 18mm;
      }
      body {
        margin: 0;
        padding: 0 clamp(24px, 4vw, 72px);
        color: #262626;
        background:
          linear-gradient(180deg, #f8faf9 0%, #ffffff 220px),
          #ffffff;
        font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .lake-export-shell {
        --lake-export-outline-width: 220px;
        display: grid;
        grid-template-columns: var(--lake-export-outline-width) 10px minmax(0, 1fr);
        gap: 24px;
        align-items: start;
        width: min(100%, 1760px);
        margin: 0 auto;
        padding: clamp(28px, 4vw, 56px) 0;
      }
      .lake-export-outline {
        position: sticky;
        top: 32px;
        max-height: calc(100vh - 64px);
        overflow: auto;
        padding: 14px 12px;
        border: 1px solid #e6ebe8;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 10px 32px rgb(31 38 45 / 6%);
        color: #6b737b;
        font-size: 14px;
      }
      .lake-export-outline__title {
        margin: 0 0 10px;
        color: #22272d;
        font-weight: 650;
      }
      .lake-export-outline a,
      .lake-export-outline span {
        display: block;
        overflow: hidden;
        padding: 5px 8px;
        border-radius: 6px;
        color: inherit;
        text-decoration: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lake-export-outline a:hover {
        background: #eef7f2;
        color: #1677ff;
      }
      .lake-export-resizer {
        position: sticky;
        top: 32px;
        width: 10px;
        height: calc(100vh - 64px);
        border: 0;
        border-radius: 999px;
        background: transparent;
        cursor: col-resize;
      }
      .lake-export-resizer::before {
        display: block;
        width: 2px;
        height: 100%;
        margin: 0 auto;
        border-radius: 999px;
        background: transparent;
        content: "";
        transition: background 120ms ease;
      }
      .lake-export-resizer:hover::before,
      .lake-export-resizer:focus-visible::before,
      .lake-export-resizer.is-dragging::before {
        background: #d0d7de;
      }
      .lake-export-resizer:focus-visible {
        outline: 2px solid #8bbcff;
        outline-offset: 2px;
      }
      .lake-export-outline__item--2 { padding-left: 12px !important; }
      .lake-export-outline__item--3 { padding-left: 24px !important; }
      .lake-export-outline__item--4,
      .lake-export-outline__item--5,
      .lake-export-outline__item--6 { padding-left: 36px !important; }
      .lake-export-document {
        min-width: 0;
        padding: clamp(32px, 4vw, 64px);
        border: 1px solid #e8edea;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 48px rgb(31 38 45 / 7%);
      }
      .lake-export-content {
        color: #2b3035;
        word-break: break-word;
      }
      .lake-export-content h1,
      .lake-export-content h2,
      .lake-export-content h3,
      .lake-export-content h4,
      .lake-export-content h5,
      .lake-export-content h6 {
        margin: 1.35em 0 0.6em;
        color: #202428;
        line-height: 1.35;
      }
      .lake-export-content h1 { font-size: 1.9em; }
      .lake-export-content h2 {
        padding-bottom: 0.28em;
        border-bottom: 1px solid #edf0ee;
        font-size: 1.55em;
      }
      .lake-export-content h3 { font-size: 1.28em; }
      .lake-export-content p,
      .lake-export-content ul,
      .lake-export-content ol,
      .lake-export-content blockquote,
      .lake-export-content table,
      .lake-export-content pre,
      .lake-export-codeblock {
        margin: 14px 0;
      }
      img {
        max-width: 100%;
        border-radius: 6px;
      }
      .lake-export-content img {
        cursor: zoom-in;
      }
      body.lake-export-image-viewer-open {
        overflow: hidden;
      }
      .lake-export-image-viewer[hidden] {
        display: none;
      }
      .lake-export-image-viewer {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        grid-template-rows: 56px minmax(0, 1fr);
        color: #ffffff;
        background: rgb(14 18 22 / 92%);
      }
      .lake-export-image-viewer__toolbar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 16px;
        border-bottom: 1px solid rgb(255 255 255 / 14%);
        background: rgb(19 24 29 / 88%);
      }
      .lake-export-image-viewer__button {
        display: inline-grid;
        place-items: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 0;
        border-radius: 5px;
        color: #ffffff;
        background: transparent;
        font: inherit;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .lake-export-image-viewer__button:hover,
      .lake-export-image-viewer__button:focus-visible {
        background: rgb(255 255 255 / 14%);
        outline: 2px solid #8bbcff;
        outline-offset: -2px;
      }
      .lake-export-image-viewer__button--reset {
        width: 48px;
        font-size: 13px;
      }
      .lake-export-image-viewer__button--close {
        margin-left: 12px;
      }
      .lake-export-image-viewer__scale {
        width: 64px;
        color: #e8edf1;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      .lake-export-image-viewer__stage {
        min-width: 0;
        min-height: 0;
        overflow: auto;
        padding: 32px;
        text-align: center;
      }
      .lake-export-image-viewer__image {
        display: block;
        max-width: none;
        height: auto;
        margin: auto;
        border-radius: 0;
        box-shadow: 0 16px 50px rgb(0 0 0 / 35%);
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border: 1px solid #dfe6e2;
        border-radius: 8px;
      }
      th,
      td {
        padding: 9px 12px;
        border-right: 1px solid #e3e8e5;
        border-bottom: 1px solid #e3e8e5;
      }
      th {
        background: #f6f8f7;
        color: #202428;
        font-weight: 650;
      }
      tr:last-child > th,
      tr:last-child > td { border-bottom: 0; }
      th:last-child,
      td:last-child { border-right: 0; }
      blockquote {
        padding: 10px 14px;
        border-left: 3px solid #9ed8b6;
        border-radius: 0 6px 6px 0;
        background: #f5fbf7;
        color: #475057;
      }
      .lake-export-content ne-container-hole,
      .lake-export-content ne-root-card-hole,
      .lake-export-content ne-hole,
      .lake-export-content ne-alert-hole {
        display: block;
        max-width: 100%;
      }
      .lake-export-content ne-container-hole[data-card="columns"] {
        margin: 18px 0;
      }
      .lake-export-content ne-columns {
        display: block;
        width: 100%;
        max-width: 100%;
        color: inherit;
        user-select: text;
      }
      .lake-export-content ne-columns-content {
        display: flex;
        width: 100%;
        align-items: stretch;
        gap: 18px;
      }
      .lake-export-content ne-column {
        display: block;
        flex: 1 1 0;
        min-width: 0;
        margin: 0;
        padding: 0;
        position: relative;
      }
      .lake-export-content ne-column-content {
        display: block;
        min-width: 0;
        max-width: 100%;
        overflow: visible;
      }
      .lake-export-content ne-column-border,
      .lake-export-content ne-column-controller,
      .lake-export-content .columns-add,
      .lake-export-content .columns-remove,
      .lake-export-content .columns-start-add,
      .lake-export-content .columns-end-add,
      .lake-export-content .columns-adder,
      .lake-export-content .columns-drag-button,
      .lake-export-content .columns-move-inspector {
        display: none !important;
      }
      .lake-export-content ne-collapse {
        display: flex;
        width: 100%;
        max-width: 100%;
        margin: 16px 0;
        padding: 8px 16px 10px 0;
        border: 1px solid #e2e8e4;
        border-radius: 8px;
        background: #fbfcfb;
      }
      .lake-export-content ne-collapse .collapse-controller {
        display: flex;
        flex: 0 0 32px;
        justify-content: center;
        padding-top: 2px;
      }
      .lake-export-content ne-collapse .ne-collapse-fold-container {
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }
      .lake-export-content ne-collapse .ne-collapse-folding-inner {
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 5px;
        color: #69727a;
        cursor: pointer;
        transition:
          background 120ms ease,
          transform 120ms ease;
      }
      .lake-export-content ne-collapse .ne-collapse-folding-inner::before {
        content: "▾";
      }
      .lake-export-content ne-collapse[ne-open="false"] .ne-collapse-folding-inner {
        transform: rotate(-90deg);
      }
      .lake-export-content ne-collapse .ne-collapse-folding-inner:hover,
      .lake-export-content ne-collapse .collapse-controller:focus-visible .ne-collapse-folding-inner {
        background: #eef7f2;
        color: #0f8f52;
      }
      .lake-export-content ne-collapse-content {
        display: block;
        flex: 1 1 auto;
        min-width: 0;
        max-width: calc(100% - 32px);
      }
      .lake-export-content ne-summary {
        display: block;
        margin: 0;
        color: #202428;
        font-weight: 650;
      }
      .lake-export-content ne-collapse[ne-open="false"] ne-collapse-content > * {
        display: none;
      }
      .lake-export-content ne-collapse[ne-open="false"] ne-collapse-content > ne-summary {
        display: block;
      }
      .lake-export-content :not(pre) > code,
      .lake-export-content .ne-code {
        padding: 2px 5px;
        border: 1px solid #e2e7e4;
        border-radius: 5px;
        background: #f4f6f5;
        color: #b42318;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.92em;
      }
      pre {
        overflow: auto;
        padding: 14px;
        border: 1px solid #dfe6e2;
        border-radius: 8px;
        background: #f8faf9;
        color: #24292f;
      }
      .lake-export-codeblock {
        overflow: hidden;
        border: 1px solid #2f86ff;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 1px 2px rgb(31 38 45 / 3%);
      }
      .lake-export-codeblock__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 50px;
        padding: 0 14px 0 18px;
        border-bottom: 1px solid #e8ecef;
        background: #f7f7f7;
        color: #2d3033;
        cursor: pointer;
        list-style: none;
      }
      .lake-export-codeblock__toolbar::-webkit-details-marker {
        display: none;
      }
      .lake-export-codeblock:not([open]) .lake-export-codeblock__toolbar {
        border-bottom: 0;
      }
      .lake-export-codeblock:not([open]) .lake-export-codeblock__caret {
        transform: rotate(-90deg);
      }
      .lake-export-codeblock__start,
      .lake-export-codeblock__actions {
        display: inline-flex;
        align-items: center;
        min-width: 0;
      }
      .lake-export-codeblock__start {
        flex: 1 1 auto;
        gap: 18px;
      }
      .lake-export-codeblock__actions {
        flex: 0 0 auto;
        gap: 18px;
        color: #2d3033;
        font-size: 15px;
        line-height: 1;
      }
      .lake-export-codeblock__caret {
        flex: 0 0 auto;
        color: #5d6469;
        font-size: 16px;
        line-height: 1;
        transition: transform 120ms ease;
      }
      .lake-export-codeblock__title {
        overflow: hidden;
        color: #2b2f33;
        font-size: 16px;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lake-export-codeblock__select {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        white-space: nowrap;
      }
      .lake-export-codeblock__select::after {
        width: 8px;
        height: 8px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        content: "";
        transform: translateY(-2px) rotate(45deg);
      }
      .lake-export-codeblock__divider {
        width: 1px;
        height: 20px;
        background: #e5e7e9;
      }
      .lake-export-codeblock__more {
        color: #5c6268;
        font-size: 18px;
        line-height: 1;
        letter-spacing: 2px;
      }
      .lake-export-codeblock__content {
        overflow: auto;
        background: #ffffff;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 15px;
        line-height: 1.65;
      }
      .lake-export-codeblock__table {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        min-width: max-content;
        padding: 12px 0 14px;
      }
      .lake-export-codeblock__line-number,
      .lake-export-codeblock__line {
        min-height: 24px;
        white-space: pre;
      }
      .lake-export-codeblock__line-number {
        min-width: 48px;
        padding: 0 18px 0 22px;
        color: #70767a;
        text-align: right;
        user-select: none;
      }
      .lake-export-codeblock__line {
        padding: 0 22px 0 4px;
        color: #2f3439;
      }
      .lake-export-document-title {
        margin: 0 0 32px;
        padding-bottom: 18px;
        border-bottom: 1px solid #edf0ee;
        color: #202428;
        font-size: clamp(28px, 4vw, 40px);
        line-height: 1.25;
      }
      .lake-export-expiration {
        margin: 0 0 18px;
        padding: 10px 12px;
        border: 1px solid #ffe0a3;
        border-radius: 6px;
        background: #fff8e6;
        color: #8a5a00;
        font-size: 14px;
      }
      .lake-export-attachment {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 34px;
        margin: 6px 0;
        padding: 10px 12px;
        border: 1px solid #8bbcff;
        border-radius: 6px;
        background: #f4f8ff;
        color: #1677ff;
        line-height: 1.35;
        text-decoration: none;
        vertical-align: middle;
      }
      .lake-export-attachment::before {
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
        margin-right: 8px;
        border-radius: 4px;
        color: #ffffff;
        background: #4f86e8;
        font-size: 12px;
        content: "📄";
      }
      .lake-export-attachment__name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lake-export-attachment__size {
        flex: 0 0 auto;
        margin-left: 6px;
        color: #4f86e8;
      }
      @media print {
        body {
          max-width: none;
          margin: 0;
          padding: 0;
          background: #ffffff;
        }
        .lake-export-shell {
          grid-template-columns: 150px minmax(0, 1fr);
          gap: 24px;
          padding: 0;
        }
        .lake-export-outline {
          position: static;
          border: 0;
          box-shadow: none;
          font-size: 12px;
        }
        .lake-export-document {
          padding: 0;
          border: 0;
          box-shadow: none;
        }
        .lake-export-resizer {
          display: none;
        }
        .lake-export-image-viewer {
          display: none !important;
        }
      }
      @media (max-width: 920px) {
        body {
          padding: 0 20px;
        }
        .lake-export-shell {
          display: block;
          padding: 28px 0;
        }
        .lake-export-outline {
          position: static;
          max-height: none;
          margin-bottom: 28px;
          padding-bottom: 18px;
          border-bottom: 1px solid #dfe3e6;
        }
        .lake-export-document {
          padding: 24px 20px;
        }
        .lake-export-content ne-columns-content {
          flex-direction: column;
        }
        .lake-export-content ne-column + ne-column {
          padding-top: 14px;
          border-top: 1px solid #edf0ee;
        }
        .lake-export-resizer {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="lake-export-shell">
      ${renderOutline(rendered.headings)}
      <button
        type="button"
        class="lake-export-resizer"
        aria-label="调整大纲宽度"
        aria-orientation="vertical"
        aria-valuemin="140"
        aria-valuemax="420"
        aria-valuenow="220"
        role="separator"
      ></button>
      <main class="lake-export-document">
        <h1 class="lake-export-document-title">${escapeHtml(title)}</h1>
        <article class="ne-doc-major-viewer ne-viewer ne-typography-classic ne-paragraph-spacing-relax fz16">
          <div class="lake-export-content ne-viewer-body">
            ${rendered.html}
          </div>
        </article>
      </main>
    </div>
    <div class="lake-export-image-viewer" role="dialog" aria-modal="true" aria-label="图片查看" hidden>
      <div class="lake-export-image-viewer__toolbar" role="toolbar" aria-label="图片缩放">
        <button type="button" class="lake-export-image-viewer__button" data-image-action="zoom-out" aria-label="缩小图片" title="缩小图片">−</button>
        <span class="lake-export-image-viewer__scale" aria-live="polite">100%</span>
        <button type="button" class="lake-export-image-viewer__button" data-image-action="zoom-in" aria-label="放大图片" title="放大图片">+</button>
        <button type="button" class="lake-export-image-viewer__button lake-export-image-viewer__button--reset" data-image-action="reset" aria-label="恢复原始比例" title="恢复原始比例">1:1</button>
        <button type="button" class="lake-export-image-viewer__button lake-export-image-viewer__button--close" data-image-action="close" aria-label="关闭图片查看" title="关闭图片查看">×</button>
      </div>
      <div class="lake-export-image-viewer__stage">
        <img class="lake-export-image-viewer__image" alt="" />
      </div>
    </div>
    <script>
      (() => {
        const initExportImageViewer = () => {
          const content = document.querySelector(".lake-export-content");
          const viewer = document.querySelector(".lake-export-image-viewer");
          const stage = viewer?.querySelector(".lake-export-image-viewer__stage");
          const image = viewer?.querySelector(".lake-export-image-viewer__image");
          const scaleLabel = viewer?.querySelector(".lake-export-image-viewer__scale");
          const zoomOut = viewer?.querySelector("[data-image-action='zoom-out']");
          const zoomIn = viewer?.querySelector("[data-image-action='zoom-in']");
          const reset = viewer?.querySelector("[data-image-action='reset']");
          const closeButton = viewer?.querySelector("[data-image-action='close']");
          if (!content || !viewer || !stage || !(image instanceof HTMLImageElement) || !scaleLabel || !zoomOut || !zoomIn || !reset || !closeButton) {
            return;
          }

          const minScale = 0.25;
          const maxScale = 4;
          const scaleStep = 0.25;
          let scale = 1;
          let baseWidth = 640;
          let previousFocus = null;
          const renderScale = () => {
            image.style.width = Math.round(baseWidth * scale) + "px";
            scaleLabel.textContent = Math.round(scale * 100) + "%";
            zoomOut.disabled = scale <= minScale;
            zoomIn.disabled = scale >= maxScale;
          };
          const setScale = (nextScale) => {
            scale = Math.min(maxScale, Math.max(minScale, nextScale));
            renderScale();
          };
          const close = () => {
            viewer.hidden = true;
            document.body.classList.remove("lake-export-image-viewer-open");
            image.removeAttribute("src");
            if (previousFocus instanceof HTMLElement) {
              previousFocus.focus();
            }
          };
          const open = (source) => {
            previousFocus = document.activeElement;
            scale = 1;
            baseWidth = Math.min(Math.max(source.naturalWidth, source.clientWidth, 640), Math.max(320, window.innerWidth - 96));
            image.alt = source.alt || "文档图片";
            image.src = source.currentSrc || source.src;
            viewer.hidden = false;
            document.body.classList.add("lake-export-image-viewer-open");
            renderScale();
            closeButton.focus();
          };

          image.addEventListener("load", () => {
            baseWidth = Math.min(Math.max(image.naturalWidth, 1), Math.max(320, window.innerWidth - 96));
            renderScale();
          });
          content.addEventListener("click", (event) => {
            if (event.target instanceof HTMLImageElement) {
              event.preventDefault();
              open(event.target);
            }
          });
          zoomOut.addEventListener("click", () => setScale(scale - scaleStep));
          zoomIn.addEventListener("click", () => setScale(scale + scaleStep));
          reset.addEventListener("click", () => setScale(1));
          closeButton.addEventListener("click", close);
          stage.addEventListener("wheel", (event) => {
            event.preventDefault();
            setScale(scale + (event.deltaY < 0 ? scaleStep : -scaleStep));
          }, { passive: false });
          viewer.addEventListener("click", (event) => {
            if (event.target === viewer || event.target === stage) {
              close();
            }
          });
          document.addEventListener("keydown", (event) => {
            if (viewer.hidden) {
              return;
            }
            if (event.key === "Escape") {
              close();
            } else if (event.key === "+" || event.key === "=") {
              setScale(scale + scaleStep);
            } else if (event.key === "-") {
              setScale(scale - scaleStep);
            }
          });
        };

        const initExportCollapses = () => {
          document.querySelectorAll("ne-collapse").forEach((collapse) => {
            if (!collapse.hasAttribute("ne-open")) {
              collapse.setAttribute("ne-open", "true");
            }

            const updateExpandedState = () => {
              const expanded = collapse.getAttribute("ne-open") !== "false";
              collapse.querySelectorAll(".collapse-controller, ne-summary").forEach((trigger) => {
                trigger.setAttribute("aria-expanded", String(expanded));
              });
            };
            const toggle = () => {
              const expanded = collapse.getAttribute("ne-open") !== "false";
              collapse.setAttribute("ne-open", expanded ? "false" : "true");
              updateExpandedState();
            };
            const triggers = collapse.querySelectorAll(".collapse-controller, ne-summary");
            triggers.forEach((trigger) => {
              trigger.setAttribute("role", "button");
              trigger.setAttribute("tabindex", "0");
              trigger.addEventListener("click", (event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("a, button, input, textarea, select")) {
                  return;
                }
                event.preventDefault();
                toggle();
              });
              trigger.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                toggle();
              });
            });
            updateExpandedState();
          });
        };

        initExportImageViewer();
        initExportCollapses();

        const shell = document.querySelector(".lake-export-shell");
        const resizer = document.querySelector(".lake-export-resizer");
        if (!shell || !resizer) {
          return;
        }

        const storageKey = "yuque-lake-export-outline-width:" + window.location.pathname;
        const minWidth = Number(resizer.getAttribute("aria-valuemin")) || 140;
        const maxWidth = Number(resizer.getAttribute("aria-valuemax")) || 420;
        const readCurrentWidth = () => Number.parseFloat(getComputedStyle(shell).getPropertyValue("--lake-export-outline-width")) || 220;
        const setOutlineWidth = (width) => {
          const nextWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
          shell.style.setProperty("--lake-export-outline-width", nextWidth + "px");
          resizer.setAttribute("aria-valuenow", String(nextWidth));
          try {
            window.localStorage.setItem(storageKey, String(nextWidth));
          } catch {
            // 本地文件禁用 localStorage 时，拖拽仍在当前页面生效。
          }
        };

        try {
          const savedWidth = Number(window.localStorage.getItem(storageKey));
          if (Number.isFinite(savedWidth)) {
            setOutlineWidth(savedWidth);
          }
        } catch {
          // 忽略本地文件环境的存储限制。
        }

        resizer.addEventListener("pointerdown", (event) => {
          const shellRect = shell.getBoundingClientRect();
          resizer.classList.add("is-dragging");
          resizer.setPointerCapture(event.pointerId);
          event.preventDefault();

          const onPointerMove = (moveEvent) => setOutlineWidth(moveEvent.clientX - shellRect.left);
          const onPointerUp = () => {
            resizer.classList.remove("is-dragging");
            resizer.removeEventListener("pointermove", onPointerMove);
          };

          resizer.addEventListener("pointermove", onPointerMove);
          resizer.addEventListener("pointerup", onPointerUp, { once: true });
          resizer.addEventListener("pointercancel", onPointerUp, { once: true });
        });

        resizer.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
            return;
          }
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          setOutlineWidth(readCurrentWidth() + direction * 12);
        });
      })();
    </script>
  </body>
</html>
`;
}

export async function lakeDocumentToHtmlWithResources(
  title: string,
  content: string,
  options: LakeDocumentResourceExportOptions,
): Promise<string> {
  const result = await rewriteExportResourceReferences(content, options, {
    inlineImages: options.embedImages || options.strategy === "bundle",
  });
  const nextContent = result.content;
  const html = await lakeDocumentToHtml(title, nextContent);
  if (options.strategy !== "signed-url") {
    return html;
  }
  return html.replace(
    "<main class=\"lake-export-document\">",
    `<main class="lake-export-document">
        <p class="lake-export-expiration">资源链接有效期：${formatTtl(options.signedUrlTtlSeconds)}</p>`,
  );
}

export async function lakeDocumentToHtmlBundle(
  title: string,
  content: string,
  options: LakeDocumentResourceExportOptions,
): Promise<Uint8Array> {
  const result = await rewriteExportResourceReferences(content, options, {
    assetPrefix: "assets",
    attachmentPrefix: "attachments",
  });
  return createZip([
    { path: "index.html", content: await lakeDocumentToHtml(title, result.content) },
    ...result.resources,
  ]);
}

export async function lakeWorkspaceToMarkdownZip(
  workspace: WorkspacePayload,
  readDocument: (path: string) => Promise<string>,
  convertDocument: LakeWorkspaceMarkdownConverter = (document, content) => (
    lakeDocumentToMarkdown(documentTitleFromPath(document.path), content)
  ),
): Promise<Uint8Array> {
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);
  const nodes = flattenDocumentTree(tree);
  const entries: ZipEntryInput[] = [];

  for (const node of nodes) {
    if (node.type === "folder") {
      entries.push({ path: `${normalizeZipPath(node.path)}/`, content: "" });
      continue;
    }

    if (node.document) {
      const content = await readDocument(node.document.path);
      entries.push({
        path: lakePathToMarkdownZipPath(node.document.path),
        content: await convertDocument(node.document, content),
      });
    }
  }

  return createZip(entries);
}

export async function lakeWorkspaceToMarkdownZipWithResources(
  workspace: WorkspacePayload,
  readDocument: (path: string) => Promise<string>,
  options: LakeDocumentResourceExportOptions,
  convertDocument: LakeWorkspaceMarkdownConverter = (document, content) => (
    lakeDocumentToMarkdown(documentTitleFromPath(document.path), content)
  ),
): Promise<Uint8Array> {
  return createZip(await lakeWorkspaceMarkdownEntriesWithResources(workspace, readDocument, options, convertDocument));
}

export async function lakeWorkspaceMarkdownEntriesWithResources(
  workspace: WorkspacePayload,
  readDocument: (path: string) => Promise<string>,
  options: LakeDocumentResourceExportOptions,
  convertDocument: LakeWorkspaceMarkdownConverter = (document, content) => (
    lakeDocumentToMarkdown(documentTitleFromPath(document.path), content)
  ),
): Promise<WorkspaceZipEntryInput[]> {
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);
  const nodes = flattenDocumentTree(tree);
  const entries: ZipEntryInput[] = [];

  for (const node of nodes) {
    if (node.type === "folder") {
      entries.push({ path: `${normalizeZipPath(node.path)}/`, content: "" });
      continue;
    }

    if (node.document) {
      const content = await readDocument(node.document.path);
      const markdownPath = lakePathToMarkdownZipPath(node.document.path);
      const markdownDirectory = dirname(markdownPath);
      const result = await rewriteExportResourceReferences(content, options, {
        assetPrefix: joinZipPath(markdownDirectory, "assets"),
        attachmentPrefix: joinZipPath(markdownDirectory, "attachments"),
        linkBasePath: markdownDirectory,
      });
      entries.push({
        path: markdownPath,
        content: await convertDocument(node.document, result.content),
      });
      entries.push(...result.resources);
    }
  }

  return entries;
}

export function workspaceEntriesToZip(entries: WorkspaceZipEntryInput[]): Uint8Array {
  return createZip(entries);
}

export function analyzeLakeDocumentExportResources(
  content: string,
  format: DocumentExportFormat,
  options: LakeDocumentResourceExportOptions,
): LakeDocumentExportResourceUsage {
  const usage: LakeDocumentExportResourceUsage = {
    hasResources: false,
    hasImageResources: false,
    hasFileResources: false,
  };

  if (format === "markdown") {
    for (const match of content.matchAll(markdownLinkPattern)) {
      const isImageLink = match[1] === "!";
      const label = match[2] ?? "";
      const url = match[3] ?? "";
      const resource = resolveExportResource(url, options, {
        kind: isImageLink ? "image" : "file",
        name: label || undefined,
      });
      markExportResourceUsage(usage, resource, isImageLink);
    }
    return usage;
  }

  const template = document.createElement("template");
  template.innerHTML = content;

  for (const image of Array.from(template.content.querySelectorAll("img[src]"))) {
    const src = image.getAttribute("src");
    const resource = src ? resolveExportResource(src, options, {
      kind: "image",
      name: image.getAttribute("alt") ?? undefined,
    }) : null;
    markExportResourceUsage(usage, resource, true);
  }

  for (const card of Array.from(template.content.querySelectorAll("card[name='file'], card[name='localdoc']"))) {
    const value = decodeLakeCardValue(card.getAttribute("value"));
    const resource = typeof value?.src === "string" ? resolveExportResource(value.src, options, {
      kind: "file",
      name: typeof value.name === "string" ? value.name : undefined,
      size: typeof value.size === "number" ? value.size : undefined,
      mimeType: typeof value.type === "string" ? value.type : undefined,
    }) : null;
    markExportResourceUsage(usage, resource, false);
  }

  for (const link of Array.from(template.content.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href");
    const resource = href ? resolveExportResource(href, options, {
      kind: "file",
      name: exportLinkName(link),
    }) : null;
    // 普通链接即使指向图片，也不能像正文图片一样内嵌；否则用户原本的下载链接会变成不可预期的大型 data URL。
    markExportResourceUsage(usage, resource, false);
  }

  return usage;
}

export function createOfficialLakeMarkdownConverter(): OfficialLakeMarkdownConverter {
  if (!window.Doc?.createOpenEditor) {
    throw new Error("语雀编辑器资源未加载，无法使用官方 Markdown 导出");
  }

  const host = document.createElement("div");
  host.setAttribute("data-lake-export-converter", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "960px",
    height: "720px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(host);

  let editor: LakeEditorInstance;
  try {
    editor = window.Doc.createOpenEditor(host, {
      input: {},
      toc: { enable: false },
      codeblock: {
        codemirrorURL: "/vendor/lakex-doc/codemirror.js",
      },
      math: {
        KaTexURL: "/vendor/lakex-doc/katex.min.js",
      },
      image: {},
      file: {},
    });
  } catch (error) {
    host.remove();
    throw error;
  }
  let disposed = false;

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    destroyEditor(editor);
    host.remove();
  };

  return {
    convert: async (document, lakeContent) => {
      editor.setDocument("text/lake", lakeContent);
      return markdownWithTitle(documentTitleFromPath(document.path), editor.getDocument("text/markdown"));
    },
    dispose,
  };
}

export function exportFileName(document: WorkspaceDocument, format: DocumentExportFormat): string {
  const extension = format === "markdown" ? markdownExtension : `.${format}`;
  return `${safeFileName(documentTitleFromPath(document.path))}${extension}`;
}

export function workspaceExportFileName(workspaceRoot: string): string {
  return `${safeFileName(basename(workspaceRoot))}${zipExtension}`;
}

function nodesToMarkdown(nodes: Node[]): string {
  return nodes.map(nodeToMarkdown).join("");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof Element)) {
    return "";
  }

  const children = () => nodesToMarkdown(Array.from(node.childNodes));
  const tagName = node.tagName.toLowerCase();

  if (tagName.match(/^h[1-6]$/)) {
    const level = Number(tagName.slice(1));
    return `\n\n${"#".repeat(level)} ${inlineText(children())}\n\n`;
  }

  switch (tagName) {
    case "p":
    case "div":
      return `\n\n${inlineText(children())}\n\n`;
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${inlineText(children())}**`;
    case "em":
    case "i":
      return `*${inlineText(children())}*`;
    case "s":
    case "del":
      return `~~${inlineText(children())}~~`;
    case "code":
      return node.closest("pre") ? node.textContent ?? "" : `\`${inlineText(children())}\``;
    case "pre":
      return `\n\n\`\`\`\n${node.textContent?.trim() ?? ""}\n\`\`\`\n\n`;
    case "a": {
      const text = inlineText(children()) || node.getAttribute("href") || "";
      const href = node.getAttribute("href");
      return href ? `[${text}](${href})` : text;
    }
    case "ul":
      return `\n${Array.from(node.children).map((child) => listItemToMarkdown(child, "-")).join("")}\n`;
    case "ol":
      return `\n${Array.from(node.children).map((child, index) => listItemToMarkdown(child, `${index + 1}.`)).join("")}\n`;
    case "blockquote":
      return `\n\n${children().trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    case "hr":
      return "\n\n---\n\n";
    case "table":
      return tableToMarkdown(node);
    case "card":
      return lakeCardToMarkdown(node);
    default:
      return children();
  }
}

function listItemToMarkdown(node: Element, marker: string): string {
  return `${marker} ${inlineText(nodesToMarkdown(Array.from(node.childNodes)))}\n`;
}

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"))
    .map((row) => Array.from(row.children).map((cell) => inlineText(cell.textContent ?? "")));
  if (rows.length === 0) {
    return "";
  }

  const header = rows[0];
  const separator = header.map(() => "---");
  const bodyRows = rows.slice(1);
  return `\n\n| ${header.join(" | ")} |\n| ${separator.join(" | ")} |\n${bodyRows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
}

function lakeCardToMarkdown(card: Element): string {
  const name = card.getAttribute("name");
  if (name !== "file" && name !== "localdoc") {
    return inlineText(card.textContent ?? "");
  }

  const value = decodeLakeCardValue(card.getAttribute("value"));
  if (!value) {
    return inlineText(card.textContent ?? "");
  }
  const src = value?.src;
  if (typeof src !== "string") {
    return inlineText(card.textContent ?? "");
  }

  const fileName = typeof value.name === "string" && value.name.trim() ? value.name : src;
  return `[${fileName}](${src})`;
}

function markdownWithTitle(title: string, markdown: string): string {
  return normalizeMarkdown(`# ${title}\n\n${markdown}`);
}

function destroyEditor(editor: LakeEditorInstance): void {
  try {
    if (typeof editor.destroy === "function") {
      editor.destroy();
      return;
    }
    editor.destory?.();
  } catch {
    // 导出结束后的清理失败不应阻断文件保存结果。
  }
}

function renderHtmlExportContent(content: string): { html: string; headings: ExportHeading[] } {
  const template = document.createElement("template");
  template.innerHTML = content;
  const headings = collectAndMarkHeadings(template.content);
  renderCodeblocks(template.content);
  renderAttachmentCards(template.content);
  return {
    headings,
    html: template.innerHTML,
  };
}

function collectAndMarkHeadings(root: DocumentFragment): ExportHeading[] {
  const headings: ExportHeading[] = [];
  const usedIds = new Set<string>();
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading, index) => {
    const text = inlineText(heading.textContent ?? "");
    if (!text) {
      return;
    }

    const id = uniqueId(`heading-${slugify(text) || index + 1}`, usedIds);
    heading.setAttribute("id", id);
    headings.push({
      id,
      level: Number(heading.tagName.slice(1)),
      text,
    });
  });
  return headings;
}

function renderCodeblocks(root: DocumentFragment): void {
  root.querySelectorAll("pre").forEach((pre, index) => {
    if (pre.closest(".lake-export-codeblock")) {
      return;
    }

    const language = readCodeblockLanguage(pre);
    const languageLabel = codeblockLanguageLabel(language);
    const themeLabel = readCodeblockTheme(pre);
    const title = readCodeblockTitle(pre, index);
    const codeText = pre.textContent ?? "";
    const codeLines = splitCodeLines(codeText);
    const details = document.createElement("details");
    details.className = "lake-export-codeblock";
    details.open = true;

    const summary = document.createElement("summary");
    summary.className = "lake-export-codeblock__toolbar";

    const start = document.createElement("span");
    start.className = "lake-export-codeblock__start";

    const caret = document.createElement("span");
    caret.className = "lake-export-codeblock__caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    start.append(caret);

    const titleNode = document.createElement("span");
    titleNode.className = "lake-export-codeblock__title";
    titleNode.textContent = title;
    start.append(titleNode);

    const actions = document.createElement("span");
    actions.className = "lake-export-codeblock__actions";
    actions.append(
      codeblockToolbarSelect("language", languageLabel),
      codeblockDivider(),
      codeblockToolbarSelect("theme", themeLabel),
      codeblockDivider(),
    );

    const more = document.createElement("span");
    more.className = "lake-export-codeblock__more";
    more.setAttribute("aria-label", "更多");
    more.textContent = "•••";
    actions.append(more);

    const content = document.createElement("div");
    content.className = "lake-export-codeblock__content";
    const codeTable = document.createElement("div");
    codeTable.className = "lake-export-codeblock__table";
    codeLines.forEach((line, lineIndex) => {
      const lineNumber = document.createElement("span");
      lineNumber.className = "lake-export-codeblock__line-number";
      lineNumber.textContent = String(lineIndex + 1);
      const lineNode = document.createElement("span");
      lineNode.className = "lake-export-codeblock__line";
      lineNode.textContent = line;
      codeTable.append(lineNumber, lineNode);
    });
    content.append(codeTable);

    summary.append(start, actions);
    details.append(summary, content);
    pre.replaceWith(details);
  });
}

function codeblockToolbarSelect(kind: string, label: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = `lake-export-codeblock__select lake-export-codeblock__select--${kind}`;
  node.textContent = label;
  return node;
}

function codeblockDivider(): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = "lake-export-codeblock__divider";
  node.setAttribute("aria-hidden", "true");
  return node;
}

function readCodeblockLanguage(pre: Element): string {
  const dataLanguage = pre.getAttribute("data-language")?.trim();
  if (dataLanguage) {
    return dataLanguage;
  }

  const languageClass = Array.from(pre.classList)
    .find((className) => className.startsWith("language-"));
  return languageClass?.replace(/^language-/, "").trim() ?? "";
}

function readCodeblockTitle(pre: Element, index: number): string {
  for (const attribute of ["data-title", "data-name", "data-filename", "title"]) {
    const value = pre.getAttribute(attribute)?.trim();
    if (value) {
      return value;
    }
  }
  return `代码块 ${index + 1}`;
}

function readCodeblockTheme(pre: Element): string {
  return pre.getAttribute("theme")?.trim() ||
    pre.getAttribute("data-theme")?.trim() ||
    "Yuque Light Pro";
}

function codeblockLanguageLabel(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (!normalized || normalized === "plain" || normalized === "plaintext" || normalized === "text") {
    return "Plain Text";
  }

  const knownLabels: Record<string, string> = {
    bash: "Bash",
    css: "CSS",
    html: "HTML",
    js: "JavaScript",
    javascript: "JavaScript",
    json: "JSON",
    md: "Markdown",
    markdown: "Markdown",
    shell: "Shell",
    sh: "Shell",
    sql: "SQL",
    ts: "TypeScript",
    tsx: "TSX",
    txt: "Plain Text",
    typescript: "TypeScript",
    xml: "XML",
    yaml: "YAML",
    yml: "YAML",
  };
  return knownLabels[normalized] ?? language;
}

function splitCodeLines(value: string): string[] {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "");
  return normalized ? normalized.split("\n") : [""];
}

function renderAttachmentCards(root: DocumentFragment): void {
  root.querySelectorAll("card[name='file'], card[name='localdoc']").forEach((card) => {
    const value = decodeLakeCardValue(card.getAttribute("value"));
    if (!value) {
      return;
    }
    const src = value?.src;
    if (typeof src !== "string") {
      return;
    }

    const link = document.createElement("a");
    link.className = "lake-export-attachment";
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const name = document.createElement("span");
    name.className = "lake-export-attachment__name";
    name.textContent = typeof value.name === "string" && value.name.trim() ? value.name : src;
    link.append(name);

    const size = readFileSize({
      size: typeof value.size === "number" || typeof value.size === "string" ? value.size : undefined,
    });
    if (size) {
      const sizeNode = document.createElement("span");
      sizeNode.className = "lake-export-attachment__size";
      sizeNode.textContent = `(${size})`;
      link.append(sizeNode);
    }

    card.replaceWith(link);
  });
}

async function rewriteExportResourceReferences(
  content: string,
  options: LakeDocumentResourceExportOptions,
  bundle?: ResourceBundleRewriteOptions,
): Promise<ResourceRewriteResult> {
  if (options.strategy === "bundle" && !bundle) {
    return {
      content: await inlineHtmlImages(content, options),
      resources: [],
    };
  }
  if (options.strategy === "bundle") {
    return rewriteHtmlResourceReferencesToBundle(content, options, bundle);
  }
  if (!options.signResource) {
    throw new Error("缺少短时签名链接生成器");
  }

  const template = document.createElement("template");
  template.innerHTML = content;
  const rewrites = new Map<string, string>();
  const sign = async (resourceRef: string, filename?: string) => {
    const cached = rewrites.get(resourceRef);
    if (cached) {
      return cached;
    }
    const signedUrl = await options.signResource?.(resourceRef, filename, options.signedUrlTtlSeconds);
    if (!signedUrl) {
      throw new Error("短时签名链接生成失败");
    }
    rewrites.set(resourceRef, signedUrl);
    return signedUrl;
  };

  for (const image of Array.from(template.content.querySelectorAll("img[src]"))) {
    const src = image.getAttribute("src");
    const resource = src ? resolveExportResource(src, options, {
      kind: "image",
      name: image.getAttribute("alt") ?? undefined,
    }) : null;
    if (resource) {
      if (bundle?.inlineImages) {
        if (!options.loadResource) {
          throw new Error("缺少本地资源包读取器");
        }
        image.setAttribute("src", await resourceToOptimizedImageDataUrl(resource.resourceRef, options.loadResource, resourceMimeType(resource.resource)));
      } else {
        image.setAttribute("src", await sign(resource.resourceRef, resourceFileName(resource.resource, image.getAttribute("alt") ?? undefined)));
      }
    }
  }

  for (const card of Array.from(template.content.querySelectorAll("card[name='file'], card[name='localdoc']"))) {
    const value = decodeLakeCardValue(card.getAttribute("value"));
    if (!value || typeof value.src !== "string") {
      continue;
    }
    const resource = resolveExportResource(value.src, options, {
      kind: "file",
      name: typeof value.name === "string" ? value.name : undefined,
      size: typeof value.size === "number" ? value.size : undefined,
      mimeType: typeof value.type === "string" ? value.type : undefined,
    });
    if (!resource) {
      continue;
    }
    value.src = await sign(resource.resourceRef, resourceFileName(resource.resource, typeof value.name === "string" ? value.name : undefined));
    card.setAttribute("value", encodeLakeCardValue(value));
  }

  for (const link of Array.from(template.content.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href");
    const resource = href ? resolveExportResource(href, options, {
      kind: "file",
      name: exportLinkName(link),
    }) : null;
    if (!resource) {
      continue;
    }
    link.setAttribute("href", await sign(resource.resourceRef, resourceFileName(resource.resource, exportLinkName(link))));
    markExportAttachmentLink(link);
  }

  return { content: template.innerHTML, resources: [] };
}

interface ResourceBundleRewriteOptions {
  assetPrefix?: string;
  attachmentPrefix?: string;
  linkBasePath?: string;
  inlineImages?: boolean;
}

interface ResolvedExportResource {
  resourceRef: string;
  resource: LakeResourceReference;
}

async function rewriteHtmlResourceReferencesToBundle(
  content: string,
  options: LakeDocumentResourceExportOptions,
  bundle?: ResourceBundleRewriteOptions,
): Promise<ResourceRewriteResult> {
  if (!options.loadResource) {
    throw new Error("缺少本地资源包读取器");
  }
  const template = document.createElement("template");
  template.innerHTML = content;
  const writer = createBundleResourceWriter(options.loadResource);

  for (const image of Array.from(template.content.querySelectorAll("img[src]"))) {
    const src = image.getAttribute("src");
    const resource = src ? resolveExportResource(src, options, {
      kind: "image",
      name: image.getAttribute("alt") ?? undefined,
    }) : null;
    if (!src || !resource) {
      continue;
    }
    if (bundle?.inlineImages) {
      image.setAttribute("src", await resourceToOptimizedImageDataUrl(resource.resourceRef, options.loadResource, resourceMimeType(resource.resource)));
      continue;
    }
    const path = await writer.add(
      resource.resourceRef,
      resourceFileName(resource.resource, image.getAttribute("alt") ?? undefined),
      bundle?.assetPrefix ?? "assets",
    );
    image.setAttribute("src", relativeZipLink(path, bundle?.linkBasePath));
  }

  for (const card of Array.from(template.content.querySelectorAll("card[name='file'], card[name='localdoc']"))) {
    const value = decodeLakeCardValue(card.getAttribute("value"));
    const src = value?.src;
    const resource = typeof src === "string" ? resolveExportResource(src, options, {
      kind: "file",
      name: typeof value?.name === "string" ? value.name : undefined,
      size: typeof value?.size === "number" ? value.size : undefined,
      mimeType: typeof value?.type === "string" ? value.type : undefined,
    }) : null;
    if (!value || typeof src !== "string" || !resource) {
      continue;
    }
    const path = await writer.add(
      resource.resourceRef,
      resourceFileName(resource.resource, typeof value.name === "string" ? value.name : undefined),
      bundle?.attachmentPrefix ?? "attachments",
    );
    value.src = relativeZipLink(path, bundle?.linkBasePath);
    card.setAttribute("value", encodeLakeCardValue(value));
  }

  for (const link of Array.from(template.content.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href");
    const resource = href ? resolveExportResource(href, options, {
      kind: "file",
      name: exportLinkName(link),
    }) : null;
    if (!href || !resource) {
      continue;
    }
    const prefix = resource.resource.kind === "image" ? bundle?.assetPrefix ?? "assets" : bundle?.attachmentPrefix ?? "attachments";
    const path = await writer.add(resource.resourceRef, resourceFileName(resource.resource, exportLinkName(link)), prefix);
    link.setAttribute("href", relativeZipLink(path, bundle?.linkBasePath));
    markExportAttachmentLink(link);
  }

  return { content: template.innerHTML, resources: writer.entries() };
}

async function inlineHtmlImages(
  content: string,
  options: LakeDocumentResourceExportOptions,
): Promise<string> {
  if (!options.loadResource) {
    return content;
  }
  const template = document.createElement("template");
  template.innerHTML = content;

  for (const image of Array.from(template.content.querySelectorAll("img[src]"))) {
    const src = image.getAttribute("src");
    const resource = src ? resolveExportResource(src, options, {
      kind: "image",
      name: image.getAttribute("alt") ?? undefined,
    }) : null;
    if (resource?.resource.kind === "image") {
      image.setAttribute("src", await resourceToOptimizedImageDataUrl(resource.resourceRef, options.loadResource, resourceMimeType(resource.resource)));
    }
  }

  return template.innerHTML;
}

async function rewriteMarkdownResourceReferences(
  markdown: string,
  options: LakeDocumentResourceExportOptions,
  bundle?: ResourceBundleRewriteOptions,
): Promise<ResourceRewriteResult> {
  if (options.strategy === "signed-url") {
    if (!options.signResource) {
      throw new Error("缺少短时签名链接生成器");
    }
    return {
      content: await replaceMarkdownLinks(markdown, async (url, label) => {
        const resource = resolveExportResource(url, options, { kind: "file", name: label || undefined });
        return resource
          ? options.signResource?.(resource.resourceRef, label || resource.resource.name, options.signedUrlTtlSeconds) ?? url
          : url;
      }),
      resources: [],
    };
  }
  if (!bundle) {
    return { content: markdown, resources: [] };
  }
  if (!options.loadResource) {
    throw new Error("缺少本地资源包读取器");
  }
  const loadResource = options.loadResource;

  const writer = createBundleResourceWriter(loadResource);
  const content = await replaceMarkdownLinks(markdown, async (url, label, isImage) => {
    const resource = resolveExportResource(url, options, {
      kind: isImage ? "image" : "file",
      name: label || undefined,
    });
    if (!resource) {
      return url;
    }
    if (bundle.inlineImages && isImage && resource.resource.kind === "image") {
      return resourceToOptimizedImageDataUrl(resource.resourceRef, loadResource, resourceMimeType(resource.resource));
    }
    const prefix = isImage ? bundle.assetPrefix ?? "assets" : bundle.attachmentPrefix ?? "attachments";
    const path = await writer.add(resource.resourceRef, resourceFileName(resource.resource, label), prefix);
    return relativeZipLink(path, bundle.linkBasePath);
  });

  return { content, resources: writer.entries() };
}

async function replaceMarkdownLinks(
  markdown: string,
  replace: (url: string, label: string, isImage: boolean) => Promise<string>,
): Promise<string> {
  let output = "";
  let lastIndex = 0;

  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const index = match.index ?? 0;
    output += markdown.slice(lastIndex, index);
    const isImage = match[1] === "!";
    const label = match[2] ?? "";
    const url = match[3] ?? "";
    output += `${isImage ? "!" : ""}[${label}](${await replace(url, label, isImage)})`;
    lastIndex = index + match[0].length;
  }

  return output + markdown.slice(lastIndex);
}

const markdownLinkPattern = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;

function markExportResourceUsage(
  usage: LakeDocumentExportResourceUsage,
  resource: ResolvedExportResource | null,
  canInlineAsImage: boolean,
): void {
  if (!resource) {
    return;
  }

  usage.hasResources = true;
  if (canInlineAsImage && resource.resource.kind === "image") {
    usage.hasImageResources = true;
    return;
  }
  usage.hasFileResources = true;
}

function resolveExportResource(
  value: string,
  options: LakeDocumentResourceExportOptions,
  metadata: { kind?: ResourceKind; name?: string; size?: number; mimeType?: string } = {},
): ResolvedExportResource | null {
  const resourceRef = parseResourceReference(value)
    ? value
    : resourceReferenceFromPublicUrl(value, options, metadata);
  const resource = resourceRef ? parseResourceReference(resourceRef) : null;
  return resourceRef && resource ? { resourceRef, resource } : null;
}

function exportLinkName(link: Element): string | undefined {
  const label = inlineText(link.textContent ?? "");
  return label || link.getAttribute("download") || link.getAttribute("title") || undefined;
}

function resourceFileName(resource: LakeResourceReference, fallback?: string): string {
  return resource.name || fallback || basename(resource.key) || "resource";
}

function resourceMimeType(resource: LakeResourceReference): string | undefined {
  return resource.mimeType || mimeTypeFromFilename(resource.name || resource.key);
}

function markExportAttachmentLink(link: Element): void {
  link.classList.add("lake-export-attachment");
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
}

function createBundleResourceWriter(loadResource: ExportResourceLoader) {
  const usedPaths = new Set<string>();
  const resources = new Map<string, ZipEntryInput>();
  return {
    add: async (resourceRef: string, filename: string, prefix: string) => {
      const cached = resources.get(resourceRef);
      if (cached) {
        return cached.path;
      }
      const path = uniqueBundleResourcePath(prefix, filename, usedPaths);
      const bytes = await loadResource(resourceRef);
      const entry = { path, content: bytes };
      resources.set(resourceRef, entry);
      return path;
    },
    entries: () => Array.from(resources.values()),
  };
}

function uniqueBundleResourcePath(prefix: string, filename: string, usedPaths: Set<string>): string {
  const safePrefix = normalizeZipPath(prefix) || "assets";
  const safeName = safeFileName(filename || "resource");
  const extensionIndex = safeName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
  const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : "";
  let candidate = `${safePrefix}/${safeName}`;
  let index = 2;
  while (usedPaths.has(bundleResourcePathCollisionKey(candidate))) {
    candidate = `${safePrefix}/${stem}-${index}${extension}`;
    index += 1;
  }
  usedPaths.add(bundleResourcePathCollisionKey(candidate));
  return candidate;
}

function bundleResourcePathCollisionKey(path: string): string {
  return path
    .split("/")
    .map((part) => part.normalize("NFC").toLocaleLowerCase("en-US").replace(/[. ]+$/g, ""))
    .join("/");
}

async function resourceToOptimizedImageDataUrl(
  resourceRef: string,
  loadResource: ExportResourceLoader,
  mimeType?: string,
): Promise<string> {
  const bytes = await loadResource(resourceRef);
  const normalizedMimeType = mimeType ?? "application/octet-stream";
  const original = bytesToDataUrl(bytes, normalizedMimeType);
  const optimized = await tryOptimizeImageDataUrl(bytes, normalizedMimeType);
  return optimized && optimized.length < original.length ? optimized : original;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function tryOptimizeImageDataUrl(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  if (!shouldOptimizeImage(mimeType) || typeof createImageBitmap !== "function") {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(new Blob([copyBytesToArrayBuffer(bytes)], { type: mimeType }));
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, "image/webp", scale < 1 ? 0.92 : 0.9);
    return blob ? blobToDataUrl(blob) : null;
  } catch {
    return null;
  }
}

function shouldOptimizeImage(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith("image/") &&
    normalized !== "image/gif" &&
    normalized !== "image/svg+xml" &&
    normalized !== "image/webp";
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function mimeTypeFromFilename(filename: string): string | undefined {
  const extension = filename.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}

function formatTtl(seconds: number): string {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  if (seconds < 24 * 3600) {
    return `${Math.round(seconds / 3600)} 小时`;
  }
  return `${Math.round(seconds / 86400)} 天`;
}

function renderOutline(headings: ExportHeading[]): string {
  const items = headings.length > 0
    ? headings
      .map((heading) => `<a class="lake-export-outline__item lake-export-outline__item--${Math.min(heading.level, 6)}" href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>`)
      .join("\n")
    : '<span class="lake-export-outline__empty">暂无大纲</span>';

  return `<aside class="lake-export-outline" aria-label="大纲">
        <p class="lake-export-outline__title">大纲</p>
        ${items}
      </aside>`;
}

function readFileSize(value: { size?: number | string }): string | null {
  if (typeof value.size === "string" && value.size.trim()) {
    return value.size.trim();
  }
  if (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size <= 0) {
    return null;
  }
  if (value.size < 1024) {
    return `${value.size} B`;
  }
  if (value.size < 1024 * 1024) {
    return `${Math.round(value.size / 1024)} kB`;
  }
  return `${(value.size / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeMarkdown(markdown: string): string {
  return `${markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

async function loadExportStyles(): Promise<string> {
  if (typeof fetch !== "function") {
    return "";
  }

  const results = await Promise.allSettled(
    lakeStylePaths.map(async (path) => {
      const response = await fetch(path);
      return response.ok ? response.text() : "";
    }),
  );

  return results
    .map((result) => result.status === "fulfilled" ? result.value : "")
    .filter(Boolean)
    .join("\n");
}

function inlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, usedIds: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function dirname(path: string): string {
  const parts = normalizeZipPath(path).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinZipPath(...parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/");
}

function relativeZipLink(path: string, basePath?: string): string {
  const normalizedPath = normalizeZipPath(path);
  const normalizedBase = normalizeZipPath(basePath ?? "");
  if (!normalizedBase) {
    return encodeZipLinkPath(normalizedPath);
  }

  const fromParts = normalizedBase.split("/").filter(Boolean);
  const toParts = normalizedPath.split("/").filter(Boolean);
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return encodeZipLinkPath([...fromParts.map(() => ".."), ...toParts].join("/") || basename(normalizedPath));
}

function encodeZipLinkPath(path: string): string {
  return path.replace(/%/g, "%25").replace(/#/g, "%23");
}

function safeFileName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "未命名";
}

interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

interface ZipEntry {
  pathBytes: Uint8Array;
  contentBytes: Uint8Array;
  crc: number;
  localHeaderOffset: number;
  isDirectory: boolean;
}

function createZip(inputs: ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  const date = new Date();
  const dosTime = toDosTime(date);
  const dosDate = toDosDate(date);

  for (const input of inputs) {
    const normalizedPath = normalizeZipPath(input.path);
    const path = input.path.endsWith("/") ? `${normalizedPath}/` : normalizedPath;
    const contentBytes = input.path.endsWith("/") ? new Uint8Array() : bytesForZipContent(input.content);
    const pathBytes = utf8(path);
    const crc = crc32(contentBytes);
    const localHeaderOffset = byteLength(chunks);
    const entry: ZipEntry = {
      pathBytes,
      contentBytes,
      crc,
      localHeaderOffset,
      isDirectory: path.endsWith("/"),
    };
    entries.push(entry);
    chunks.push(zipLocalHeader(entry, dosTime, dosDate), pathBytes, contentBytes);
  }

  const centralDirectoryOffset = byteLength(chunks);
  for (const entry of entries) {
    chunks.push(zipCentralDirectoryHeader(entry, dosTime, dosDate), entry.pathBytes);
  }
  const centralDirectorySize = byteLength(chunks) - centralDirectoryOffset;
  chunks.push(zipEndOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset));

  return concatBytes(chunks);
}

function zipLocalHeader(entry: ZipEntry, dosTime: number, dosDate: number): Uint8Array {
  const output = new Uint8Array(30);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime, true);
  view.setUint16(12, dosDate, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.contentBytes.length, true);
  view.setUint32(22, entry.contentBytes.length, true);
  view.setUint16(26, entry.pathBytes.length, true);
  view.setUint16(28, 0, true);
  return output;
}

function zipCentralDirectoryHeader(entry: ZipEntry, dosTime: number, dosDate: number): Uint8Array {
  const output = new Uint8Array(46);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime, true);
  view.setUint16(14, dosDate, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.contentBytes.length, true);
  view.setUint32(24, entry.contentBytes.length, true);
  view.setUint16(28, entry.pathBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, entry.isDirectory ? 0x10 : 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  return output;
}

function zipEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const output = new Uint8Array(22);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return output;
}

function lakePathToMarkdownZipPath(path: string): string {
  return normalizeZipPath(path.replace(/\.lake$/i, markdownExtension));
}

function normalizeZipPath(path: string): string {
  return path.split("/")
    .filter(Boolean)
    .map((part) => safeFileName(part))
    .join("/");
}

function toDosTime(date: Date): number {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function toDosDate(date: Date): number {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesForZipContent(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? utf8(content) : content;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(byteLength(chunks));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function byteLength(chunks: Uint8Array[]): number {
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}
