import { CellValueType, type ICellData, type IWorksheetData } from "@univerjs/core";

import type {
  AiSpreadsheetCellValue,
  AiSpreadsheetPatch,
  AiSpreadsheetSheetCandidate,
} from "../../app/appState";
import {
  createEmptySpreadsheetWorkbookData,
  createEmptyWorksheetData,
  normalizeSpreadsheetWorkbookData,
  type SpreadsheetWorkbookData,
} from "../spreadsheet/spreadsheetDocument";

export function applyAiSpreadsheetPatch(
  workbook: SpreadsheetWorkbookData,
  patch: AiSpreadsheetPatch,
): SpreadsheetWorkbookData {
  const nextWorkbook = normalizeSpreadsheetWorkbookData(workbook, workbook.name);
  const createdSheets: IWorksheetData[] = (patch.sheets ?? [])
    .map((sheet, index) => createAiWorksheet(sheet, nextWorkbook.sheetOrder.length + index + 1))
    .filter((sheet): sheet is IWorksheetData => Boolean(sheet));

  const workbookWithNewSheets = createdSheets.length > 0 ? {
    ...nextWorkbook,
    sheetOrder: [...nextWorkbook.sheetOrder, ...createdSheets.map((sheet) => sheet.id)],
    sheets: {
      ...nextWorkbook.sheets,
      ...Object.fromEntries(createdSheets.map((sheet) => [sheet.id, sheet])),
    },
  } : nextWorkbook;

  if (!patch.appendRows?.length) {
    return normalizeSpreadsheetWorkbookData(workbookWithNewSheets, workbookWithNewSheets.name);
  }

  const targetSheetId = workbookWithNewSheets.sheetOrder[0];
  const targetSheet = targetSheetId ? workbookWithNewSheets.sheets[targetSheetId] as IWorksheetData | undefined : undefined;
  if (!targetSheet) {
    const fallback = createEmptySpreadsheetWorkbookData(workbookWithNewSheets.name || "AI 表格");
    const fallbackSheetId = fallback.sheetOrder[0];
    const fallbackSheet = fallback.sheets[fallbackSheetId] as IWorksheetData;
    return {
      ...fallback,
      sheets: {
        ...fallback.sheets,
        [fallbackSheetId]: appendRowsToSheet(fallbackSheet, patch.appendRows),
      },
    };
  }

  return normalizeSpreadsheetWorkbookData({
    ...workbookWithNewSheets,
    sheets: {
      ...workbookWithNewSheets.sheets,
      [targetSheetId]: appendRowsToSheet(targetSheet, patch.appendRows),
    },
  }, workbookWithNewSheets.name);
}

function createAiWorksheet(candidate: AiSpreadsheetSheetCandidate, index: number): IWorksheetData | null {
  const rows = normalizeRows(candidate.rows);
  const name = candidate.name.trim() || `AI 表格 ${index}`;
  if (!rows.length) {
    return null;
  }
  const sheet = createEmptyWorksheetData(`ai-sheet-${Date.now()}-${index}`, name);
  return rowsToSheet(sheet, rows);
}

function appendRowsToSheet(sheet: IWorksheetData, rows: AiSpreadsheetCellValue[][]): IWorksheetData {
  const normalizedRows = normalizeRows(rows);
  if (!normalizedRows.length) {
    return sheet;
  }
  const nextSheet = {
    ...sheet,
    cellData: { ...(sheet.cellData ?? {}) },
  };
  const startRow = nextAppendRowIndex(nextSheet);
  normalizedRows.forEach((row, rowOffset) => {
    const rowIndex = startRow + rowOffset;
    nextSheet.cellData[rowIndex] = {
      ...(nextSheet.cellData[rowIndex] ?? {}),
      ...rowToCellData(row),
    };
  });
  nextSheet.rowCount = Math.max(nextSheet.rowCount ?? 0, startRow + normalizedRows.length + 20);
  nextSheet.columnCount = Math.max(nextSheet.columnCount ?? 0, maxColumnCount(normalizedRows), 26);
  return nextSheet;
}

function rowsToSheet(sheet: IWorksheetData, rows: AiSpreadsheetCellValue[][]): IWorksheetData {
  return {
    ...sheet,
    rowCount: Math.max(rows.length + 20, 100),
    columnCount: Math.max(maxColumnCount(rows), 26),
    cellData: Object.fromEntries(rows.map((row, rowIndex) => [rowIndex, rowToCellData(row)])),
  };
}

function rowToCellData(row: AiSpreadsheetCellValue[]): Record<number, ICellData> {
  return Object.fromEntries(
    row
      .map((cell, columnIndex) => [columnIndex, cellValueToCellData(cell)] as const)
      .filter(([, cell]) => Object.keys(cell).length > 0),
  );
}

function cellValueToCellData(value: AiSpreadsheetCellValue): ICellData {
  if (value === null || value === undefined || value === "") {
    return {};
  }
  if (typeof value === "number") {
    return { v: value, t: CellValueType.NUMBER };
  }
  if (typeof value === "boolean") {
    return { v: value, t: CellValueType.BOOLEAN };
  }
  return { v: String(value), t: CellValueType.STRING };
}

function normalizeRows(rows: AiSpreadsheetCellValue[][] | undefined): AiSpreadsheetCellValue[][] {
  return (rows ?? [])
    .map((row) => row.map(normalizeCellValue))
    .filter((row) => row.some((cell) => cell !== null && cell !== ""));
}

function normalizeCellValue(value: AiSpreadsheetCellValue): AiSpreadsheetCellValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value).trim();
}

function nextAppendRowIndex(sheet: IWorksheetData): number {
  const rowIndexes = Object.entries(sheet.cellData ?? {})
    .filter(([, cells]) => Object.keys(cells ?? {}).length > 0)
    .map(([rowIndex]) => Number(rowIndex))
    .filter(Number.isFinite);
  return rowIndexes.length ? Math.max(...rowIndexes) + 1 : 0;
}

function maxColumnCount(rows: AiSpreadsheetCellValue[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}
