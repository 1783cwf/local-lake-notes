import ExcelJS from "exceljs";
import {
  BooleanNumber,
  BorderStyleTypes,
  CellValueType,
  HorizontalAlign,
  TextDecoration,
  VerticalAlign,
  WrapStrategy,
  type ICellData,
  type IRange,
  type IStyleData,
  type IWorksheetData,
} from "@univerjs/core";

import {
  createEmptySpreadsheetWorkbookData,
  createEmptyWorksheetData,
  normalizeSpreadsheetWorkbookData,
  type SpreadsheetBridgeResult,
  type SpreadsheetWorkbookData,
} from "./spreadsheetDocument";

type ExcelCell = ExcelJS.Cell;
type ExcelCellValue = ExcelJS.CellValue;
type ExcelStyle = Partial<ExcelJS.Style>;

const MIN_ROW_COUNT = 100;
const MIN_COLUMN_COUNT = 26;

export async function xlsxBytesToWorkbookData(
  bytes: Uint8Array,
  name = "未命名表格",
): Promise<SpreadsheetBridgeResult<SpreadsheetWorkbookData>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await loadXlsxWorkbook(workbook, bytes);
  } catch (error) {
    throw new Error(`XLSX 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (workbook.worksheets.length === 0) {
    return {
      data: createEmptySpreadsheetWorkbookData(name),
      warnings: ["源文件没有可编辑工作表，已创建空白 Sheet。"],
    };
  }

  const styles = new StyleRegistry();
  const sheetOrder: string[] = [];
  const sheets: SpreadsheetWorkbookData["sheets"] = {};
  const warnings: string[] = [];

  workbook.worksheets.forEach((worksheet, index) => {
    const sheetId = `sheet-${String(index + 1).padStart(4, "0")}`;
    sheetOrder.push(sheetId);
    const result = worksheetToUniverSheet(worksheet, sheetId, styles);
    sheets[sheetId] = result.sheet;
    warnings.push(...result.warnings);
  });

  return {
    data: normalizeSpreadsheetWorkbookData({
      id: `workbook-${Date.now()}`,
      name,
      appVersion: "0.21.1",
      locale: createEmptySpreadsheetWorkbookData(name).locale,
      styles: styles.toJSON(),
      sheetOrder,
      sheets,
    }, name),
    warnings,
  };
}

export async function workbookDataToXlsxBytes(data: SpreadsheetWorkbookData): Promise<Uint8Array> {
  const normalizedData = normalizeSpreadsheetWorkbookData(data, data.name);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Local Lake Notes";
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheetId of normalizedData.sheetOrder) {
    const sheetData = normalizedData.sheets[sheetId];
    const worksheet = workbook.addWorksheet(sheetData?.name || "Sheet");
    writeUniverSheetToWorksheet(worksheet, sheetData ?? createEmptyWorksheetData(sheetId, "Sheet"), normalizedData.styles);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return toUint8Array(buffer);
}

export async function createEmptyXlsxBytes(name = "未命名表格"): Promise<Uint8Array> {
  return workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData(name));
}

function worksheetToUniverSheet(
  worksheet: ExcelJS.Worksheet,
  sheetId: string,
  styles: StyleRegistry,
): { sheet: IWorksheetData; warnings: string[] } {
  const warnings: string[] = [];
  const cellData: IWorksheetData["cellData"] = {};
  const rowData: IWorksheetData["rowData"] = {};
  const columnData: IWorksheetData["columnData"] = {};
  let maxRow = Math.max(worksheet.rowCount, MIN_ROW_COUNT);
  let maxColumn = Math.max(worksheet.columnCount, MIN_COLUMN_COUNT);

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const rowIndex = rowNumber - 1;
    maxRow = Math.max(maxRow, rowNumber);
    if (row.height) {
      rowData[rowIndex] = { h: row.height };
    }

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const columnIndex = columnNumber - 1;
      maxColumn = Math.max(maxColumn, columnNumber);
      const univerCell = excelCellToUniverCell(cell, styles, warnings);
      if (!univerCell) {
        return;
      }
      cellData[rowIndex] ??= {};
      cellData[rowIndex][columnIndex] = univerCell;
    });
  });

  (worksheet.columns ?? []).forEach((column, index) => {
    if (column.width) {
      columnData[index] = { w: excelWidthToPx(column.width) };
    }
    if (column.hidden) {
      columnData[index] = { ...columnData[index], hd: BooleanNumber.TRUE };
    }
  });

  return {
    sheet: {
      ...createEmptyWorksheetData(sheetId, worksheet.name),
      id: sheetId,
      name: worksheet.name,
      hidden: worksheet.state === "visible" ? BooleanNumber.FALSE : BooleanNumber.TRUE,
      rowCount: maxRow,
      columnCount: maxColumn,
      mergeData: readMergeRanges(worksheet),
      cellData,
      rowData,
      columnData,
    },
    warnings,
  };
}

function writeUniverSheetToWorksheet(
  worksheet: ExcelJS.Worksheet,
  sheetData: Partial<IWorksheetData>,
  styles: SpreadsheetWorkbookData["styles"],
) {
  const rowData = sheetData.rowData ?? {};
  Object.entries(rowData).forEach(([rowIndex, row]) => {
    const height = row?.h;
    if (typeof height === "number") {
      worksheet.getRow(Number(rowIndex) + 1).height = height;
    }
  });

  const columnData = sheetData.columnData ?? {};
  Object.entries(columnData).forEach(([columnIndex, column]) => {
    const excelColumn = worksheet.getColumn(Number(columnIndex) + 1);
    if (typeof column?.w === "number") {
      excelColumn.width = pxToExcelWidth(column.w);
    }
    if (column?.hd === BooleanNumber.TRUE) {
      excelColumn.hidden = true;
    }
  });

  const cellData = sheetData.cellData ?? {};
  Object.entries(cellData).forEach(([rowIndex, row]) => {
    Object.entries(row ?? {}).forEach(([columnIndex, cell]) => {
      if (!cell) {
        return;
      }
      const excelCell = worksheet.getCell(Number(rowIndex) + 1, Number(columnIndex) + 1);
      excelCell.value = univerCellToExcelValue(cell);
      const typedCell = cell as ICellData;
      const style = resolveStyle(typedCell.s, styles);
      if (style) {
        applyStyleToExcelCell(excelCell, style);
      }
    });
  });

  for (const range of sheetData.mergeData ?? []) {
    try {
      worksheet.mergeCells(range.startRow + 1, range.startColumn + 1, range.endRow + 1, range.endColumn + 1);
    } catch {
      // 合并范围可能来自手工构造的异常快照；导出时跳过异常范围，避免整份文件失败。
    }
  }
}

function excelCellToUniverCell(
  cell: ExcelCell,
  styles: StyleRegistry,
  warnings: string[],
): ICellData | null {
  const univerCell = excelValueToUniverCell(cell.value, cell.type, warnings);
  const style = excelStyleToUniverStyle(cell);
  const styleId = style ? styles.getId(style) : null;

  if (!univerCell && !styleId) {
    return null;
  }

  return styleId ? { ...(univerCell ?? {}), s: styleId } : univerCell;
}

function excelValueToUniverCell(
  value: ExcelCellValue,
  type: ExcelJS.ValueType,
  warnings: string[],
): ICellData | null {
  if (value === null || value === undefined || type === ExcelJS.ValueType.Merge) {
    return null;
  }

  if (value instanceof Date) {
    return { v: formatDateValue(value), t: CellValueType.STRING };
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

  if (isFormulaCellValue(value)) {
    const result = normalizeFormulaResult(value.result);
    return {
      ...(result ? { v: result.value, t: result.type } : {}),
      f: normalizeFormula(formulaFromExcelValue(value)),
    };
  }

  if (isRichTextCellValue(value)) {
    return { v: value.richText.map((segment) => segment.text).join(""), t: CellValueType.STRING };
  }

  if (isHyperlinkCellValue(value)) {
    return { v: value.text, t: CellValueType.STRING };
  }

  if (isErrorCellValue(value)) {
    return { v: value.error, t: CellValueType.STRING };
  }

  warnings.push("存在暂未支持的单元格值类型，已按文本降级。");
  return { v: String(value), t: CellValueType.STRING };
}

function univerCellToExcelValue(cell: ICellData): ExcelCellValue {
  if (cell.f) {
    return {
      formula: cell.f.replace(/^=/, ""),
      result: cell.v ?? undefined,
    };
  }
  if (cell.v === null || cell.v === undefined) {
    return null;
  }
  return cell.v;
}

function excelStyleToUniverStyle(cell: ExcelCell): IStyleData | null {
  const style: IStyleData = {};
  const font = cell.font;
  if (font) {
    if (font.name) {
      style.ff = font.name;
    }
    if (font.size) {
      style.fs = font.size;
    }
    if (font.bold) {
      style.bl = BooleanNumber.TRUE;
    }
    if (font.italic) {
      style.it = BooleanNumber.TRUE;
    }
    if (font.underline) {
      style.ul = { s: BooleanNumber.TRUE, t: TextDecoration.SINGLE };
    }
    if (font.strike) {
      style.st = { s: BooleanNumber.TRUE, t: TextDecoration.SINGLE };
    }
    const color = excelColorToRgb(font.color);
    if (color) {
      style.cl = { rgb: color };
    }
  }

  const fillColor = excelFillToRgb(cell.fill);
  if (fillColor) {
    style.bg = { rgb: fillColor };
  }

  if (cell.numFmt) {
    style.n = { pattern: cell.numFmt };
  }

  if (cell.alignment) {
    style.ht = excelHorizontalAlignToUniver(cell.alignment.horizontal);
    style.vt = excelVerticalAlignToUniver(cell.alignment.vertical);
    style.tb = cell.alignment.wrapText ? WrapStrategy.WRAP : undefined;
  }

  const border = excelBorderToUniver(cell.border);
  if (border) {
    style.bd = border;
  }

  return Object.keys(style).length > 0 ? style : null;
}

function applyStyleToExcelCell(cell: ExcelCell, style: IStyleData) {
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
  if (style.st?.s === BooleanNumber.TRUE) {
    font.strike = true;
  }
  if (style.cl?.rgb) {
    font.color = { argb: rgbToArgb(style.cl.rgb) };
  }
  if (Object.keys(font).length > 0) {
    cell.font = font;
  }

  if (style.bg?.rgb) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: rgbToArgb(style.bg.rgb) },
    };
  }

  if (style.n?.pattern) {
    cell.numFmt = style.n.pattern;
  }

  const alignment: Partial<ExcelJS.Alignment> = {};
  const horizontal = univerHorizontalAlignToExcel(style.ht ?? null);
  const vertical = univerVerticalAlignToExcel(style.vt ?? null);
  if (horizontal) {
    alignment.horizontal = horizontal;
  }
  if (vertical) {
    alignment.vertical = vertical;
  }
  if (style.tb === WrapStrategy.WRAP) {
    alignment.wrapText = true;
  }
  if (Object.keys(alignment).length > 0) {
    cell.alignment = alignment;
  }

  const border = univerBorderToExcel(style.bd ?? undefined);
  if (border) {
    cell.border = border;
  }
}

function readMergeRanges(worksheet: ExcelJS.Worksheet): IRange[] {
  const model = worksheet.model as ExcelJS.WorksheetModel & { merges?: string[] };
  return (model.merges ?? []).map(parseExcelRange).filter((range): range is IRange => Boolean(range));
}

function parseExcelRange(value: string): IRange | null {
  const [start, end = start] = value.split(":");
  const startCell = parseExcelCellAddress(start);
  const endCell = parseExcelCellAddress(end);
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

function parseExcelCellAddress(address: string): { row: number; column: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    row: Number(match[2]) - 1,
    column: columnNameToIndex(match[1]),
  };
}

function columnNameToIndex(name: string): number {
  return name.toUpperCase().split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function excelWidthToPx(width: number): number {
  return Math.round(width * 8);
}

function pxToExcelWidth(width: number): number {
  return Math.max(1, Math.round((width / 8) * 100) / 100);
}

function normalizeFormula(formula: string): string {
  if (!formula) {
    return "";
  }
  return formula.startsWith("=") ? formula : `=${formula}`;
}

function formulaFromExcelValue(value: ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue): string {
  return ("formula" in value ? value.formula : value.sharedFormula) ?? "";
}

function normalizeFormulaResult(
  value: ExcelJS.CellFormulaValue["result"] | ExcelJS.CellSharedFormulaValue["result"] | undefined,
): { value: NonNullable<ICellData["v"]>; type: CellValueType } | null {
  if (value instanceof Date) {
    return { value: formatDateValue(value), type: CellValueType.STRING };
  }
  if (typeof value === "string") {
    return { value, type: CellValueType.STRING };
  }
  if (typeof value === "number") {
    return { value, type: CellValueType.NUMBER };
  }
  if (typeof value === "boolean") {
    return { value, type: CellValueType.BOOLEAN };
  }
  if (value && typeof value === "object" && "error" in value) {
    return { value: String(value.error), type: CellValueType.STRING };
  }
  return null;
}

function formatDateValue(value: Date): string {
  const iso = value.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace(".000Z", "Z");
}

function excelColorToRgb(color?: Partial<ExcelJS.Color>): string | null {
  if (!color?.argb) {
    return null;
  }
  return `#${color.argb.slice(-6)}`;
}

function excelFillToRgb(fill?: ExcelJS.Fill): string | null {
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid") {
    return null;
  }
  return excelColorToRgb(fill.fgColor);
}

function excelBorderToUniver(border?: Partial<ExcelJS.Borders>): IStyleData["bd"] | null {
  if (!border) {
    return null;
  }
  const top = excelBorderSideToUniver(border.top);
  const right = excelBorderSideToUniver(border.right);
  const bottom = excelBorderSideToUniver(border.bottom);
  const left = excelBorderSideToUniver(border.left);
  if (!top && !right && !bottom && !left) {
    return null;
  }
  return {
    ...(top ? { t: top } : {}),
    ...(right ? { r: right } : {}),
    ...(bottom ? { b: bottom } : {}),
    ...(left ? { l: left } : {}),
  };
}

type UniverBorderData = Exclude<IStyleData["bd"], null | undefined | void>;
type UniverBorderSide = NonNullable<UniverBorderData["t"]>;

function excelBorderSideToUniver(border?: Partial<ExcelJS.Border>): UniverBorderSide | null {
  if (!border?.style) {
    return null;
  }
  return {
    s: excelBorderStyleToUniver(border.style),
    cl: { rgb: excelColorToRgb(border.color) ?? "#d9d9d9" },
  };
}

function univerBorderToExcel(border?: IStyleData["bd"]): Partial<ExcelJS.Borders> | null {
  if (!border) {
    return null;
  }
  const top = univerBorderSideToExcel(border.t ?? undefined);
  const right = univerBorderSideToExcel(border.r ?? undefined);
  const bottom = univerBorderSideToExcel(border.b ?? undefined);
  const left = univerBorderSideToExcel(border.l ?? undefined);
  if (!top && !right && !bottom && !left) {
    return null;
  }
  return {
    ...(top ? { top } : {}),
    ...(right ? { right } : {}),
    ...(bottom ? { bottom } : {}),
    ...(left ? { left } : {}),
  };
}

function univerBorderSideToExcel(border?: UniverBorderSide | null | void): Partial<ExcelJS.Border> | null {
  if (!border) {
    return null;
  }
  return {
    style: univerBorderStyleToExcel(border.s),
    color: border.cl?.rgb ? { argb: rgbToArgb(border.cl.rgb) } : undefined,
  };
}

function excelBorderStyleToUniver(style: ExcelJS.BorderStyle): BorderStyleTypes {
  const map: Partial<Record<ExcelJS.BorderStyle, BorderStyleTypes>> = {
    thin: BorderStyleTypes.THIN,
    dotted: BorderStyleTypes.DOTTED,
    hair: BorderStyleTypes.HAIR,
    medium: BorderStyleTypes.MEDIUM,
    double: BorderStyleTypes.DOUBLE,
    thick: BorderStyleTypes.THICK,
    dashed: BorderStyleTypes.DASHED,
    dashDot: BorderStyleTypes.DASH_DOT,
    dashDotDot: BorderStyleTypes.DASH_DOT_DOT,
    slantDashDot: BorderStyleTypes.SLANT_DASH_DOT,
    mediumDashed: BorderStyleTypes.MEDIUM_DASHED,
    mediumDashDot: BorderStyleTypes.MEDIUM_DASH_DOT,
    mediumDashDotDot: BorderStyleTypes.MEDIUM_DASH_DOT_DOT,
  };
  return map[style] ?? BorderStyleTypes.THIN;
}

function univerBorderStyleToExcel(style?: BorderStyleTypes): ExcelJS.BorderStyle {
  const map: Partial<Record<BorderStyleTypes, ExcelJS.BorderStyle>> = {
    [BorderStyleTypes.THIN]: "thin",
    [BorderStyleTypes.DOTTED]: "dotted",
    [BorderStyleTypes.HAIR]: "hair",
    [BorderStyleTypes.MEDIUM]: "medium",
    [BorderStyleTypes.DOUBLE]: "double",
    [BorderStyleTypes.THICK]: "thick",
    [BorderStyleTypes.DASHED]: "dashed",
    [BorderStyleTypes.DASH_DOT]: "dashDot",
    [BorderStyleTypes.DASH_DOT_DOT]: "dashDotDot",
    [BorderStyleTypes.SLANT_DASH_DOT]: "slantDashDot",
    [BorderStyleTypes.MEDIUM_DASHED]: "mediumDashed",
    [BorderStyleTypes.MEDIUM_DASH_DOT]: "mediumDashDot",
    [BorderStyleTypes.MEDIUM_DASH_DOT_DOT]: "mediumDashDotDot",
  };
  return map[style ?? BorderStyleTypes.THIN] ?? "thin";
}

function excelHorizontalAlignToUniver(value?: ExcelJS.Alignment["horizontal"]): HorizontalAlign | undefined {
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
      return undefined;
  }
}

function excelVerticalAlignToUniver(value?: ExcelJS.Alignment["vertical"]): VerticalAlign | undefined {
  switch (value) {
    case "top":
      return VerticalAlign.TOP;
    case "middle":
      return VerticalAlign.MIDDLE;
    case "bottom":
      return VerticalAlign.BOTTOM;
    default:
      return undefined;
  }
}

function univerHorizontalAlignToExcel(value?: HorizontalAlign | null): ExcelJS.Alignment["horizontal"] | undefined {
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

function univerVerticalAlignToExcel(value?: VerticalAlign | null): ExcelJS.Alignment["vertical"] | undefined {
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

function rgbToArgb(value: string): string {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return hex.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return `FF${hex}`.toUpperCase();
  }
  return "FF000000";
}

function resolveStyle(
  styleRef: ICellData["s"],
  styles: SpreadsheetWorkbookData["styles"],
): IStyleData | null {
  if (!styleRef) {
    return null;
  }
  if (typeof styleRef === "string") {
    return (styles[styleRef] as IStyleData | null | undefined) ?? null;
  }
  return styleRef;
}

function loadXlsxWorkbook(workbook: ExcelJS.Workbook, bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbookXlsx = workbook.xlsx as ExcelJS.Workbook["xlsx"] & {
    load(buffer: Uint8Array): Promise<ExcelJS.Workbook>;
  };
  return workbookXlsx.load(bytes);
}

function toUint8Array(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  return buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
}

function isFormulaCellValue(value: ExcelCellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}

function isRichTextCellValue(value: ExcelCellValue): value is ExcelJS.CellRichTextValue {
  return Boolean(value && typeof value === "object" && "richText" in value);
}

function isHyperlinkCellValue(value: ExcelCellValue): value is ExcelJS.CellHyperlinkValue {
  return Boolean(value && typeof value === "object" && "hyperlink" in value && "text" in value);
}

function isErrorCellValue(value: ExcelCellValue): value is ExcelJS.CellErrorValue {
  return Boolean(value && typeof value === "object" && "error" in value);
}

class StyleRegistry {
  private readonly styles = new Map<string, { id: string; style: IStyleData }>();

  getId(style: IStyleData): string {
    const key = JSON.stringify(style);
    const existing = this.styles.get(key);
    if (existing) {
      return existing.id;
    }
    const id = `style-${this.styles.size + 1}`;
    this.styles.set(key, { id, style });
    return id;
  }

  toJSON(): Record<string, IStyleData> {
    return Object.fromEntries(Array.from(this.styles.values()).map(({ id, style }) => [id, style]));
  }
}
