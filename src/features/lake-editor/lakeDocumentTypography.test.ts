import { describe, expect, test } from "vitest";

import {
  composeLakeDocumentWithTypography,
  createInitialLakeDocumentContent,
  splitLakeDocumentTypography,
} from "./lakeDocumentTypography";

describe("lakeDocumentTypography", () => {
  test("无文档级元数据时保持原正文", () => {
    expect(splitLakeDocumentTypography("<p>正文</p>")).toEqual({
      body: "<p>正文</p>",
      documentTypography: {},
      hasDocumentTypography: false,
    });
  });

  test("解析文档级字体元数据并剥离前缀", () => {
    const content = "<!--yuque-lake-notes:typography {\"fontFamily\":\"Songti SC\",\"defaultFontSize\":22}-->\n<p>正文</p>";

    expect(splitLakeDocumentTypography(content)).toEqual({
      body: "<p>正文</p>",
      documentTypography: {
        fontFamily: "\"Songti SC\"",
        defaultFontSize: 22,
      },
      hasDocumentTypography: true,
    });
  });

  test("非法元数据只忽略设置不影响正文", () => {
    const content = "<!--yuque-lake-notes:typography {\"fontFamily\":\"serif;color:red\",\"defaultFontSize\":40}-->\n<p>正文</p>";

    expect(splitLakeDocumentTypography(content)).toEqual({
      body: "<p>正文</p>",
      documentTypography: {},
      hasDocumentTypography: true,
    });
  });

  test("写回文档级设置时不改写正文局部样式", () => {
    const body = "<p><span class=\"ne-text\" style=\"font-size: 24px\">正文</span></p>";
    const content = composeLakeDocumentWithTypography(body, {
      fontFamily: "KaiTi",
      defaultFontSize: 16,
    });

    expect(content).toContain("\"fontFamily\":\"KaiTi\"");
    expect(content).toContain("\"defaultFontSize\":16");
    expect(content).toContain("font-size: 24px");
  });

  test("新建文档复制全局字体设置为文档级设置", () => {
    const content = createInitialLakeDocumentContent("<p> </p>", {
      fontFamily: "Songti SC",
      defaultFontSize: 13,
    });

    expect(splitLakeDocumentTypography(content).documentTypography).toEqual({
      fontFamily: "\"Songti SC\"",
      defaultFontSize: 13,
    });
  });
});
