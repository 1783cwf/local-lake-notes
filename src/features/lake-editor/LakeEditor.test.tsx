import { render, screen, waitFor } from "@testing-library/react";

import { LakeEditor } from "./LakeEditor";
import type { LakeEditorInstance } from "./editorTypes";

const documentEntry = {
  id: "a.lake",
  path: "a.lake",
  name: "a",
  parentPath: "",
  size: 0,
  kind: "lake" as const,
};

afterEach(() => {
  window.Doc = undefined;
});

test("没有文档时显示工作台空状态", () => {
  render(
    <LakeEditor
      document={null}
      content=""
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(screen.getByText("选择或新建 Lake 文档")).toBeInTheDocument();
});

test("打开文档时把 text/lake 内容设置进语雀编辑器", async () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>内容</p>");
  });
});

test("打开含资源文档时先显示占位内容再异步替换预览", async () => {
  let resolvePreview!: (value: string) => void;
  const resourceRef = "yuque-resource://webdav/images/a.png?provider=webdav&kind=image";
  let editorContent = "";
  const editor: LakeEditorInstance = {
    setDocument: vi.fn((_, nextContent) => {
      editorContent = nextContent;
    }),
    getDocument: vi.fn(() => editorContent),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const onPrepareResourcePreview = vi.fn(() => new Promise<string>((resolve) => {
    resolvePreview = resolve;
  }));

  render(
    <LakeEditor
      document={documentEntry}
      content={`<p>正文</p><p><img src="${resourceRef}"></p>`}
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={onPrepareResourcePreview}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(editor.setDocument).toHaveBeenCalledWith(
      "text/lake",
      expect.stringContaining("正文"),
    );
  });
  expect(editor.setDocument).toHaveBeenCalledWith(
    "text/lake",
    expect.stringContaining(encodeURIComponent("图片加载中...")),
  );

  resolvePreview("asset://preview/a.png");

  await waitFor(() => {
    expect(editor.setDocument).toHaveBeenLastCalledWith(
      "text/lake",
      expect.stringContaining("asset://preview/a.png"),
    );
  });
});

test("打开多图片文档时按配置并发准备资源预览", async () => {
  const refs = Array.from({ length: 9 }, (_, index) => (
    `yuque-resource://webdav/images/${index}.png?provider=webdav&kind=image`
  ));
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => refs.map((resourceRef) => `<img src="${resourceRef}">`).join("")),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const onPrepareResourcePreview = vi.fn(async (resourceRef: string) => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await Promise.resolve();
    activeRequests -= 1;
    return `${resourceRef}&preview=1`;
  });

  render(
    <LakeEditor
      document={documentEntry}
      content={refs.map((resourceRef) => `<img src="${resourceRef}">`).join("")}
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={onPrepareResourcePreview}
      resourcePreviewConcurrency={6}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onPrepareResourcePreview).toHaveBeenCalledTimes(refs.length);
  });
  expect(maxActiveRequests).toBe(6);
});

test("同一路径文档元数据刷新时不重建语雀编辑器实例", async () => {
  const destroy = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>内容</p>"),
    on: vi.fn(),
    destroy,
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  const stableProps = {
    manualSaveRequest: 0,
    exportRequest: null,
    onSave: vi.fn(),
    onExportContent: vi.fn(),
    onUploadImage: vi.fn(),
    onUploadFile: vi.fn(),
    onDownloadFile: vi.fn(),
    onPrepareResourcePreview: vi.fn(async (resourceRef: string) => resourceRef),
    onSaveStatusChange: vi.fn(),
  };

  const { rerender } = render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      {...stableProps}
    />,
  );
  await waitFor(() => expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>内容</p>"));

  rerender(
    <LakeEditor
      document={{ ...documentEntry, modifiedAt: "2026-05-07T00:00:00Z" }}
      content="<p>内容</p>"
      {...stableProps}
    />,
  );

  expect(window.Doc.createOpenEditor).toHaveBeenCalledTimes(1);
  expect(destroy).not.toHaveBeenCalled();
});

test("关闭当前文档时在编辑器容器移除前销毁 Lake 实例", () => {
  const destroyCalls: boolean[] = [];
  window.Doc = {
    createOpenEditor: vi.fn((element) => ({
      setDocument: vi.fn(),
      getDocument: vi.fn(() => "<p>内容</p>"),
      on: vi.fn(),
      destroy: vi.fn(() => {
        destroyCalls.push(element.isConnected);
      }),
    })),
  };

  const { rerender } = render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  rerender(
    <LakeEditor
      document={null}
      content=""
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(destroyCalls).toEqual([true]);
});

test("创建 Lake 实例失败时显示错误状态", () => {
  window.Doc = {
    createOpenEditor: vi.fn(() => {
      throw new Error("初始化失败");
    }),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(screen.getByText("编辑器加载失败")).toBeInTheDocument();
  expect(screen.getByText("初始化失败")).toBeInTheDocument();
});

test("收到 HTML 导出请求时读取语雀 HTML 内容", async () => {
  const onExportContent = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type) => type === "text/html" ? "<p><img src=\"file:///tmp/a.png\"></p>" : "<p>Lake 内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      manualSaveRequest={0}
      exportRequest={{
        id: 1,
        format: "html",
        document: documentEntry,
        resourceStrategy: "bundle",
        signedUrlTtlSeconds: 86400,
      }}
      onSave={vi.fn()}
      onExportContent={onExportContent}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onExportContent).toHaveBeenCalledWith(
      {
        id: 1,
        format: "html",
        document: documentEntry,
        resourceStrategy: "bundle",
        signedUrlTtlSeconds: 86400,
      },
      "<p><img src=\"file:///tmp/a.png\"></p>",
    );
  });
  expect(editor.getDocument).toHaveBeenCalledWith("text/html");
});

test("收到 Markdown 导出请求时读取语雀原生 Markdown 内容", async () => {
  const onExportContent = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type) => type === "text/markdown" ? "## Markdown 内容" : "<p>Lake 内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      manualSaveRequest={0}
      exportRequest={{
        id: 1,
        format: "markdown",
        document: documentEntry,
        resourceStrategy: "bundle",
        signedUrlTtlSeconds: 86400,
      }}
      onSave={vi.fn()}
      onExportContent={onExportContent}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onExportContent).toHaveBeenCalledWith(
      {
        id: 1,
        format: "markdown",
        document: documentEntry,
        resourceStrategy: "bundle",
        signedUrlTtlSeconds: 86400,
      },
      "## Markdown 内容",
    );
  });
  expect(editor.getDocument).toHaveBeenCalledWith("text/markdown");
});
