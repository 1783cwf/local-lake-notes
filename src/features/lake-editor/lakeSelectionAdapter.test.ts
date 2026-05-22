import {
  lakeSelectionCapability,
  readLakeEditorSelection,
  replaceLakeEditorSelection,
} from "./lakeSelectionAdapter";
import type { LakeEditorInstance } from "./editorTypes";

function createEditor(overrides: Partial<LakeEditorInstance>): LakeEditorInstance {
  return {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => ""),
    on: vi.fn(),
    ...overrides,
  };
}

test("只通过 Lake 显式选区 API 读取选中文本", () => {
  const editor = createEditor({
    getSelectionDocument: vi.fn(() => "选中 **内容**"),
  });

  expect(lakeSelectionCapability(editor)).toEqual({
    canReadSelection: true,
    canReplaceSelection: false,
  });
  expect(readLakeEditorSelection(editor)?.markdown).toBe("选中 **内容**");
});

test("没有显式选区 API 时不猜测 DOM 选区", () => {
  const editor = createEditor({});

  expect(readLakeEditorSelection(editor)).toBeNull();
  expect(lakeSelectionCapability(editor).canReadSelection).toBe(false);
});

test("只通过 Lake 显式替换 API 替换选区", () => {
  const replaceSelection = vi.fn();
  const editor = createEditor({ replaceSelection });

  expect(replaceLakeEditorSelection(editor, "text/html", "<table></table>")).toBe(true);
  expect(replaceSelection).toHaveBeenCalledWith("text/html", "<table></table>");
});
