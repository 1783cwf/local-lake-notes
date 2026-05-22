import { describe, expect, test } from "vitest";

import { applyAiDocumentPatch, previewAiDocumentPatch } from "./documentPatch";

describe("AI 文档 patch", () => {
  test("按锚点追加内容并生成新增 diff", () => {
    const preview = previewAiDocumentPatch("# 标题\n\n正文", {
      operations: [{ type: "insert-after", anchor: "正文", markdown: "| A | B |" }],
    }, "document");

    expect(preview.errors).toEqual([]);
    expect(preview.after).toBe("# 标题\n\n正文\n\n| A | B |");
    expect(preview.lines).toContainEqual({ type: "added", text: "| A | B |" });
  });

  test("找不到锚点时阻止应用", () => {
    const result = applyAiDocumentPatch("正文", {
      operations: [{ type: "replace-text", anchor: "不存在", markdown: "新内容" }],
    }, "document");

    expect(result.content).toBe("正文");
    expect(result.errors[0]).toContain("没有找到定位文本");
  });

  test("选区替换不额外追加换行", () => {
    const result = applyAiDocumentPatch("旧选区", {
      operations: [{ type: "replace-selection", markdown: "新选区" }],
    }, "selection");

    expect(result.content).toBe("新选区");
    expect(result.errors).toEqual([]);
  });
});
