import { render, screen, waitFor } from "@testing-library/react";

import { LakeEditor } from "./LakeEditor";
import type { LakeEditorInstance } from "./editorTypes";
import { encodeLakeCardValue } from "./resourceReference";

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

test("打开带文档字体元数据的文档时只把正文传给语雀编辑器", async () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>正文</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content={"<!--yuque-lake-notes:typography {\"fontFamily\":\"Songti SC\",\"defaultFontSize\":22}-->\n<p>正文</p>"}
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
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>正文</p>");
  });
  expect(window.Doc.createOpenEditor).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      defaultFontsize: 22,
    }),
  );
});

test("保存时把文档字体元数据写回 Lake 原始内容", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>更新正文</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  const { rerender } = render(
    <LakeEditor
      document={documentEntry}
      content={"<!--yuque-lake-notes:typography {\"fontFamily\":\"Songti SC\",\"defaultFontSize\":22}-->\n<p>正文</p>"}
      manualSaveRequest={0}
      exportRequest={null}
      onSave={onSave}
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
      document={documentEntry}
      content={"<!--yuque-lake-notes:typography {\"fontFamily\":\"Songti SC\",\"defaultFontSize\":22}-->\n<p>正文</p>"}
      manualSaveRequest={1}
      exportRequest={null}
      onSave={onSave}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(
      "a.lake",
      expect.stringContaining("yuque-lake-notes:typography"),
    );
  });
  expect(onSave).toHaveBeenCalledWith(
    "a.lake",
    expect.stringContaining("<p>更新正文</p>"),
  );
});

test("阅读模式使用语雀 Viewer 且不注册保存和替换能力", async () => {
  const onRegisterSaveNow = vi.fn();
  const onRegisterReadContent = vi.fn();
  const onRegisterReadSelection = vi.fn();
  const onRegisterReplaceSelection = vi.fn();
  const onSelectionCapabilityChange = vi.fn();
  const onPrepareResourcePreview = vi.fn(async (resourceRef: string) => resourceRef);
  const viewer: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => {
      throw new Error("阅读模式不应创建编辑器");
    }),
    createOpenViewer: vi.fn(() => viewer),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>内容</p>"
      mode="read"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={onPrepareResourcePreview}
      onSaveStatusChange={vi.fn()}
      onRegisterSaveNow={onRegisterSaveNow}
      onRegisterReadContent={onRegisterReadContent}
      onRegisterReadSelection={onRegisterReadSelection}
      onRegisterReplaceSelection={onRegisterReplaceSelection}
      onSelectionCapabilityChange={onSelectionCapabilityChange}
    />,
  );

  await waitFor(() => {
    expect(viewer.setDocument).toHaveBeenCalledWith("text/lake", "<p>内容</p>");
  });
  expect(window.Doc.createOpenViewer).toHaveBeenCalledTimes(1);
  expect(window.Doc.createOpenViewer).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      toc: {
        enable: true,
        normalView: true,
      },
    }),
  );
  expect(window.Doc.createOpenEditor).not.toHaveBeenCalled();
  expect(onRegisterSaveNow).toHaveBeenLastCalledWith(null);
  expect(onRegisterReadContent).toHaveBeenLastCalledWith(null);
  expect(onRegisterReadSelection).toHaveBeenLastCalledWith(null);
  expect(onRegisterReplaceSelection).toHaveBeenLastCalledWith(null);
  expect(onPrepareResourcePreview).not.toHaveBeenCalled();
  expect(document.querySelector(".lake-editor-root")).toHaveClass("is-read-mode");
  expect(onSelectionCapabilityChange).toHaveBeenCalledWith({
    canReadSelection: false,
    canReplaceSelection: false,
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

test("打开文档时不会预读取附件卡片内容", async () => {
  const resourceRef = "yuque-resource://webdav/files/a.zip?provider=webdav&kind=file";
  const onPrepareResourcePreview = vi.fn(async () => "asset://preview/a.zip");
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content={`<card name="file" value="${encodeLakeCardValue({ src: resourceRef, name: "a.zip" })}"></card>`}
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
    expect(editor.setDocument).toHaveBeenCalled();
  });
  expect(onPrepareResourcePreview).not.toHaveBeenCalled();
});

test("打开多图片文档时按配置并发准备资源预览", async () => {
  const refs = Array.from({ length: 9 }, (_, index) => (
    `yuque-resource://webdav/images/${index}.png?provider=webdav&kind=image`
  ));
  let activeRequests = 0;
  let maxActiveRequests = 0;
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
  await waitFor(() => {
    expect(editorContent.match(/preview=1/g)).toHaveLength(refs.length);
  });
  expect(maxActiveRequests).toBe(6);
  expect(editor.setDocument).toHaveBeenCalledTimes(2);
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

test("注册当前 Lake 内容读取函数并应用 AI 预览内容", async () => {
  let editorContent = "<p>原文</p>";
  const onRegisterReadContent = vi.fn();
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

  const { rerender } = render(
    <LakeEditor
      document={documentEntry}
      content="<p>原文</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
      onRegisterReadContent={onRegisterReadContent}
    />,
  );

  await waitFor(() => expect(onRegisterReadContent).toHaveBeenCalledWith(expect.any(Function)));
  expect(onRegisterReadContent.mock.calls.at(-1)?.[0]()).toBe("<p>原文</p>");

  rerender(
    <LakeEditor
      document={documentEntry}
      content="<p>原文</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
      onRegisterReadContent={onRegisterReadContent}
      aiPreviewContent="<h1>AI 预览</h1>"
      aiPreviewRequestId={1}
    />,
  );

  await waitFor(() => {
    expect(editor.setDocument).toHaveBeenLastCalledWith("text/markdown", "<h1>AI 预览</h1>");
  });
});

test("AI 预览可按 HTML 导入以保留表格结构", async () => {
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>原文</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>原文</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
      aiPreviewContent="<table><thead><tr><th>A</th></tr></thead></table>"
      aiPreviewContentType="text/html"
      aiPreviewRequestId={1}
    />,
  );

  await waitFor(() => {
    expect(editor.setDocument).toHaveBeenLastCalledWith(
      "text/html",
      "<table><thead><tr><th>A</th></tr></thead></table>",
    );
  });
});

test("注册显式选区读取和替换函数", async () => {
  const onRegisterReadSelection = vi.fn();
  const onRegisterReplaceSelection = vi.fn();
  const onSelectionCapabilityChange = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>原文</p>"),
    getSelectionDocument: vi.fn(() => "选中文本"),
    replaceSelection: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>原文</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
      onRegisterReadSelection={onRegisterReadSelection}
      onRegisterReplaceSelection={onRegisterReplaceSelection}
      onSelectionCapabilityChange={onSelectionCapabilityChange}
    />,
  );

  await waitFor(() => expect(onRegisterReadSelection).toHaveBeenCalledWith(expect.any(Function)));
  expect(onRegisterReadSelection.mock.calls.at(-1)?.[0]()).toBe("选中文本");
  expect(onRegisterReplaceSelection.mock.calls.at(-1)?.[0]("新文本")).toBe(true);
  expect(editor.replaceSelection).toHaveBeenCalledWith("text/markdown", "新文本");
  expect(onSelectionCapabilityChange).toHaveBeenCalledWith({
    canReadSelection: true,
    canReplaceSelection: true,
  });
});

test("AI 面板抢焦点后仍可读取最近一次显式 Lake 选区", async () => {
  const onRegisterReadSelection = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<p>原文</p>"),
    getSelectionDocument: vi.fn()
      .mockReturnValueOnce("缓存选区")
      .mockReturnValue(""),
    replaceSelection: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>原文</p>"
      manualSaveRequest={0}
      exportRequest={null}
      onSave={vi.fn()}
      onExportContent={vi.fn()}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onPrepareResourcePreview={vi.fn(async (resourceRef) => resourceRef)}
      onSaveStatusChange={vi.fn()}
      onRegisterReadSelection={onRegisterReadSelection}
    />,
  );

  await waitFor(() => expect(onRegisterReadSelection).toHaveBeenCalledWith(expect.any(Function)));
  document.dispatchEvent(new Event("selectionchange"));

  expect(onRegisterReadSelection.mock.calls.at(-1)?.[0]()).toBe("缓存选区");
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
  const codeblockValue = encodeLakeCardValue({
    mode: "yaml",
    name: "部署脚本",
    theme: "github",
    code: "kind: Deployment",
  });
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type) => {
      if (type === "text/html") {
        return "<p><img src=\"file:///tmp/a.png\"></p><pre class=\"ne-codeblock language-yaml\" data-language=\"yaml\"><code>kind: Deployment</code></pre>";
      }
      if (type === "text/lake") {
        return `<card name="codeblock" value="${codeblockValue}"></card>`;
      }
      return "<p>Lake 内容</p>";
    }),
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
      expect.stringContaining("data-title=\"部署脚本\""),
    );
  });
  expect(editor.getDocument).toHaveBeenCalledWith("text/html");
  expect(editor.getDocument).toHaveBeenCalledWith("text/lake");
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

test("忽略不属于当前文档的导出请求", async () => {
  const onExportContent = vi.fn();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn((type) => type === "text/markdown" ? "## 旧文档内容" : "<p>当前内容</p>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  const otherDocumentEntry = {
    ...documentEntry,
    id: "b.lake",
    path: "b.lake",
    name: "b",
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  render(
    <LakeEditor
      document={documentEntry}
      content="<p>当前内容</p>"
      manualSaveRequest={0}
      exportRequest={{
        id: 1,
        format: "markdown",
        document: otherDocumentEntry,
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
    expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>当前内容</p>");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(onExportContent).not.toHaveBeenCalled();
  expect(editor.getDocument).not.toHaveBeenCalledWith("text/markdown");
});
