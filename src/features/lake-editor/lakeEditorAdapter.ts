import type { UploadImageOutput } from "../../app/appState";
import type { LakeEditorInstance } from "./editorTypes";

export interface CreateLakeEditorOptions {
  uploadImage: (request: unknown) => Promise<UploadImageOutput>;
  uploadFile: (file: unknown) => Promise<UploadImageOutput>;
  downloadFile: (file: LakeFileDownload) => void | Promise<void>;
  onContentChange: () => void;
  tocEnabled?: boolean;
}

export interface LakeFileDownload {
  name: string;
  src: string;
}

interface LakeFileCard {
  name: string;
  src: string;
  download: boolean;
}

const fileCardHostSelector = "ne-card[data-card-name='file'], ne-card[data-card-name='localdoc']";
const fileCardBodySelector = ".ne-card-file, .ne-card-local-doc";

export function hasLakeEditorRuntime(): boolean {
  return Boolean(window.Doc?.createOpenEditor);
}

export function createLakeEditor(
  element: HTMLElement,
  options: CreateLakeEditorOptions,
): LakeEditorInstance {
  if (!window.Doc?.createOpenEditor) {
    throw new Error("语雀编辑器资源未加载");
  }

  const mountElement = document.createElement("div");
  mountElement.className = "lake-editor-mount ne-doc-major-editor";
  element.replaceChildren(mountElement);

  const editor = window.Doc.createOpenEditor(mountElement, {
    input: {},
    defaultFontsize: 19,
    toc: {
      enable: options.tocEnabled ?? true,
      normalView: options.tocEnabled ?? true,
    },
    codeblock: {
      codemirrorURL: "/vendor/lakex-doc/codemirror.js",
    },
    math: {
      KaTexURL: "/vendor/lakex-doc/katex.min.js",
    },
    image: {
      createUploadPromise: options.uploadImage,
      isCaptureImageURL(url: string) {
        return !isPreviewUrl(url) && !url.startsWith("http://") && !url.startsWith("https://");
      },
    },
    file: {
      createUploadPromise: options.uploadFile,
      getFileDownloadURL(src: string) {
        return normalizeFileUrl(src);
      },
      getPreviewUrl(src: string) {
        return normalizeFileUrl(src);
      },
      canDownload(cardData: unknown) {
        return Boolean(extractCardDataSrc(cardData));
      },
      canPreview(cardData: unknown) {
        return Boolean(extractCardDataSrc(cardData));
      },
      downloadFileHandler(cardData: unknown) {
        downloadFileCard(cardData, options.downloadFile);
      },
      previewFileHandler(cardData: unknown) {
        downloadFileCard(cardData, options.downloadFile);
      },
      onViewerInlineFileClick(event: MouseEvent, ui: unknown) {
        event.preventDefault();
        downloadFileCard(ui, options.downloadFile);
      },
    },
  });

  const unbindFileToolbar = bindRenderedFileToolbar(element, editor, options.downloadFile);
  const destroy = editor.destroy?.bind(editor);
  const destory = editor.destory?.bind(editor);
  let destroyed = false;
  const destroyEditor = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unbindFileToolbar();
    if (destroy) {
      destroy();
    } else {
      destory?.();
    }
    // Lake destroy 可能会移除自己的挂载节点；这里兜底清理外层壳内残留，
    // 但外层壳始终交给 React 卸载，避免 React 再 removeChild 一个已被第三方移除的节点。
    element.replaceChildren();
  };
  editor.destroy = destroyEditor;
  editor.destory = destroyEditor;

  editor.on("contentchange", options.onContentChange);
  return editor;
}

export function destroyLakeEditor(editor: LakeEditorInstance | null): void {
  if (!editor) {
    return;
  }

  try {
    if (typeof editor.destroy === "function") {
      editor.destroy();
      return;
    }

    if (typeof editor.destory === "function") {
      editor.destory();
    }
  } catch (error) {
    console.warn("销毁语雀编辑器失败", error);
  }
}

export function extractLakeFileCards(content: string): LakeFileCard[] {
  const template = document.createElement("template");
  template.innerHTML = content;

  return Array.from(template.content.querySelectorAll("card[name='file'], card[name='localdoc']"))
    .map((card) => decodeLakeCardValue(card.getAttribute("value")))
    .filter((value): value is LakeFileCard => Boolean(value?.src))
    .map((value) => ({
      name: value.name,
      src: normalizeFileUrl(value.src),
      download: value.download,
    }));
}

function bindRenderedFileToolbar(
  element: HTMLElement,
  editor: LakeEditorInstance,
  downloadFile: (file: LakeFileDownload) => void | Promise<void>,
): () => void {
  const toolbar = createFileToolbar();
  let activeCard: HTMLElement | null = null;
  let activeFile: LakeFileDownload | null = null;

  const showForCard = (fileCard: HTMLElement) => {
    const file = findRenderedFileDownload(element, editor, fileCard);
    if (!file) {
      return;
    }

    activeCard?.classList.remove("lake-file-card-active");
    activeCard = fileCard;
    activeFile = file;
    activeCard.classList.add("lake-file-card-active");
    toolbar.hidden = false;
    positionFileToolbar(toolbar, activeCard);
  };

  const hideToolbar = () => {
    activeCard?.classList.remove("lake-file-card-active");
    activeCard = null;
    activeFile = null;
    toolbar.hidden = true;
  };

  const onClick = (event: MouseEvent) => {
    const target = targetElement(event.target);
    if (target && toolbar.contains(target)) {
      return;
    }

    const fileCard = findRenderedFileCard(element, target);
    if (!fileCard) {
      hideToolbar();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    showForCard(fileCard);
  };

  const onPointerOver = (event: PointerEvent) => {
    const target = targetElement(event.target);
    const fileCard = findRenderedFileCard(element, target);
    if (fileCard) {
      showForCard(fileCard);
    }
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    const target = targetElement(event.target);
    if (
      target &&
      (toolbar.contains(target) ||
        (activeCard?.contains(target) ?? false) ||
        Boolean(findRenderedFileCard(element, target)))
    ) {
      return;
    }
    hideToolbar();
  };

  const onDownload = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeFile) {
      void downloadFile({ name: activeFile.name, src: activeFile.src });
    }
  };

  toolbar.querySelector("[data-lake-file-action='download']")?.addEventListener("click", onDownload);
  document.body.append(toolbar);
  element.addEventListener("click", onClick, true);
  element.addEventListener("pointerover", onPointerOver, true);
  element.addEventListener("scroll", hideToolbar, true);
  window.addEventListener("resize", hideToolbar);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);

  return () => {
    element.removeEventListener("click", onClick, true);
    element.removeEventListener("pointerover", onPointerOver, true);
    element.removeEventListener("scroll", hideToolbar, true);
    window.removeEventListener("resize", hideToolbar);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    toolbar.querySelector("[data-lake-file-action='download']")?.removeEventListener("click", onDownload);
    toolbar.remove();
  };
}

function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Text) {
    return target.parentElement;
  }

  return null;
}

function findRenderedFileCard(root: HTMLElement, target: Element | null): HTMLElement | null {
  const host = target?.closest(fileCardHostSelector);
  if (host instanceof HTMLElement && root.contains(host)) {
    return host;
  }

  const body = target?.closest(fileCardBodySelector);
  if (body instanceof HTMLElement && root.contains(body)) {
    return body;
  }

  return null;
}

function findRenderedFileDownload(
  element: HTMLElement,
  editor: LakeEditorInstance,
  fileCard: HTMLElement,
): LakeFileDownload | null {
  const link = fileCard instanceof HTMLAnchorElement ? fileCard : fileCard.querySelector("a[href]");
  const href = link?.getAttribute("href");
  if (href) {
    const src = normalizeFileUrl(href);
    return {
      name: readString(link?.getAttribute("download")) ?? readRenderedFileName(fileCard) ?? fileNameFromUrl(src),
      src,
    };
  }

  const renderedCards = listRenderedFileCards(element);
  const cardIndex = renderedCards.indexOf(fileCard);
  if (cardIndex < 0) {
    return null;
  }

  const fileCards = extractLakeFileCards(editor.getDocument("text/lake"));
  const file = fileCards[cardIndex];
  return file?.download === false ? null : file ?? null;
}

function listRenderedFileCards(element: HTMLElement): HTMLElement[] {
  const hosts = Array.from(element.querySelectorAll(fileCardHostSelector))
    .filter((card): card is HTMLElement => card instanceof HTMLElement);
  if (hosts.length > 0) {
    return hosts;
  }

  return Array.from(element.querySelectorAll(fileCardBodySelector))
    .filter((card): card is HTMLElement => card instanceof HTMLElement);
}

function downloadFileCard(cardData: unknown, downloadFile: (file: LakeFileDownload) => void | Promise<void>): void {
  const file = extractCardData(cardData);
  if (file?.src && file.download !== false) {
    void downloadFile({
      name: file.name || fileNameFromUrl(file.src),
      src: normalizeFileUrl(file.src),
    });
  }
}

function createFileToolbar(): HTMLDivElement {
  const toolbar = document.createElement("div");
  toolbar.className = "lake-file-floating-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "附件操作");
  toolbar.hidden = true;
  toolbar.innerHTML = `
    <button type="button" class="lake-file-floating-toolbar__button" data-lake-file-action="download" title="下载附件" aria-label="下载附件">
      ${iconSvg("download")}
    </button>
  `;
  return toolbar;
}

function positionFileToolbar(toolbar: HTMLElement, fileCard: HTMLElement): void {
  const cardRect = fileCard.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const left = clamp(cardRect.left, 8, window.innerWidth - toolbarRect.width - 8);
  const aboveTop = cardRect.top - toolbarRect.height - 8;
  const top = aboveTop >= 8 ? aboveTop : cardRect.bottom + 8;

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function iconSvg(name: "download"): string {
  const paths = {
    download: '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function extractCardDataSrc(cardData: unknown): string | null {
  return extractCardData(cardData)?.src ?? null;
}

function extractCardData(cardData: unknown): LakeFileCard | null {
  if (!cardData || typeof cardData !== "object") {
    return null;
  }

  const candidate = cardData as Record<string, unknown>;
  const directSrc = readString(candidate.src) ?? readString(candidate.url);
  if (directSrc) {
    return {
      name: readString(candidate.name) ?? readString(candidate.filename) ?? readString(candidate.fileName) ?? "",
      src: normalizeFileUrl(directSrc),
      download: candidate.download !== false,
    };
  }

  const getSrc = candidate.getSrc;
  if (typeof getSrc === "function") {
    const src = getSrc.call(cardData);
    if (typeof src === "string" && src.trim()) {
      return {
        name: readString(candidate.name) ?? readString(candidate.filename) ?? readString(candidate.fileName) ?? "",
        src: normalizeFileUrl(src),
        download: candidate.download !== false,
      };
    }
  }

  const getCardValue = candidate.getCardValue;
  if (typeof getCardValue === "function") {
    const value = getCardValue.call(cardData);
    const file = extractCardData(value);
    if (file) {
      return file;
    }
  }

  return extractCardData(candidate.cardData) ?? extractCardData(candidate.props);
}

function decodeLakeCardValue(value: string | null): LakeFileCard | null {
  if (!value) {
    return null;
  }

  const payload = value.startsWith("data:") ? value.slice("data:".length) : value;
  try {
    const decoded = JSON.parse(decodeURIComponent(payload)) as Partial<LakeFileCard>;
    const src = readString(decoded.src);
    const name = readString(decoded.name) ?? "";
    if (!src) {
      return null;
    }
    return {
      name,
      src,
      download: decoded.download !== false,
    };
  } catch {
    return null;
  }
}

function normalizeFileUrl(src: string): string {
  return src.trim();
}

function isPreviewUrl(src: string): boolean {
  const value = src.trim();
  return (
    value.startsWith("asset://") ||
    value.startsWith("tauri://") ||
    value.startsWith("file://") ||
    value.startsWith("blob:") ||
    value.startsWith("data:") ||
    value.startsWith("http://asset.localhost/") ||
    value.startsWith("https://asset.localhost/")
  );
}

function readRenderedFileName(fileCard: HTMLElement): string | null {
  return readString(fileCard.textContent);
}

function fileNameFromUrl(src: string): string {
  try {
    const url = new URL(src);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "") || "附件";
  } catch {
    return src.split("/").filter(Boolean).pop() ?? "附件";
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
