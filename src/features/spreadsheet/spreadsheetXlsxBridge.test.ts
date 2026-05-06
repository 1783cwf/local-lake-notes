import ExcelJS from "exceljs";
import { CellValueType } from "@univerjs/core";
import { describe, expect, test } from "vitest";

import packageJson from "../../../package.json";
import { createEmptySpreadsheetWorkbookData } from "./spreadsheetDocument";
import { exportXlsxWorkbookData, importXlsxWorkbookData } from "./spreadsheetXlsxBridge";

const sourceModules = import.meta.glob("../../**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

describe("spreadsheetXlsxBridge", () => {
  test("导入包含多 sheet、中文、公式和合并单元格的 XLSX", async () => {
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("汇总");
    summary.getCell("A1").value = "项目";
    summary.getCell("B1").value = 12;
    summary.getCell("C1").value = { formula: "B1*2", result: 24 };
    summary.getCell("D1").value = new Date("2026-05-06T00:00:00.000Z");
    summary.mergeCells("A3:B3");
    summary.getCell("A3").value = "合并标题";
    summary.getCell("A1").font = { bold: true, color: { argb: "FFFF0000" } };
    summary.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    workbook.addWorksheet("明细").getCell("A1").value = "中文内容";

    const imported = await importXlsxWorkbookData(toBytes(await workbook.xlsx.writeBuffer()), "预算表");
    const firstSheet = imported.sheets[imported.sheetOrder[0]];
    const secondSheet = imported.sheets[imported.sheetOrder[1]];

    expect(imported.name).toBe("预算表");
    expect(firstSheet.name).toBe("汇总");
    expect(secondSheet.name).toBe("明细");
    expect(firstSheet.cellData?.[0]?.[0]).toMatchObject({ v: "项目", t: CellValueType.STRING });
    expect(firstSheet.cellData?.[0]?.[1]).toMatchObject({ v: 12, t: CellValueType.NUMBER });
    expect(firstSheet.cellData?.[0]?.[2]).toMatchObject({ v: 24, t: CellValueType.NUMBER, f: "=B1*2" });
    expect(firstSheet.cellData?.[0]?.[3]).toMatchObject({ v: "2026-05-06", t: CellValueType.STRING });
    expect(firstSheet.mergeData).toContainEqual({
      startRow: 2,
      startColumn: 0,
      endRow: 2,
      endColumn: 1,
    });
    expect(firstSheet.cellData?.[0]?.[0]?.s).toBeTruthy();
    expect(Object.keys(imported.styles).length).toBeGreaterThanOrEqual(1);
  });

  test("导出 Univer snapshot 后可被 ExcelJS 读取", async () => {
    const workbookData = createEmptySpreadsheetWorkbookData("导出表格");
    const sheetId = workbookData.sheetOrder[0];
    const sheet = workbookData.sheets[sheetId];
    sheet.name = "预算";
    sheet.mergeData = [{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 }];
    sheet.cellData = {
      0: {
        0: { v: "收入", t: CellValueType.STRING },
        1: { v: 100, t: CellValueType.NUMBER },
        2: { v: 200, t: CellValueType.NUMBER, f: "=B1*2" },
      },
      2: {
        0: { v: "合并标题", t: CellValueType.STRING },
      },
    };

    const file = await exportXlsxWorkbookData(workbookData);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.getWorksheet("预算");

    expect(worksheet).toBeTruthy();
    expect(worksheet?.getCell("A1").value).toBe("收入");
    expect(worksheet?.getCell("B1").value).toBe(100);
    expect(worksheet?.getCell("C1").value).toMatchObject({ formula: "B1*2", result: 200 });
    expect(worksheet?.getCell("A3").value).toBe("合并标题");
    expect(worksheet?.getCell("B3").isMerged).toBe(true);
  });

  test("损坏 XLSX 返回中文错误", async () => {
    await expect(importXlsxWorkbookData(new Uint8Array([1, 2, 3]), "坏文件")).rejects.toThrow(/Excel 导入失败/);
  });

  test("源码和依赖不引入 Univer Pro Exchange", () => {
    const proDependencies = Object.keys(packageJson.dependencies)
      .filter((dependency) => dependency.startsWith("@univerjs-pro/"));
    const proSourceImports = Object.entries(sourceModules)
      .filter(([path, source]) => !path.endsWith("spreadsheetXlsxBridge.test.ts") && source.includes("@univerjs-pro/"))
      .map(([path]) => path);

    expect(proDependencies).toEqual([]);
    expect(proSourceImports).toEqual([]);
  });
});

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as Uint8Array);
}
