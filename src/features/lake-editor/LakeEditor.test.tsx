import { render, screen } from "@testing-library/react";

import { LakeEditor } from "./LakeEditor";
import type { LakeEditorInstance } from "./editorTypes";

const documentEntry = {
  id: "a.lake",
  path: "a.lake",
  name: "a",
  parentPath: "",
  size: 0,
};

test("没有文档时显示工作台空状态", () => {
  render(
    <LakeEditor
      document={null}
      content=""
      manualSaveRequest={0}
      onSave={vi.fn()}
      onUploadImage={vi.fn()}
      onOutlineChange={vi.fn()}
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
      onSave={vi.fn()}
      onUploadImage={vi.fn()}
      onOutlineChange={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>内容</p>");
});
