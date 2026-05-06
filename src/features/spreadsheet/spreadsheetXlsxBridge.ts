import ExcelJS from "exceljs";
import {
  BooleanNumber,
  BorderStyleTypes,
  CellValueType,
  HorizontalAlign,
  LocaleType,
  TextDecoration,
  VerticalAlign,
  WrapStrategy,
  type ICellData,
  type IRange,
  type IStyleData,
  type IWorkbookData,
} from "@univerjs/core";

import { createEmptySpreadsheetWorkbookData, createEmptyWorksheetData } from "./spreadsheetDocument";

type ExcelColor = Partial<ExcelJS.Color> | undefined;

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEFAULT_WORKBOOK_ID = "local-lake-workbook";

export async function importXlsxWorkbookData(bytes: Uint8Array, workbookName = "导入表格"): Promise<IWorkbookData> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytesToArrayBuffer(bytes));
  } catch (error) {
    throw new Error(`Excel 导入失败：无法解析 XLSX 文件，${error instanceof Error ? error.message : String(error)}`);
  }

  if (workbook.worksheets.length === 0) {
    return createEmptySpreadsheetWorkbookData(workbookName);
  }

  const styles: Record<string, IStyleData> = {};
  const styleIds = new Map<string, string>();
  const sheets = Object.fromEntries(
    workbook.worksheets.map((worksheet, index) => {
      const sheetId = `sheet-${String(index + 1).padStart(4, "0")}`;
      const sheet = createEmptyWorksheetData(sheetId, worksheet.name || `Sheet${index + 1}`);

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (row.height) {
          sheet.rowData[rowNumber - 1] = { h: row.height };
        }
        row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
          const cellData = toUniverCellData(cell, styles, styleIds);
          if (!cellData) {
            return;
          }
          const rowIndex = rowNumber - 1;
          const columnIndex = columnNumber - 1;
          sheet.cellData[rowIndex] = sheet.cellData[rowIndex] ?? {};
          sheet.cellData[rowIndex][columnIndex] = cellData;
        });
      });

      worksheet.columns.forEach((column, columnIndex) => {
        if (column.width) {
          sheet.columnData[columnIndex] = { w: excelWidthToPixels(column.width) };
        }
      });

      sheet.mergeData = worksheet.model.merges
        .map(parseExcelRange)
        .filter((range): range is IRange => Boolean(range));
      sheet.rowCount = Math.max(sheet.rowCount, worksheet.actualRowCount, worksheet.rowCount, 100);
      sheet.columnCount = Math.max(sheet.columnCount, worksheet.actualColumnCount, worksheet.columnCount, 26);

      return [sheetId, sheet];
    }),
  );

  return {
    id: DEFAULT_WORKBOOK_ID,
    name: workbookName,
    appVersion: "0.21.1",
    locale: LocaleType.ZH_CN,
    styles,
    sheetOrder: Object.keys(sheets),
    sheets,
  };
}

export async function exportXlsxWorkbookData(workbookData: IWorkbookData): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Local Lake Notes";
  workbook.created = new Date();

  const sheetNames = new Set<string>();
  for (const [index, sheetId] of workbookData.sheetOrder.entries()) {
    const sheet = workbookData.sheets[sheetId];
    if (!sheet) {
      continue;
    }
    const worksheet = workbook.addWorksheet(uniqueSheetName(sheet.name || `Sheet${index + 1}`, sheetNames));

    Object.entries(sheet.rowData ?? {}).forEach(([rowIndex, rowData]) => {
      if (rowData?.h) {
        worksheet.getRow(Number(rowIndex) + 1).height = rowData.h;
      }
    });
    Object.entries(sheet.columnData ?? {}).forEach(([columnIndex, columnData]) => {
      if (columnData?.w) {
        worksheet.getColumn(Number(columnIndex) + 1).width = pixelsToExcelWidth(columnData.w);
      }
    });

    for (const mergeRange of sheet.mergeData ?? []) {
      worksheet.mergeCells(
        mergeRange.startRow + 1,
        mergeRange.startColumn + 1,
        mergeRange.endRow + 1,
        mergeRange.endColumn + 1,
      );
    }

    Object.entries(sheet.cellData ?? {}).forEach(([rowIndex, rowCells]) => {
      Object.entries(rowCells ?? {}).forEach(([columnIndex, rawCellData]) => {
        const cellData = rawCellData as ICellData;
        const excelCell = worksheet.getCell(Number(rowIndex) + 1, Number(columnIndex) + 1);
        excelCell.value = toExcelCellValue(cellData);
        const style = resolveStyle(workbookData.styles, cellData.s);
        if (style) {
          applyExcelStyle(excelCell, style);
        }
      });
    });
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet("Sheet1");
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as Uint8Array);
  return new File([bytes], `${safeWorkbookFileName(workbookData.name)}.xlsx`, { type: XLSX_MIME_TYPE });
}

function toUniverCellData(
  cell: ExcelJS.Cell,
  styles: Record<string, IStyleData>,
  styleIds: Map<string, string>,
): ICellData | null {
  const cellData = toUniverCellValue(cell.value);
  const style = toUniverStyle(cell);
  if (style) {
    cellData.s = registerStyle(style, styles, styleIds);
  }
  return Object.keys(cellData).length > 0 ? cellData : null;
}

function toUniverCellValue(value: ExcelJS.CellValue): ICellData {
  if (value === null || value === undefined) {
    return {};
  }
  if (typeof value === "string") {
    return { v: value, t: CellValueType.STRING };
  }
  if (typeof value === "number") {
    return { v: value, t: CellValueType.NUMBER };
  }
  if (typeof value === "boolean") {
    return { v: value, t: CellValueType.BOOLEAN };
  }
  if (value instanceof Date) {
    // ExcelJS 会把日期转为 Date；导入时保存可读字符串，避免 Univer 直接显示 Excel 序列号。
    return { v: formatDateValue(value), t: CellValueType.STRING };
  }
  if ("formula" in value || "sharedFormula" in value) {
    const result = "result" in value ? toUniverCellValue(value.result).v : undefined;
    const formula = "formula" in value ? value.formula : value.sharedFormula;
    return {
      ...(result !== undefined ? toUniverCellValue(result) : {}),
      f: ensureFormulaPrefix(formula ?? ""),
    };
  }
  if ("richText" in value) {
    return { v: value.richText.map((item) => item.text).join(""), t: CellValueType.STRING };
  }
  if ("hyperlink" in value) {
    return { v: value.text || value.hyperlink, t: CellValueType.STRING };
  }
  if ("error" in value) {
    return { v: value.error, t: CellValueType.STRING };
  }
  return { v: String(value), t: CellValueType.STRING };
}

function toExcelCellValue(cellData: ICellData): ExcelJS.CellValue {
  if (cellData.f) {
    const result = cellData.v;
    return {
      formula: cellData.f.replace(/^=/, ""),
      ...(result !== null && result !== undefined ? { result } : {}),
    };
  }
  return cellData.v ?? null;
}

function toUniverStyle(cell: ExcelJS.Cell): IStyleData | null {
  const style: IStyleData = {};
  if (cell.font?.name) {
    style.ff = cell.font.name;
  }
  if (cell.font?.size) {
    style.fs = cell.font.size;
  }
  if (cell.font?.bold) {
    style.bl = BooleanNumber.TRUE;
  }
  if (cell.font?.italic) {
    style.it = BooleanNumber.TRUE;
  }
  if (cell.font?.underline) {
    style.ul = { s: BooleanNumber.TRUE, t: TextDecoration.SINGLE };
  }
  const fontColor = toHexColor(cell.font?.color);
  if (fontColor) {
    style.cl = { rgb: fontColor };
  }
  const fillColor = toFillColor(cell.fill);
  if (fillColor) {
    style.bg = { rgb: fillColor };
  }
  const horizontal = toUniverHorizontalAlign(cell.alignment?.horizontal);
  if (horizontal) {
    style.ht = horizontal;
  }
  const vertical = toUniverVerticalAlign(cell.alignment?.vertical);
  if (vertical) {
    style.vt = vertical;
  }
  if (cell.alignment?.wrapText) {
    style.tb = WrapStrategy.WRAP;
  }
  const border = toUniverBorder(cell.border);
  if (border) {
    style.bd = border;
  }
  return Object.keys(style).length > 0 ? style : null;
}

function applyExcelStyle(cell: ExcelJS.Cell, style: IStyleData): void {
  const font: Partial<ExcelJS.Font> = {};
  if (style.ff) {
    font.name = style.ff;
  }
  if (style.fs) {
    font.size = style.fs;
  }
  if (style.bl === BooleanNumber.TRUE) {
    font.bold = true;
  }
  if (style.it === BooleanNumber.TRUE) {
    font.italic = true;
  }
  if (style.ul?.s === BooleanNumber.TRUE) {
    font.underline = true;
  }
  if (style.cl?.rgb) {
    font.color = toExcelColor(style.cl.rgb);
  }
  if (Object.keys(font).length > 0) {
    cell.font = font;
  }
  if (style.bg?.rgb) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: toExcelColor(style.bg.rgb),
    };
  }
  const alignment: Partial<ExcelJS.Alignment> = {};
  if (style.ht) {
    alignment.horizontal = toExcelHorizontalAlign(style.ht);
  }
  if (style.vt) {
    alignment.vertical = toExcelVerticalAlign(style.vt);
  }
  if (style.tb === WrapStrategy.WRAP) {
    alignment.wrapText = true;
  }
  if (Object.keys(alignment).length > 0) {
    cell.alignment = alignment;
  }
}

function registerStyle(
  style: IStyleData,
  styles: Record<string, IStyleData>,
  styleIds: Map<string, string>,
): string {
  const fingerprint = JSON.stringify(style);
  const existingId = styleIds.get(fingerprint);
  if (existingId) {
    return existingId;
  }
  const styleId = `style-${styleIds.size + 1}`;
  styleIds.set(fingerprint, styleId);
  styles[styleId] = style;
  return styleId;
}

function resolveStyle(
  styles: IWorkbookData["styles"],
  style: ICellData["s"],
): IStyleData | null {
  if (!style) {
    return null;
  }
  if (typeof style === "string") {
    return styles[style] ?? null;
  }
  return style;
}

function toUniverHorizontalAlign(value: ExcelJS.Alignment["horizontal"] | undefined): HorizontalAlign | null {
  switch (value) {
    case "left":
      return HorizontalAlign.LEFT;
    case "center":
    case "centerContinuous":
      return HorizontalAlign.CENTER;
    case "right":
      return HorizontalAlign.RIGHT;
    case "justify":
      return HorizontalAlign.JUSTIFIED;
    case "distributed":
      return HorizontalAlign.DISTRIBUTED;
    default:
      return null;
  }
}

function toUniverVerticalAlign(value: ExcelJS.Alignment["vertical"] | undefined): VerticalAlign | null {
  switch (value) {
    case "top":
      return VerticalAlign.TOP;
    case "middle":
      return VerticalAlign.MIDDLE;
    case "bottom":
      return VerticalAlign.BOTTOM;
    default:
      return null;
  }
}

function toExcelHorizontalAlign(value: HorizontalAlign): ExcelJS.Alignment["horizontal"] | undefined {
  switch (value) {
    case HorizontalAlign.LEFT:
      return "left";
    case HorizontalAlign.CENTER:
      return "center";
    case HorizontalAlign.RIGHT:
      return "right";
    case HorizontalAlign.JUSTIFIED:
      return "justify";
    case HorizontalAlign.DISTRIBUTED:
      return "distributed";
    default:
      return undefined;
  }
}

function toExcelVerticalAlign(value: VerticalAlign): ExcelJS.Alignment["vertical"] | undefined {
  switch (value) {
    case VerticalAlign.TOP:
      return "top";
    case VerticalAlign.MIDDLE:
      return "middle";
    case VerticalAlign.BOTTOM:
      return "bottom";
    default:
      return undefined;
  }
}

function toUniverBorder(border: Partial<ExcelJS.Borders> | undefined): IStyleData["bd"] | null {
  const top = toUniverBorderStyle(border?.top);
  const right = toUniverBorderStyle(border?.right);
  const bottom = toUniverBorderStyle(border?.bottom);
  const left = toUniverBorderStyle(border?.left);
  return top || right || bottom || left
    ? { t: top, r: right, b: bottom, l: left }
    : null;
}

function toUniverBorderStyle(border: Partial<ExcelJS.Border> | undefined) {
  if (!border?.style) {
    return null;
  }
  return {
    s: toUniverBorderStyleType(border.style),
    cl: { rgb: toHexColor(border.color) ?? "#000000" },
  };
}

function toUniverBorderStyleType(style: ExcelJS.BorderStyle): BorderStyleTypes {
  switch (style) {
    case "dotted":
      return BorderStyleTypes.DOTTED;
    case "dashed":
    case "mediumDashed":
      return BorderStyleTypes.DASHED;
    case "double":
      return BorderStyleTypes.DOUBLE;
    case "thick":
      return BorderStyleTypes.THICK;
    case "medium":
      return BorderStyleTypes.MEDIUM;
    default:
      return BorderStyleTypes.THIN;
  }
}

function toHexColor(color: ExcelColor): string | null {
  if (!color?.argb) {
    return null;
  }
  const rgb = color.argb.length === 8 ? color.argb.slice(2) : color.argb;
  return /^([0-9a-f]{6})$/i.test(rgb) ? `#${rgb.toUpperCase()}` : null;
}

function toExcelColor(color: string): Partial<ExcelJS.Color> {
  return { argb: `FF${color.replace(/^#/, "").toUpperCase()}` };
}

function toFillColor(fill: ExcelJS.Fill | undefined): string | null {
  if (!fill || fill.type !== "pattern") {
    return null;
  }
  return toHexColor(fill.fgColor);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function parseExcelRange(range: string): IRange | null {
  const [start, end = start] = range.split(":");
  const startCell = parseCellAddress(start);
  const endCell = parseCellAddress(end);
  if (!startCell || !endCell) {
    return null;
  }
  return {
    startRow: Math.min(startCell.row, endCell.row),
    startColumn: Math.min(startCell.column, endCell.column),
    endRow: Math.max(startCell.row, endCell.row),
    endColumn: Math.max(startCell.column, endCell.column),
  };
}

function parseCellAddress(address: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) {
    return null;
  }
  return {
    row: Number(match[2]) - 1,
    column: columnLettersToIndex(match[1]),
  };
}

function columnLettersToIndex(letters: string): number {
  return letters.toUpperCase().split("").reduce((index, letter) => (
    index * 26 + letter.charCodeAt(0) - 64
  ), 0) - 1;
}

function ensureFormulaPrefix(formula: string): string {
  return formula.startsWith("=") ? formula : `=${formula}`;
}

function formatDateValue(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function excelWidthToPixels(width: number): number {
  return Math.max(8, Math.round(width * 8));
}

function pixelsToExcelWidth(width: number): number {
  return Math.max(1, Math.round((width / 8) * 100) / 100);
}

function uniqueSheetName(name: string, usedNames: Set<string>): string {
  const base = sanitizeSheetName(name).slice(0, 31) || "Sheet";
  let nextName = base;
  let suffix = 1;
  while (usedNames.has(nextName)) {
    const suffixText = `-${suffix}`;
    nextName = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(nextName);
  return nextName;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\][*?/\\:]/g, " ").trim();
}

function safeWorkbookFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, " ").trim() || "spreadsheet";
}
