import type { TypographySettings, UploadImageOutput } from "../../app/appState";
import type { LakeEditorInstance } from "./editorTypes";

export interface CreateLakeEditorOptions {
  uploadImage: (request: unknown) => Promise<UploadImageOutput>;
  uploadFile: (file: unknown) => Promise<UploadImageOutput>;
  downloadFile: (file: LakeFileDownload) => void | Promise<void>;
  onContentChange: () => void;
  tocEnabled?: boolean;
  typography?: TypographySettings;
}

export interface CreateLakeViewerOptions {
  downloadFile: (file: LakeFileDownload) => void | Promise<void>;
  tocEnabled?: boolean;
  typography?: TypographySettings;
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

interface LakeCodeblock {
  id: string;
  code: string;
}

const fileCardHostSelector = "ne-card[data-card-name='file'], ne-card[data-card-name='localdoc']";
const fileCardBodySelector = ".ne-card-file, .ne-card-local-doc";
const codeblockSelector = ".ne-codeblock, pre.ne-codeblock, pre[data-language], .ne-code-viewer";
const codeblockCopySelector = ".ne-codeblock-copy, .ne-codeblock-copy-icon, [data-lake-codeblock-action='copy']";
const imageViewerMinScale = 0.25;
const imageViewerMaxScale = 4;
const imageViewerScaleStep = 0.25;

export function hasLakeEditorRuntime(): boolean {
  return Boolean(window.Doc?.createOpenEditor);
}

export function hasLakeViewerRuntime(): boolean {
  return Boolean(window.Doc?.createOpenViewer);
}

export function createLakeEditor(
  element: HTMLElement,
  options: CreateLakeEditorOptions,
): LakeEditorInstance {
  if (!window.Doc?.createOpenEditor) {
    throw new Error("语雀编辑器资源未加载");
  }

  const mountElement = createLakeMount(element, "ne-doc-major-editor");
  const editor = window.Doc.createOpenEditor(mountElement, {
    input: {},
    ...createLakeRuntimeOptions(options),
    image: {
      createUploadPromise: options.uploadImage,
      isCaptureImageURL(url: string) {
        return !isPreviewUrl(url) && !url.startsWith("http://") && !url.startsWith("https://");
      },
    },
    file: {
      ...createLakeFileOptions(options.downloadFile),
      createUploadPromise: options.uploadFile,
    },
  });

  bindLakeInstanceCleanup(element, editor, [
    bindRenderedFileToolbar(element, editor, options.downloadFile),
    bindRenderedCodeblockCopyButton(element, editor),
    bindRenderedImageViewer(element),
  ]);
  editor.on("contentchange", options.onContentChange);
  return editor;
}

export function createLakeViewer(
  element: HTMLElement,
  options: CreateLakeViewerOptions,
): LakeEditorInstance {
  if (!window.Doc?.createOpenViewer) {
    throw new Error("语雀阅读器资源未加载");
  }

  const mountElement = createLakeMount(element, "ne-doc-major-viewer");
  const viewer = window.Doc.createOpenViewer(mountElement, {
    input: {},
    ...createLakeRuntimeOptions(options),
  });

  bindLakeInstanceCleanup(element, viewer, [
    bindRenderedFileToolbar(element, viewer, options.downloadFile),
    bindRenderedCodeblockCopyButton(element, viewer),
    bindRenderedImageViewer(element),
  ]);
  return viewer;
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

function createLakeMount(element: HTMLElement, className: string): HTMLDivElement {
  const mountElement = document.createElement("div");
  mountElement.className = `lake-editor-mount ${className}`;
  element.replaceChildren(mountElement);
  return mountElement;
}

function createLakeRuntimeOptions(options: CreateLakeViewerOptions): Record<string, unknown> {
  return {
    defaultFontsize: options.typography?.defaultFontSize ?? 19,
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
    file: createLakeFileOptions(options.downloadFile),
  };
}

function createLakeFileOptions(downloadFile: (file: LakeFileDownload) => void | Promise<void>): Record<string, unknown> {
  return {
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
      downloadFileCard(cardData, downloadFile);
    },
    previewFileHandler(cardData: unknown) {
      downloadFileCard(cardData, downloadFile);
    },
    onViewerInlineFileClick(event: MouseEvent, ui: unknown) {
      event.preventDefault();
      downloadFileCard(ui, downloadFile);
    },
  };
}

function bindLakeInstanceCleanup(
  element: HTMLElement,
  editor: LakeEditorInstance,
  unbinders: Array<() => void>,
): void {
  const destroy = editor.destroy?.bind(editor);
  const destory = editor.destory?.bind(editor);
  let destroyed = false;
  const destroyEditor = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unbinders.forEach((unbind) => unbind());
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

function bindRenderedCodeblockCopyButton(element: HTMLElement, editor: LakeEditorInstance): () => void {
  const observer = new MutationObserver(() => {
    enhanceRenderedCodeblocks(element, editor);
  });

  enhanceRenderedCodeblocks(element, editor);
  observer.observe(element, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    element.querySelectorAll("[data-lake-codeblock-action='copy']").forEach((button) => button.remove());
  };
}

function bindRenderedImageViewer(element: HTMLElement): () => void {
  let closeViewer: (() => void) | null = null;
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !target.closest(".ne-engine, .ne-viewer-body, ne-card[data-card-name='image']")) {
      return;
    }

    event.preventDefault();
    closeViewer?.();
    closeViewer = openImageViewer(target, () => {
      closeViewer = null;
    });
  };

  element.addEventListener("click", onClick);
  return () => {
    element.removeEventListener("click", onClick);
    closeViewer?.();
  };
}

function openImageViewer(sourceImage: HTMLImageElement, onClose: () => void): () => void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const viewer = document.createElement("div");
  viewer.className = "lake-image-viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "图片查看");

  const toolbar = document.createElement("div");
  toolbar.className = "lake-image-viewer__toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "图片缩放");
  const scaleLabel = document.createElement("span");
  scaleLabel.className = "lake-image-viewer__scale";
  scaleLabel.setAttribute("aria-live", "polite");

  const stage = document.createElement("div");
  stage.className = "lake-image-viewer__stage";
  const image = document.createElement("img");
  image.className = "lake-image-viewer__image";
  image.alt = sourceImage.alt || "文档图片";
  stage.append(image);

  let scale = 1;
  let baseWidth = Math.min(Math.max(sourceImage.naturalWidth, sourceImage.clientWidth, 640), Math.max(320, window.innerWidth - 96));
  let zoomOut: HTMLButtonElement;
  let zoomIn: HTMLButtonElement;
  const renderScale = () => {
    image.style.width = `${Math.round(baseWidth * scale)}px`;
    scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    zoomOut.disabled = scale <= imageViewerMinScale;
    zoomIn.disabled = scale >= imageViewerMaxScale;
  };
  const setScale = (nextScale: number) => {
    scale = Math.min(imageViewerMaxScale, Math.max(imageViewerMinScale, nextScale));
    renderScale();
  };

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    document.body.classList.remove("lake-image-viewer-open");
    viewer.remove();
    previousFocus?.focus();
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    } else if (event.key === "+" || event.key === "=") {
      setScale(scale + imageViewerScaleStep);
    } else if (event.key === "-") {
      setScale(scale - imageViewerScaleStep);
    }
  };

  zoomOut = createImageViewerButton("缩小图片", "−", () => setScale(scale - imageViewerScaleStep));
  zoomIn = createImageViewerButton("放大图片", "+", () => setScale(scale + imageViewerScaleStep));
  const reset = createImageViewerButton("恢复原始比例", "1:1", () => setScale(1));
  const closeButton = createImageViewerButton("关闭图片查看", "×", close);
  closeButton.classList.add("lake-image-viewer__close");
  toolbar.append(zoomOut, scaleLabel, zoomIn, reset, closeButton);
  viewer.append(toolbar, stage);

  image.addEventListener("load", () => {
    baseWidth = Math.min(Math.max(image.naturalWidth, 1), Math.max(320, window.innerWidth - 96));
    renderScale();
  }, { once: true });
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    setScale(scale + (event.deltaY < 0 ? imageViewerScaleStep : -imageViewerScaleStep));
  }, { passive: false });
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer || event.target === stage) {
      close();
    }
  });
  document.addEventListener("keydown", onKeyDown);
  document.body.classList.add("lake-image-viewer-open");
  document.body.append(viewer);
  image.src = sourceImage.currentSrc || sourceImage.src;
  renderScale();
  closeButton.focus();
  return close;
}

function createImageViewerButton(label: string, text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lake-image-viewer__button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function enhanceRenderedCodeblocks(element: HTMLElement, editor: LakeEditorInstance): void {
  listRenderedCodeblocks(element).forEach((codeblock) => {
    if (!(codeblock instanceof HTMLElement) || codeblock.querySelector(codeblockCopySelector)) {
      return;
    }

    const codeText = readCodeblockText(element, editor, codeblock);
    if (!codeText) {
      return;
    }

    const button = createCodeblockCopyButton(element, editor, codeblock);
    const endNav = findOrCreateCodeblockEndNav(codeblock);
    endNav.append(button);
  });
}

function createCodeblockCopyButton(
  element: HTMLElement,
  editor: LakeEditorInstance,
  codeblock: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ne-codeblock-copy lake-codeblock-copy-button";
  button.dataset.lakeCodeblockAction = "copy";
  button.title = "复制代码";
  button.setAttribute("aria-label", "复制代码");
  button.innerHTML = `${iconSvg("copy")}<span>复制代码</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyRenderedCodeblock(element, editor, codeblock, button);
  });
  return button;
}

async function copyRenderedCodeblock(
  element: HTMLElement,
  editor: LakeEditorInstance,
  codeblock: HTMLElement,
  button: HTMLButtonElement,
): Promise<void> {
  const codeText = readCodeblockText(element, editor, codeblock);
  if (!codeText) {
    return;
  }

  // 桌面 WebView 可能限制 Clipboard API；失败时回退到 execCommand，保证代码块操作可用。
  const copied = await writeClipboardText(codeText);
  showCodeblockCopyState(button, copied ? "已复制" : "复制失败");
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走兼容路径。
  }

  return copyTextBySelection(text);
}

function copyTextBySelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function showCodeblockCopyState(button: HTMLButtonElement, text: string): void {
  const label = button.querySelector("span");
  const previousText = label?.textContent ?? "复制代码";
  if (label) {
    label.textContent = text;
  }

  window.setTimeout(() => {
    if (label?.isConnected) {
      label.textContent = previousText;
    }
  }, 1400);
}

function findOrCreateCodeblockEndNav(codeblock: HTMLElement): HTMLElement {
  const existingEndNav = codeblock.querySelector(".codeblock-menu .end-nav");
  if (existingEndNav instanceof HTMLElement) {
    return existingEndNav;
  }

  const existingMenu = codeblock.querySelector(".codeblock-menu");
  if (existingMenu instanceof HTMLElement) {
    const endNav = document.createElement("div");
    endNav.className = "end-nav";
    existingMenu.append(endNav);
    return endNav;
  }

  const menu = document.createElement("div");
  menu.className = "codeblock-menu lake-codeblock-copy-menu";
  const startNav = document.createElement("div");
  startNav.className = "start-nav";
  const languageLabel = readRenderedCodeblockLanguage(codeblock);
  if (languageLabel) {
    const language = document.createElement("span");
    language.className = "ne-codeblock-mode-name";
    language.textContent = languageLabel;
    startNav.append(language);
  }
  const endNav = document.createElement("div");
  endNav.className = "end-nav";
  menu.append(startNav, endNav);
  codeblock.prepend(menu);
  return endNav;
}

function readCodeblockText(element: HTMLElement, editor: LakeEditorInstance, codeblock: HTMLElement): string {
  // CodeMirror 长代码块会按视口懒渲染，DOM 里可能只有可见行；优先读 Lake 原始数据才能复制完整代码。
  return readOriginalCodeblockText(element, editor, codeblock) ?? readRenderedCodeblockText(codeblock);
}

function readOriginalCodeblockText(
  element: HTMLElement,
  editor: LakeEditorInstance,
  codeblock: HTMLElement,
): string | null {
  try {
    const codeblocks = extractLakeCodeblocks(editor.getDocument("text/lake"));
    const codeblockId = readRenderedCodeblockId(codeblock);
    if (codeblockId) {
      const matched = codeblocks.find((item) => item.id === codeblockId);
      if (matched) {
        return matched.code;
      }
    }

    const renderedCodeblocks = listRenderedCodeblocks(element);
    const codeblockIndex = renderedCodeblocks.indexOf(codeblock);
    return codeblockIndex >= 0 ? codeblocks[codeblockIndex]?.code ?? null : null;
  } catch {
    return null;
  }
}

function readRenderedCodeblockText(codeblock: HTMLElement): string {
  // CodeMirror 5/6 的 DOM 都按行渲染；必须逐行读取，避免 textContent 把换行和缩进压成一行。
  const codeMirrorLines = readCodeMirrorLines(codeblock);
  if (codeMirrorLines.length > 0) {
    return codeMirrorLines.join("\n");
  }

  const codeElement = codeblock.querySelector("code");
  if (codeElement?.textContent) {
    return codeElement.textContent;
  }

  const cloned = codeblock.cloneNode(true);
  if (!(cloned instanceof HTMLElement)) {
    return "";
  }
  cloned.querySelectorAll(".codeblock-menu, .lake-codeblock-copy-button").forEach((node) => node.remove());
  return cloned.textContent ?? "";
}

function readCodeMirrorLines(codeblock: HTMLElement): string[] {
  const codeMirror6Lines = Array.from(codeblock.querySelectorAll(".cm-content .cm-line, .cm-line"))
    .filter((line) => !line.closest(".codeblock-menu"))
    .map((line) => line.textContent ?? "");
  if (codeMirror6Lines.length > 0) {
    return codeMirror6Lines;
  }

  return Array.from(codeblock.querySelectorAll(".CodeMirror-code pre.CodeMirror-line, .CodeMirror-code pre.CodeMirror-line-like, .CodeMirror-code pre, .CodeMirror-line"))
    .filter((line) => !line.closest(".codeblock-menu"))
    .map((line) => line.textContent ?? "");
}

function listRenderedCodeblocks(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll(codeblockSelector))
    .filter((codeblock): codeblock is HTMLElement => codeblock instanceof HTMLElement);
}

function extractLakeCodeblocks(content: string): LakeCodeblock[] {
  const template = document.createElement("template");
  template.innerHTML = content;

  return Array.from(template.content.querySelectorAll("card[name='codeblock'], pre.ne-codeblock, pre[data-language]"))
    .map(extractLakeCodeblock)
    .filter((codeblock): codeblock is LakeCodeblock => Boolean(codeblock));
}

function extractLakeCodeblock(node: Element): LakeCodeblock | null {
  if (node.matches("card[name='codeblock']")) {
    const payload = decodeLakeCardPayload(node.getAttribute("value"));
    if (!payload) {
      return null;
    }

    const code = payload.code;
    if (typeof code !== "string") {
      return null;
    }

    return {
      id: readString(payload.id) ?? readString(node.getAttribute("id")) ?? "",
      code,
    };
  }

  if (node instanceof HTMLPreElement) {
    return {
      id: readString(node.getAttribute("id")) ?? "",
      code: node.querySelector("code")?.textContent ?? node.textContent ?? "",
    };
  }

  return null;
}

function readRenderedCodeblockId(codeblock: HTMLElement): string | null {
  return (
    readString(codeblock.getAttribute("data-lake-id")) ??
    readString(codeblock.getAttribute("id")) ??
    readString(codeblock.closest("[data-card-name='codeblock']")?.getAttribute("data-lake-id")) ??
    readString(codeblock.closest("[data-card-name='codeblock']")?.getAttribute("id"))
  );
}

function readRenderedCodeblockLanguage(codeblock: HTMLElement): string {
  return (
    codeblock.getAttribute("data-codeblock-mode") ??
    codeblock.getAttribute("data-language") ??
    codeblock.querySelector(".ne-codeblock-mode-name")?.textContent ??
    ""
  );
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

function iconSvg(name: "download" | "copy"): string {
  const paths = {
    download: '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
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
  const decoded = decodeLakeCardPayload(value) as Partial<LakeFileCard> | null;
  const src = readString(decoded?.src);
  const name = readString(decoded?.name) ?? "";
  if (!src) {
    return null;
  }
  return {
    name,
    src,
    download: decoded?.download !== false,
  };
}

function decodeLakeCardPayload(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const payload = value.startsWith("data:") ? value.slice("data:".length) : value;
  try {
    const decoded = JSON.parse(decodeURIComponent(payload));
    return decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded : null;
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
