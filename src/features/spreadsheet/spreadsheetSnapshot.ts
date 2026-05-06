import {
  createEmptySpreadsheetWorkbookData,
  normalizeSpreadsheetWorkbookData,
  type SpreadsheetWorkbookData,
} from "./spreadsheetDocument";

export function parseSpreadsheetSnapshot(content: string, name = "未命名表格"): SpreadsheetWorkbookData {
  if (!content.trim()) {
    return createEmptySpreadsheetWorkbookData(name);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`表格快照解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isWorkbookSnapshotCandidate(parsed)) {
    throw new Error("表格快照格式无效：缺少 sheetOrder 或 sheets");
  }

  return normalizeSpreadsheetWorkbookData(parsed, name);
}

export function serializeSpreadsheetSnapshot(data: SpreadsheetWorkbookData): string {
  // Univer 的保存结果是 IWorkbookData 快照对象；落盘时只做 JSON 序列化，不再转换为 XLSX。
  return `${JSON.stringify(normalizeSpreadsheetWorkbookData(data, data.name), null, 2)}\n`;
}

function isWorkbookSnapshotCandidate(value: unknown): value is Partial<SpreadsheetWorkbookData> {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as Partial<SpreadsheetWorkbookData>).sheetOrder) &&
    (value as Partial<SpreadsheetWorkbookData>).sheets &&
    typeof (value as Partial<SpreadsheetWorkbookData>).sheets === "object",
  );
}
