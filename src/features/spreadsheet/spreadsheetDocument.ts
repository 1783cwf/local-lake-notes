import {
  BooleanNumber,
  LocaleType,
  type IWorkbookData,
  type IWorksheetData,
} from "@univerjs/core";

export type SpreadsheetWorkbookData = IWorkbookData;

export interface SpreadsheetBridgeResult<T> {
  data: T;
  warnings: string[];
}

const DEFAULT_WORKBOOK_ID = "local-lake-workbook";
const DEFAULT_SHEET_ID = "sheet-0001";

export function createEmptySpreadsheetWorkbookData(name = "未命名表格"): SpreadsheetWorkbookData {
  const sheet = createEmptyWorksheetData(DEFAULT_SHEET_ID, "Sheet1");
  return {
    id: DEFAULT_WORKBOOK_ID,
    name,
    appVersion: "0.21.1",
    locale: LocaleType.ZH_CN,
    styles: {},
    sheetOrder: [DEFAULT_SHEET_ID],
    sheets: {
      [DEFAULT_SHEET_ID]: sheet,
    },
  };
}

export function createEmptyWorksheetData(id: string, name: string): IWorksheetData {
  return {
    id,
    name,
    tabColor: "",
    hidden: BooleanNumber.FALSE,
    freeze: {
      xSplit: 0,
      ySplit: 0,
      startRow: 0,
      startColumn: 0,
    },
    rowCount: 100,
    columnCount: 26,
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 88,
    defaultRowHeight: 24,
    mergeData: [],
    cellData: {},
    rowData: {},
    columnData: {},
    rowHeader: {
      width: 46,
    },
    columnHeader: {
      height: 20,
    },
    showGridlines: BooleanNumber.TRUE,
    rightToLeft: BooleanNumber.FALSE,
  };
}

export function normalizeSpreadsheetWorkbookData(
  data: Partial<SpreadsheetWorkbookData> | null | undefined,
  name = "未命名表格",
): SpreadsheetWorkbookData {
  const fallback = createEmptySpreadsheetWorkbookData(name);
  if (!data || !data.sheets || !data.sheetOrder?.length) {
    return fallback;
  }

  const sheets = Object.fromEntries(
    data.sheetOrder
      .filter((sheetId) => data.sheets?.[sheetId])
      .map((sheetId, index) => {
        const sheet = data.sheets?.[sheetId] ?? {};
        return [
          sheetId,
          {
            ...createEmptyWorksheetData(sheetId, sheet.name || `Sheet${index + 1}`),
            ...sheet,
            id: sheetId,
            name: sheet.name || `Sheet${index + 1}`,
          },
        ];
      }),
  );

  const sheetOrder = Object.keys(sheets);
  if (sheetOrder.length === 0) {
    return fallback;
  }

  return {
    ...fallback,
    ...data,
    name: data.name || name,
    styles: data.styles ?? {},
    sheetOrder,
    sheets,
  };
}
