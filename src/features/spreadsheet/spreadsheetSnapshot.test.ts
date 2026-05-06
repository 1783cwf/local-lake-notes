import { CellValueType } from "@univerjs/core";
import { describe, expect, test } from "vitest";

import { createEmptySpreadsheetWorkbookData } from "./spreadsheetDocument";
import { parseSpreadsheetSnapshot, serializeSpreadsheetSnapshot } from "./spreadsheetSnapshot";

describe("spreadsheetSnapshot", () => {
  test("按 Univer IWorkbookData JSON 保存和读取表格快照", () => {
    const workbook = createEmptySpreadsheetWorkbookData("测试表格");
    const sheetId = workbook.sheetOrder[0];
    workbook.sheets[sheetId].cellData = {
      0: {
        0: { v: "hello", t: CellValueType.STRING },
      },
    };

    const parsed = parseSpreadsheetSnapshot(serializeSpreadsheetSnapshot(workbook), "测试表格");

    expect(parsed.name).toBe("测试表格");
    expect(parsed.sheetOrder).toEqual([sheetId]);
    expect(parsed.sheets[sheetId].cellData?.[0]?.[0]).toMatchObject({
      v: "hello",
      t: CellValueType.STRING,
    });
  });

  test("空内容生成可编辑空白表格", () => {
    const parsed = parseSpreadsheetSnapshot("", "空表格");

    expect(parsed.name).toBe("空表格");
    expect(parsed.sheetOrder).toHaveLength(1);
    expect(parsed.sheets[parsed.sheetOrder[0]].name).toBe("Sheet1");
  });

  test("无效 JSON 返回中文错误", () => {
    expect(() => parseSpreadsheetSnapshot("{", "坏表格")).toThrow(/表格快照解析失败/);
  });

  test("非 workbook snapshot JSON 返回中文错误", () => {
    expect(() => parseSpreadsheetSnapshot("{}", "坏表格")).toThrow(/表格快照格式无效/);
  });
});
