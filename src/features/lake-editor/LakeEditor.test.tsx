import { render, screen, waitFor } from "@testing-library/react";

import { LakeEditor } from "./LakeEditor";
import type { LakeEditorInstance } from "./editorTypes";

const documentEntry = {
  id: "a.lake",
  path: "a.lake",
  name: "a",
  parentPath: "",
  size: 0,
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
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(screen.getByText("选择或新建 Lake 文档")).toBeInTheDocument();
});

test("打开文档时把 text/lake 内容设置进语雀编辑器", () => {
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
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>内容</p>");
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
      exportRequest={{ id: 1, format: "html", document: documentEntry }}
      onSave={vi.fn()}
      onExportContent={onExportContent}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onExportContent).toHaveBeenCalledWith(
      { id: 1, format: "html", document: documentEntry },
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
      exportRequest={{ id: 1, format: "markdown", document: documentEntry }}
      onSave={vi.fn()}
      onExportContent={onExportContent}
      onUploadImage={vi.fn()}
      onUploadFile={vi.fn()}
      onDownloadFile={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onExportContent).toHaveBeenCalledWith(
      { id: 1, format: "markdown", document: documentEntry },
      "## Markdown 内容",
    );
  });
  expect(editor.getDocument).toHaveBeenCalledWith("text/markdown");
});
