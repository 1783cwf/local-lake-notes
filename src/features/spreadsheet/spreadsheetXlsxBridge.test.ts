import ExcelJS from "exceljs";
import { CellValueType, HorizontalAlign, WrapStrategy } from "@univerjs/core";
import { describe, expect, test } from "vitest";

import {
  createEmptyXlsxBytes,
  workbookDataToXlsxBytes,
  xlsxBytesToWorkbookData,
} from "./spreadsheetXlsxBridge";

test("导入基础 XLSX 后保留多 Sheet、值、公式、合并单元格和基础样式", async () => {
  const workbook = new ExcelJS.Workbook();
  const firstSheet = workbook.addWorksheet("中文 Sheet");
  firstSheet.getCell("A1").value = "中文内容";
  firstSheet.getCell("B1").value = 42;
  firstSheet.getCell("C1").value = { formula: "B1*2", result: 84 };
  firstSheet.getCell("D1").value = new Date(Date.UTC(2026, 4, 6));
  firstSheet.getCell("A1").font = { bold: true, color: { argb: "FFFF0000" } };
  firstSheet.getCell("A1").alignment = { horizontal: "center", wrapText: true };
  firstSheet.mergeCells("A2:B3");
  workbook.addWorksheet("第二页").getCell("A1").value = "second";

  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const { data, warnings } = await xlsxBytesToWorkbookData(bytes, "测试表格");
  const sheet = data.sheets[data.sheetOrder[0]];

  expect(warnings).toEqual([]);
  expect(data.sheetOrder).toHaveLength(2);
  expect(sheet.name).toBe("中文 Sheet");
  expect(sheet.cellData?.[0]?.[0]?.v).toBe("中文内容");
  expect(sheet.cellData?.[0]?.[1]).toMatchObject({ v: 42, t: CellValueType.NUMBER });
  expect(sheet.cellData?.[0]?.[2]).toMatchObject({ v: 84, f: "=B1*2" });
  expect(sheet.cellData?.[0]?.[3]).toMatchObject({ v: "2026-05-06", t: CellValueType.STRING });
  expect(sheet.mergeData).toContainEqual({ startRow: 1, startColumn: 0, endRow: 2, endColumn: 1 });

  const styleId = sheet.cellData?.[0]?.[0]?.s;
  expect(styleId).toBeTruthy();
  expect(data.styles[String(styleId)]).toMatchObject({
    ht: HorizontalAlign.CENTER,
    tb: WrapStrategy.WRAP,
  });
});

test("导出 Univer data 后 ExcelJS 可以读取核心内容", async () => {
  const { data } = await xlsxBytesToWorkbookData(await createEmptyXlsxBytes("导出测试"), "导出测试");
  const sheetId = data.sheetOrder[0];
  data.sheets[sheetId].name = "导出页";
  data.sheets[sheetId].cellData = {
    0: {
      0: { v: "hello", t: CellValueType.STRING },
      1: { v: 3, t: CellValueType.NUMBER },
      2: { v: 6, t: CellValueType.NUMBER, f: "=B1*2" },
    },
  };
  data.sheets[sheetId].mergeData = [{ startRow: 1, startColumn: 0, endRow: 2, endColumn: 1 }];

  const workbook = new ExcelJS.Workbook();
  const bytes = await workbookDataToXlsxBytes(data);
  const workbookXlsx = workbook.xlsx as ExcelJS.Workbook["xlsx"] & {
    load(buffer: Uint8Array): Promise<ExcelJS.Workbook>;
  };
  await workbookXlsx.load(bytes);
  const worksheet = workbook.getWorksheet("导出页");

  expect(worksheet).toBeTruthy();
  expect(worksheet?.getCell("A1").value).toBe("hello");
  expect(worksheet?.getCell("B1").value).toBe(3);
  expect(worksheet?.getCell("C1").value).toMatchObject({ formula: "B1*2", result: 6 });
  expect((worksheet?.model as ExcelJS.WorksheetModel).merges).toContain("A2:B3");
});

test("空 workbook 导入后生成可编辑空白 Sheet", async () => {
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

  const { data, warnings } = await xlsxBytesToWorkbookData(bytes, "空表格");

  expect(warnings).toContain("源文件没有可编辑工作表，已创建空白 Sheet。");
  expect(data.sheetOrder).toHaveLength(1);
  expect(data.sheets[data.sheetOrder[0]].rowCount).toBeGreaterThan(0);
});

test("在桌面 WebView 环境中导入 XLSX 不依赖 Node process", async () => {
  const globalWithProcess = globalThis as typeof globalThis & { process?: unknown };
  const originalProcess = globalWithProcess.process;

  try {
    // 生产桌面端的 WebView 不提供 Node process；这个用例用于防止 ExcelJS 运行时入口回退到 Node 包。
    Reflect.deleteProperty(globalWithProcess, "process");

    const { data } = await xlsxBytesToWorkbookData(await createEmptyXlsxBytes("WebView 表格"), "WebView 表格");

    expect(data.sheetOrder).toHaveLength(1);
    expect(data.sheets[data.sheetOrder[0]].name).toBe("Sheet1");
  } finally {
    if (originalProcess === undefined) {
      Reflect.deleteProperty(globalWithProcess, "process");
    } else {
      globalWithProcess.process = originalProcess;
    }
  }
});

test("损坏的 XLSX bytes 返回中文错误", async () => {
  await expect(xlsxBytesToWorkbookData(new Uint8Array([1, 2, 3]), "坏文件"))
    .rejects
    .toThrow(/XLSX 解析失败/);
});

describe("商业依赖防护", () => {
  test("源码和 package.json 不引入 Univer Pro exchange-client", async () => {
    const packageJson = await import("../../../package.json");
    const dependencyText = JSON.stringify({
      dependencies: packageJson.default.dependencies,
      devDependencies: packageJson.default.devDependencies,
    });

    expect(dependencyText).not.toMatch(/@univerjs-pro|sheets-exchange-client|exchange-client/);
  });
});
