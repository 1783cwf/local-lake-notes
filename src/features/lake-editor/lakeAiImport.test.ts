import { describe, expect, test } from "vitest";

import { prepareAiMarkdownForLakeImport } from "./lakeAiImport";

describe("AI Markdown 导入 Lake", () => {
  test("无表格时保持 Markdown 导入", () => {
    expect(prepareAiMarkdownForLakeImport("# 标题\n\n正文")).toEqual({
      type: "text/markdown",
      content: "# 标题\n\n正文",
    });
  });

  test("包含 Markdown 表格时转成 HTML 表格导入", () => {
    const result = prepareAiMarkdownForLakeImport([
      "## 补充记录表格",
      "",
      "| 名称 | 值 | 备注 |",
      "| --- | --- | --- |",
      "| 记录项 A | value-a | 示例补充内容 |",
    ].join("\n"));

    expect(result.type).toBe("text/html");
    expect(result.content).toContain("<h2>补充记录表格</h2>");
    expect(result.content).toContain("<table>");
    expect(result.content).toContain("<td>记录项 A</td>");
  });

  test("代码块里的管道符不会被当成表格", () => {
    const result = prepareAiMarkdownForLakeImport("```bash\ncat a | grep b\n```");

    expect(result.type).toBe("text/markdown");
  });

  test("引用块和任务清单转成 HTML 导入以保留富文本结构", () => {
    const result = prepareAiMarkdownForLakeImport([
      "> 关键结论：优先使用线程池",
      "",
      "- [ ] 补充拒绝策略",
      "- [x] 保留现有示例",
    ].join("\n"));

    expect(result.type).toBe("text/html");
    expect(result.content).toContain("<blockquote>");
    expect(result.content).toContain("<input type=\"checkbox\" disabled>");
    expect(result.content).toContain("<input type=\"checkbox\" disabled checked>");
  });
});
