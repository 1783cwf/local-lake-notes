import { screen } from "@testing-library/react";

import {
  createLakeEditor,
  createLakeViewer,
  destroyLakeEditor,
  extractLakeFileCards,
  hasLakeEditorRuntime,
  hasLakeViewerRuntime,
} from "./lakeEditorAdapter";
import type { LakeEditorInstance } from "./editorTypes";

const originalNavigatorClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalNavigatorClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalNavigatorClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
  document.body.innerHTML = "";
  window.Doc = undefined;
});

test("缺少 window.Doc 时报告运行时不可用", () => {
  window.Doc = undefined;

  expect(hasLakeEditorRuntime()).toBe(false);
  expect(hasLakeViewerRuntime()).toBe(false);
  expect(() =>
    createLakeEditor(document.createElement("div"), {
      onContentChange: vi.fn(),
      uploadImage: vi.fn(),
      uploadFile: vi.fn(),
      downloadFile: vi.fn(),
    }),
  ).toThrow("语雀编辑器资源未加载");
  expect(() =>
    createLakeViewer(document.createElement("div"), {
      downloadFile: vi.fn(),
    }),
  ).toThrow("语雀阅读器资源未加载");
});

test("创建编辑器时配置 Lake 图片、附件上传和大纲能力", () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  const created = createLakeEditor(document.createElement("div"), {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });

  expect(created).toBe(editor);
  expect(window.Doc.createOpenEditor).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      input: {},
      toc: expect.objectContaining({ enable: true }),
      codeblock: expect.objectContaining({
        codemirrorURL: "/vendor/lakex-doc/codemirror.js",
      }),
      math: expect.objectContaining({
        KaTexURL: "/vendor/lakex-doc/katex.min.js",
      }),
      image: expect.objectContaining({ createUploadPromise: expect.any(Function) }),
      file: expect.objectContaining({
        createUploadPromise: expect.any(Function),
        getFileDownloadURL: expect.any(Function),
        getPreviewUrl: expect.any(Function),
      }),
    }),
  );
  const editorOptions = vi.mocked(window.Doc.createOpenEditor).mock.calls[0]?.[1] as {
    image?: { isCaptureImageURL?: (url: string) => boolean };
  };
  expect(editorOptions.image?.isCaptureImageURL?.("asset://localhost/preview.png")).toBe(false);
  expect(editorOptions.image?.isCaptureImageURL?.("blob:local-preview")).toBe(false);
  expect(editorOptions.image?.isCaptureImageURL?.("data:image/png;base64,AQI=")).toBe(false);
  expect(editorOptions.image?.isCaptureImageURL?.("http://asset.localhost/preview.png")).toBe(false);
  expect(editorOptions.image?.isCaptureImageURL?.("yuque-resource://yuque/images/a.png?kind=image")).toBe(true);
  destroyLakeEditor(created);
});

test("嵌入式 Lake 编辑器可以关闭大纲", () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  createLakeEditor(document.createElement("div"), {
    tocEnabled: false,
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });

  expect(window.Doc.createOpenEditor).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      toc: {
        enable: false,
        normalView: false,
      },
    }),
  );
});

test("创建阅读器时使用语雀 Viewer 并绑定展示态基础能力", () => {
  const viewer: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => {
      throw new Error("不应创建编辑器");
    }),
    createOpenViewer: vi.fn(() => viewer),
  };
  const root = document.createElement("div");

  const created = createLakeViewer(root, {
    downloadFile: vi.fn(),
  });

  expect(created).toBe(viewer);
  expect(hasLakeViewerRuntime()).toBe(true);
  expect(window.Doc.createOpenViewer).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      input: {},
      toc: expect.objectContaining({ enable: true }),
      codeblock: expect.objectContaining({
        codemirrorURL: "/vendor/lakex-doc/codemirror.js",
      }),
      math: expect.objectContaining({
        KaTexURL: "/vendor/lakex-doc/katex.min.js",
      }),
      file: expect.objectContaining({
        getFileDownloadURL: expect.any(Function),
        getPreviewUrl: expect.any(Function),
      }),
    }),
  );
  expect(root.querySelector(".ne-doc-major-viewer")).toBeInstanceOf(HTMLDivElement);
  expect(window.Doc.createOpenEditor).not.toHaveBeenCalled();
  destroyLakeEditor(created);
});

test("编辑器图片支持打开查看器并放大缩小", async () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");
  document.body.append(root);

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = '<div class="ne-engine"><img src="data:image/png;base64,QQ==" alt="示例图"></div>';
  await waitForMutationObserver();

  root.querySelector("img")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(screen.getByRole("dialog", { name: "图片查看" })).toBeInTheDocument();
  expect(screen.getByText("100%")).toBeInTheDocument();

  screen.getByRole("button", { name: "放大图片" }).click();
  expect(screen.getByText("125%")).toBeInTheDocument();
  screen.getByRole("button", { name: "缩小图片" }).click();
  expect(screen.getByText("100%")).toBeInTheDocument();
  screen.getByRole("button", { name: "关闭图片查看" }).click();
  expect(screen.queryByRole("dialog", { name: "图片查看" })).not.toBeInTheDocument();

  destroyLakeEditor(created);
});

test("阅读器支持按需关闭大纲配置", () => {
  const viewer: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => {
      throw new Error("不应创建编辑器");
    }),
    createOpenViewer: vi.fn(() => viewer),
  };

  createLakeViewer(document.createElement("div"), {
    tocEnabled: false,
    downloadFile: vi.fn(),
  });

  expect(window.Doc.createOpenViewer).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      toc: {
        enable: false,
        normalView: false,
      },
    }),
  );
});

test("第三方销毁移除编辑器挂载节点时保留外层容器", () => {
  let mountElement: HTMLElement | null = null;
  const shell = document.createElement("div");
  document.body.append(shell);
  window.Doc = {
    createOpenEditor: vi.fn((element) => {
      mountElement = element;
      return {
        setDocument: vi.fn(),
        getDocument: vi.fn(() => ""),
        on: vi.fn(),
        destroy: vi.fn(() => {
          element.remove();
        }),
      };
    }),
  };

  const created = createLakeEditor(shell, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });

  expect(mountElement).not.toBe(shell);
  expect(mountElement && shell.contains(mountElement)).toBe(true);

  destroyLakeEditor(created);

  expect(shell.isConnected).toBe(true);
  expect(shell.childElementCount).toBe(0);
});

test("选中编辑态附件卡片后通过悬浮下载按钮使用 Lake 附件名称下载", () => {
  const value = `data:${encodeURIComponent(JSON.stringify({
    src: "https://oss.example/files/2026/04/test-file.pdf",
    name: "测试资料.pdf",
    download: true,
  }))}`;
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => `<p><card type="inline" name="file" value="${value}"></card></p>`),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const downloadFile = vi.fn();
  const root = document.createElement("div");

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile,
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `<ne-card data-card-name="file" data-card-type="inline"><span class="ne-card-file" data-testid="ne-card-file">测试资料.pdf</span></ne-card>`;
  root.querySelector("ne-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(downloadFile).not.toHaveBeenCalled();
  const toolbar = document.body.querySelector(".lake-file-floating-toolbar");
  expect(toolbar).toBeInTheDocument();
  expect(toolbar).not.toHaveAttribute("hidden");
  expect(toolbar?.querySelector("[data-lake-file-action='preview']")).not.toBeInTheDocument();
  expect(toolbar).not.toHaveTextContent("阅读页可下载");
  expect(toolbar?.querySelectorAll("button")).toHaveLength(1);
  toolbar
    ?.querySelector("[data-lake-file-action='download']")
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(downloadFile).toHaveBeenCalledWith({
    name: "测试资料.pdf",
    src: "https://oss.example/files/2026/04/test-file.pdf",
  });
  destroyLakeEditor(created);
});

test("点击附件文字节点时也能显示下载工具条", () => {
  const value = `data:${encodeURIComponent(JSON.stringify({
    src: "https://oss.example/files/text-target.zip",
    name: "text-target.zip",
  }))}`;
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => `<p><card type="inline" name="file" value="${value}"></card></p>`),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");
  document.body.append(root);

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `<ne-card data-card-name="file" data-card-type="inline"><span class="ne-card-file">text-target.zip</span></ne-card>`;
  root.querySelector(".ne-card-file")?.firstChild?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(document.body.querySelector(".lake-file-floating-toolbar")).not.toHaveAttribute("hidden");
  destroyLakeEditor(created);
});

test("代码块缺少内置复制入口时自动补充右侧复制代码按钮", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");
  document.body.append(root);

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `
    <div class="ne-codeblock" data-codeblock-mode="yaml">
      <div class="ne-codeblock-inner">
        <div class="CodeMirror-code">
          <pre>name: test</pre>
          <pre>revision: 6</pre>
        </div>
      </div>
    </div>
  `;
  await waitForMutationObserver();

  const copyButton = root.querySelector("[data-lake-codeblock-action='copy']");
  expect(copyButton).toBeInTheDocument();
  expect(copyButton?.closest(".end-nav")).toBeInTheDocument();
  copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();

  expect(writeText).toHaveBeenCalledWith("name: test\nrevision: 6");
  destroyLakeEditor(created);
});

test("代码块复制会保留 CodeMirror 行格式和缩进", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");
  document.body.append(root);

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `
    <div class="ne-codeblock" data-codeblock-mode="yaml">
      <div class="ne-codeblock-inner">
        <div class="cm-content">
          <div class="cm-line">spec:</div>
          <div class="cm-line">  selector:</div>
          <div class="cm-line">    app: demo</div>
          <div class="cm-line"></div>
          <div class="cm-line">  replicas: 2</div>
        </div>
      </div>
    </div>
  `;
  await waitForMutationObserver();

  root.querySelector("[data-lake-codeblock-action='copy']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();

  expect(writeText).toHaveBeenCalledWith("spec:\n  selector:\n    app: demo\n\n  replicas: 2");
  destroyLakeEditor(created);
});

test("代码块复制优先读取 Lake 原始数据避免长代码块只复制可见行", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const completeCode = [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    "  name: demo",
    "  namespace: default",
  ].join("\n");
  const value = `data:${encodeURIComponent(JSON.stringify({
    id: "code-1",
    mode: "yaml",
    code: completeCode,
  }))}`;
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => `<card type="inline" name="codeblock" value="${value}"></card>`),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");
  document.body.append(root);

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `
    <div class="ne-codeblock" id="code-1" data-codeblock-mode="yaml">
      <div class="ne-codeblock-inner">
        <div class="cm-content">
          <div class="cm-line">apiVersion: apps/v1</div>
          <div class="cm-line">kind: Deployment</div>
        </div>
      </div>
    </div>
  `;
  await waitForMutationObserver();

  root.querySelector("[data-lake-codeblock-action='copy']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();

  expect(writeText).toHaveBeenCalledWith(completeCode);
  destroyLakeEditor(created);
});

test("代码块已有内置复制入口时不重复补充按钮", async () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const root = document.createElement("div");

  const created = createLakeEditor(root, {
    onContentChange: vi.fn(),
    uploadImage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  });
  root.querySelector(".lake-editor-mount")!.innerHTML = `
    <div class="ne-codeblock">
      <div class="codeblock-menu"><div class="end-nav"><span class="ne-codeblock-copy">复制代码</span></div></div>
      <code>already has copy</code>
    </div>
  `;
  await waitForMutationObserver();

  expect(root.querySelectorAll("[data-lake-codeblock-action='copy']")).toHaveLength(0);
  destroyLakeEditor(created);
});

function waitForMutationObserver(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

test("从 Lake 内容中提取附件卡片下载信息", () => {
  const value = `data:${encodeURIComponent(JSON.stringify({
    src: "https://oss.example/files/a.txt",
    name: "a.txt",
  }))}`;

  expect(extractLakeFileCards(`<p><card type="inline" name="file" value="${value}"></card></p>`)).toEqual([
    {
      download: true,
      name: "a.txt",
      src: "https://oss.example/files/a.txt",
    },
  ]);
});

test("销毁编辑器时兼容 destroy 和 destory", () => {
  const destroy = vi.fn();
  destroyLakeEditor({
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy,
  });
  expect(destroy).toHaveBeenCalled();
});

test("销毁编辑器异常时不向外抛出", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  expect(() =>
    destroyLakeEditor({
      setDocument: vi.fn(),
      getDocument: vi.fn(() => ""),
      on: vi.fn(),
      destroy: vi.fn(() => {
        throw new Error("销毁失败");
      }),
    }),
  ).not.toThrow();
  expect(warn).toHaveBeenCalled();
});
