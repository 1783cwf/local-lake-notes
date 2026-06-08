import { describe, expect, test } from "vitest";

import {
  fontFamilyToCss,
  mergeDocumentTypographySettings,
  mergeTypographySettings,
  resolveTypographySettings,
  validateTypographySettings,
} from "./typographySettingsStore";

describe("typographySettingsStore", () => {
  test("补齐全局字体默认设置", () => {
    expect(mergeTypographySettings(null)).toEqual({
      fontFamily: "system-ui",
      defaultFontSize: 19,
    });
  });

  test("只接受 Lake 支持的默认字号", () => {
    expect(mergeTypographySettings({ fontFamily: "Songti SC", defaultFontSize: 22 }).defaultFontSize).toBe(22);
    expect(mergeTypographySettings({ fontFamily: "Songti SC", defaultFontSize: 18 }).defaultFontSize).toBe(19);
    expect(validateTypographySettings({ fontFamily: "Songti SC", defaultFontSize: 40 })).toBe("请选择支持的字号");
  });

  test("规范化字体族并避免 CSS 注入", () => {
    expect(fontFamilyToCss("Songti SC, serif")).toBe("\"Songti SC\", serif");
    expect(fontFamilyToCss("serif; color:red")).toBe("system-ui");
    expect(fontFamilyToCss("Arial\nsans-serif")).toBe("system-ui");
  });

  test("文档级设置优先于全局设置", () => {
    expect(resolveTypographySettings(
      { fontFamily: "KaiTi", defaultFontSize: 16 },
      { fontFamily: "Songti SC", defaultFontSize: 22 },
    )).toEqual({
      fontFamily: "KaiTi",
      defaultFontSize: 16,
    });
  });

  test("文档级缺字段时继承全局设置", () => {
    expect(resolveTypographySettings(
      mergeDocumentTypographySettings({ defaultFontSize: 13 }),
      { fontFamily: "Songti SC", defaultFontSize: 22 },
    )).toEqual({
      fontFamily: "\"Songti SC\"",
      defaultFontSize: 13,
    });
  });
});
