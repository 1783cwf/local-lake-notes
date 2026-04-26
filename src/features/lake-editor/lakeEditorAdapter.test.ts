import { createLakeEditor, destroyLakeEditor, hasLakeEditorRuntime } from "./lakeEditorAdapter";
import type { LakeEditorInstance } from "./editorTypes";

test("缺少 window.Doc 时报告运行时不可用", () => {
  window.Doc = undefined;

  expect(hasLakeEditorRuntime()).toBe(false);
  expect(() =>
    createLakeEditor(document.createElement("div"), {
      onContentChange: vi.fn(),
      uploadImage: vi.fn(),
    }),
  ).toThrow("语雀编辑器资源未加载");
});

test("创建编辑器时配置 Lake 图片上传和大纲能力", () => {
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
  });

  expect(created).toBe(editor);
  expect(window.Doc.createOpenEditor).toHaveBeenCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({
      input: {},
      toc: expect.objectContaining({ enable: true }),
      image: expect.objectContaining({ createUploadPromise: expect.any(Function) }),
    }),
  );
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
