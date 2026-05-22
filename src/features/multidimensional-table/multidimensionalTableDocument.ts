export const MULTIDIMENSIONAL_TABLE_KIND = "multidimensional-table";
export const MULTIDIMENSIONAL_TABLE_EXTENSION = ".dbtable.json";

export type MultidimensionalTableFieldType =
  | "text"
  | "longText"
  | "singleSelect"
  | "multiSelect"
  | "number"
  | "progress"
  | "attachment"
  | "time"
  | "url";
export type MultidimensionalTableViewType = "table" | "board";
export type MultidimensionalTableFieldValue = string | string[] | MultidimensionalTableAttachment[] | null;
export type MultidimensionalTableTimeFormat =
  | "yyyy-mm-dd"
  | "yyyy/mm/dd"
  | "yyyy-mm-dd hh:mm"
  | "yyyy/mm/dd hh:mm"
  | "hh:mm"
  | "yyyy年m月d日"
  | "yyyy年m月d日 hh:mm";
export type MultidimensionalTableFilterOperator =
  | "is"
  | "isNot"
  | "isEmpty"
  | "isNotEmpty"
  | "contains"
  | "notContains"
  | "startsWith"
  | "notStartsWith"
  | "endsWith"
  | "notEndsWith"
  | "equals"
  | "before"
  | "after"
  | "greaterThan"
  | "lessThan";

export interface MultidimensionalTableOption {
  id: string;
  label: string;
  color: string;
}

export interface MultidimensionalTableAttachment {
  id: string;
  name: string;
  url: string;
  resourceRef?: string;
  size?: number;
  mimeType?: string;
}

export interface MultidimensionalTableField {
  id: string;
  name: string;
  type: MultidimensionalTableFieldType;
  primary?: boolean;
  options?: MultidimensionalTableOption[];
  timeFormat?: MultidimensionalTableTimeFormat;
}

export interface MultidimensionalTableRecord {
  id: string;
  values: Record<string, MultidimensionalTableFieldValue>;
  body?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MultidimensionalTableView {
  id: string;
  name: string;
  type: MultidimensionalTableViewType;
  groupByFieldId?: string;
  cardFieldIds?: string[];
  cardFieldConfigExplicit?: boolean;
  filterRules?: MultidimensionalTableFilterRule[];
}

export interface MultidimensionalTableFilterRule {
  id: string;
  fieldId: string;
  operator: MultidimensionalTableFilterOperator;
  value?: string;
}

export interface MultidimensionalTableDocument {
  kind: typeof MULTIDIMENSIONAL_TABLE_KIND;
  version: 1;
  fields: MultidimensionalTableField[];
  records: MultidimensionalTableRecord[];
  views: MultidimensionalTableView[];
  activeViewId: string;
}

export const multidimensionalTableFieldTypeOptions: Array<{
  type: MultidimensionalTableFieldType;
  label: string;
}> = [
  { type: "text", label: "文本" },
  { type: "singleSelect", label: "单选" },
  { type: "multiSelect", label: "多选" },
  { type: "number", label: "数字" },
  { type: "progress", label: "进度" },
  { type: "attachment", label: "附件" },
  { type: "time", label: "时间" },
  { type: "url", label: "URL" },
];

export const defaultTimeFormat: MultidimensionalTableTimeFormat = "yyyy/mm/dd hh:mm";

export const multidimensionalTableTimeFormatOptions: Array<{
  format: MultidimensionalTableTimeFormat;
  label: string;
  placeholder: string;
}> = [
  { format: "yyyy-mm-dd", label: "2026-05-07", placeholder: "2026-05-07" },
  { format: "yyyy/mm/dd", label: "2026/05/07", placeholder: "2026/05/07" },
  { format: "yyyy-mm-dd hh:mm", label: "2026-05-07 12:30", placeholder: "2026-05-07 12:30" },
  { format: "yyyy/mm/dd hh:mm", label: "2026/05/07 12:30", placeholder: "2026/05/07 12:30" },
  { format: "hh:mm", label: "12:30", placeholder: "12:30" },
  { format: "yyyy年m月d日", label: "2026年5月7日", placeholder: "2026年5月7日" },
  { format: "yyyy年m月d日 hh:mm", label: "2026年5月7日 12:30", placeholder: "2026年5月7日 12:30" },
];

const defaultStatusOptions: MultidimensionalTableOption[] = [
  { id: "status-single-1", label: "单选1", color: "blue" },
  { id: "status-single-2", label: "单选2", color: "green" },
];

export function createDefaultMultidimensionalTableDocument(): MultidimensionalTableDocument {
  return {
    kind: MULTIDIMENSIONAL_TABLE_KIND,
    version: 1,
    fields: [
      { id: "title", name: "标题", type: "text", primary: true },
      { id: "status", name: "状态", type: "singleSelect", options: defaultStatusOptions },
      { id: "description", name: "主要内容", type: "text" },
      { id: "date", name: "日期", type: "time", timeFormat: defaultTimeFormat },
      { id: "attachment", name: "附件", type: "attachment" },
    ],
    records: [],
    views: [
      { id: "view-table", name: "表格", type: "table" },
      {
        id: "view-board",
        name: "看板",
        type: "board",
        groupByFieldId: "status",
        cardFieldIds: ["description", "date", "attachment"],
      },
    ],
    activeViewId: "view-board",
  };
}

export function parseMultidimensionalTableDocument(content: string): MultidimensionalTableDocument {
  if (!content.trim()) {
    return createDefaultMultidimensionalTableDocument();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`多维表格解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed) || parsed.kind !== MULTIDIMENSIONAL_TABLE_KIND) {
    throw new Error("多维表格格式无效：缺少 kind=multidimensional-table");
  }
  if (parsed.version !== 1) {
    throw new Error("多维表格格式无效：不支持的版本");
  }

  return normalizeMultidimensionalTableDocument(parsed);
}

export function serializeMultidimensionalTableDocument(document: MultidimensionalTableDocument): string {
  return `${JSON.stringify(normalizeMultidimensionalTableDocument(document), null, 2)}\n`;
}

export function normalizeMultidimensionalTableDocument(input: Partial<MultidimensionalTableDocument>): MultidimensionalTableDocument {
  const fallback = createDefaultMultidimensionalTableDocument();
  const fields = normalizeFields(input.fields, fallback.fields);
  const fieldIds = new Set(fields.map((field) => field.id));
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const views = normalizeViews(input.views, fallback.views, fieldIds);
  const activeViewId = views.some((view) => view.id === input.activeViewId) ? input.activeViewId! : views[0].id;

  return {
    kind: MULTIDIMENSIONAL_TABLE_KIND,
    version: 1,
    fields,
    records: normalizeRecords(input.records, fieldById),
    views,
    activeViewId,
  };
}

export function createEmptyMultidimensionalTableRecord(
  fields: MultidimensionalTableField[],
  overrides: Record<string, MultidimensionalTableFieldValue> = {},
): MultidimensionalTableRecord {
  const now = new Date().toISOString();
  const values = Object.fromEntries(fields.map((field) => [field.id, defaultValueForField(field)]));

  return {
    id: createLocalId("record"),
    values: { ...values, ...overrides },
    body: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createField(
  existingFields: MultidimensionalTableField[],
  type: MultidimensionalTableFieldType = "text",
): MultidimensionalTableField {
  const index = existingFields.length + 1;
  const field: MultidimensionalTableField = {
    id: createLocalId("field"),
    name: `新${fieldTypeLabel(type)}字段 ${index}`,
    type,
  };

  if (type === "singleSelect") {
    field.options = [createSelectOption("单选1"), createSelectOption("单选2")];
  }
  if (type === "multiSelect") {
    field.options = [createSelectOption("多选1"), createSelectOption("多选2")];
  }
  if (type === "time") {
    field.timeFormat = defaultTimeFormat;
  }

  return field;
}

export function createTextField(existingFields: MultidimensionalTableField[]): MultidimensionalTableField {
  return createField(existingFields, "text");
}

export function fieldTypeLabel(type: MultidimensionalTableFieldType): string {
  if (type === "longText") {
    return "文本";
  }

  return multidimensionalTableFieldTypeOptions.find((option) => option.type === type)?.label ?? "文本";
}

export function normalizeFieldValueForType(
  value: MultidimensionalTableFieldValue,
  type: MultidimensionalTableFieldType,
): MultidimensionalTableFieldValue {
  if (type === "attachment") {
    return normalizeAttachmentFieldValue(value);
  }

  if (type === "multiSelect") {
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === "string" ? firstValue : "";
  }

  if (type === "progress") {
    return clampProgressValue(value);
  }

  return typeof value === "string" ? value : "";
}

function normalizeSelectValueForOptions(
  value: MultidimensionalTableFieldValue | undefined,
  type: "singleSelect" | "multiSelect",
  optionIds: Set<string>,
): MultidimensionalTableFieldValue {
  if (type === "multiSelect") {
    return Array.isArray(value)
      ? value.filter((optionId): optionId is string => typeof optionId === "string" && optionIds.has(optionId))
      : [];
  }
  return typeof value === "string" && optionIds.has(value) ? value : "";
}

export function defaultValueForField(field: MultidimensionalTableField): MultidimensionalTableFieldValue {
  if (field.type === "multiSelect" || field.type === "attachment") {
    return [];
  }
  return "";
}

export function appendMultidimensionalField(
  document: MultidimensionalTableDocument,
  field: MultidimensionalTableField,
): MultidimensionalTableDocument {
  const nextViews = document.views.map((view) => view.type === "board"
    ? { ...view, cardFieldIds: [...(view.cardFieldIds ?? []), field.id] }
    : view);

  return {
    ...document,
    fields: [...document.fields, field],
    records: document.records.map((record) => ({
      ...record,
      values: { ...record.values, [field.id]: defaultValueForField(field) },
    })),
    views: nextViews,
  };
}

export function reorderMultidimensionalFields(
  document: MultidimensionalTableDocument,
  activeFieldId: string,
  overFieldId: string,
): MultidimensionalTableDocument {
  if (activeFieldId === overFieldId) {
    return document;
  }

  const activeIndex = document.fields.findIndex((field) => field.id === activeFieldId);
  const overIndex = document.fields.findIndex((field) => field.id === overFieldId);
  if (activeIndex < 0 || overIndex < 0) {
    return document;
  }

  const nextFields = [...document.fields];
  const [activeField] = nextFields.splice(activeIndex, 1);
  nextFields.splice(overIndex, 0, activeField);

  return {
    ...document,
    fields: nextFields,
  };
}

export interface MultidimensionalTableImportResult {
  document: MultidimensionalTableDocument;
  importedRecordCount: number;
  createdFieldCount: number;
  matchedFieldCount: number;
}

export function importPastedMultidimensionalTableData(
  document: MultidimensionalTableDocument,
  pastedText: string,
): MultidimensionalTableImportResult {
  // 粘贴导入以第一行作为字段名，后续行作为记录；空行会被忽略，避免 Excel 复制尾部空白生成无效记录。
  const rows = parseDelimitedRows(pastedText)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
  if (rows.length < 2) {
    throw new Error("请粘贴包含表头和至少一行数据的表格内容");
  }

  const [headerRow, ...dataRows] = rows;
  const columnIndexes = activeImportColumnIndexes(headerRow, dataRows);
  if (columnIndexes.length === 0) {
    throw new Error("未识别到可导入的字段");
  }

  const normalizedDocument = normalizeMultidimensionalTableDocument(document);
  const workingFields: MultidimensionalTableField[] = normalizedDocument.fields.map((field) => ({
    ...field,
    options: field.options ? field.options.map((option) => ({ ...option })) : field.options,
  }));
  const fieldByName = new Map(workingFields.map((field) => [normalizeImportName(field.name), field]));
  const usedTargetNames = new Set<string>();
  const createdFields: MultidimensionalTableField[] = [];
  // 同名字段直接复用，未命中的表头创建文本字段；重复表头使用唯一名称，避免覆盖同一字段。
  const columnFields = columnIndexes.map((columnIndex) => {
    const rawHeaderName = headerRow[columnIndex]?.trim() || `导入字段 ${columnIndex + 1}`;
    const normalizedHeaderName = normalizeImportName(rawHeaderName);
    const existingField = usedTargetNames.has(normalizedHeaderName) ? undefined : fieldByName.get(normalizedHeaderName);

    if (existingField) {
      usedTargetNames.add(normalizeImportName(existingField.name));
      return { columnIndex, field: existingField, created: false };
    }

    const field = createField(workingFields, "text");
    field.name = uniqueImportFieldName(rawHeaderName, fieldByName);
    workingFields.push(field);
    createdFields.push(field);
    fieldByName.set(normalizeImportName(field.name), field);
    usedTargetNames.add(normalizeImportName(field.name));
    return { columnIndex, field, created: true };
  });

  const records = dataRows
    .filter((row) => columnFields.some(({ columnIndex }) => (row[columnIndex] ?? "").trim().length > 0))
    .map((row) => {
      const values: Record<string, MultidimensionalTableFieldValue> = {};

      // 只写入非空单元格，空单元格保留字段默认值，避免把已有类型的空值解析成异常形态。
      for (const { columnIndex, field } of columnFields) {
        const cellText = row[columnIndex]?.trim() ?? "";
        if (!cellText) {
          continue;
        }
        values[field.id] = normalizeImportedCellValue(cellText, field);
      }

      return createEmptyMultidimensionalTableRecord(workingFields, values);
    });
  if (records.length === 0) {
    throw new Error("未识别到可导入的记录");
  }

  const createdFieldDefaults = Object.fromEntries(createdFields.map((field) => [field.id, defaultValueForField(field)]));
  const nextDocument = normalizeMultidimensionalTableDocument({
    ...normalizedDocument,
    fields: workingFields,
    records: [
      ...normalizedDocument.records.map((record) => ({
        ...record,
        values: { ...record.values, ...createdFieldDefaults },
      })),
      ...records,
    ],
    views: createdFields.length > 0
      ? normalizedDocument.views.map((view) => view.type === "board"
        ? { ...view, cardFieldIds: Array.from(new Set([...(view.cardFieldIds ?? []), ...createdFields.map((field) => field.id)])) }
        : view)
      : normalizedDocument.views,
  });

  return {
    document: nextDocument,
    importedRecordCount: records.length,
    createdFieldCount: createdFields.length,
    matchedFieldCount: columnFields.length - createdFields.length,
  };
}

export function renameMultidimensionalField(
  document: MultidimensionalTableDocument,
  fieldId: string,
  name: string,
): MultidimensionalTableDocument {
  return {
    ...document,
    fields: document.fields.map((field) => field.id === fieldId ? { ...field, name } : field),
  };
}

export function changeMultidimensionalFieldType(
  document: MultidimensionalTableDocument,
  fieldId: string,
  type: MultidimensionalTableFieldType,
): MultidimensionalTableDocument {
  const fields = document.fields.map((field) => {
    if (field.id !== fieldId) {
      return field;
    }

    const isSelectType = type === "singleSelect" || type === "multiSelect";
    // 字段切换类型时保留字段 ID，避免视图和记录关联失效；只按新类型规整值形态。
    return {
      ...field,
      type,
      options: isSelectType ? (field.options?.length ? field.options : createEmptySelectOptions(type)) : undefined,
      timeFormat: type === "time" ? (field.timeFormat ?? defaultTimeFormat) : undefined,
    };
  });

  return {
    ...document,
    fields,
    records: document.records.map((record) => ({
      ...record,
      values: {
        ...record.values,
        [fieldId]: normalizeFieldValueForType(record.values[fieldId], type),
      },
    })),
  };
}

export function updateMultidimensionalFieldOptions(
  document: MultidimensionalTableDocument,
  fieldId: string,
  options: MultidimensionalTableOption[],
): MultidimensionalTableDocument {
  const field = document.fields.find((candidate) => candidate.id === fieldId);
  const optionIds = new Set(options.map((option) => option.id));
  const selectFieldType = field?.type === "singleSelect" || field?.type === "multiSelect" ? field.type : null;
  return {
    ...document,
    fields: document.fields.map((field) => field.id === fieldId ? { ...field, options } : field),
    records: selectFieldType
      ? document.records.map((record) => ({
        ...record,
        // 删除选项后同步清理记录值，避免 UI 中看不到但数据里仍残留旧 optionId。
        values: {
          ...record.values,
          [fieldId]: normalizeSelectValueForOptions(record.values[fieldId], selectFieldType, optionIds),
        },
      }))
      : document.records,
  };
}

export function updateMultidimensionalFieldTimeFormat(
  document: MultidimensionalTableDocument,
  fieldId: string,
  timeFormat: MultidimensionalTableTimeFormat,
): MultidimensionalTableDocument {
  return {
    ...document,
    fields: document.fields.map((field) => field.id === fieldId ? { ...field, timeFormat } : field),
  };
}

export function updateMultidimensionalRecordBody(
  document: MultidimensionalTableDocument,
  recordId: string,
  body: string,
): MultidimensionalTableDocument {
  const updatedAt = new Date().toISOString();
  return {
    ...document,
    records: document.records.map((record) => record.id === recordId
      ? { ...record, body, updatedAt }
      : record),
  };
}

export function deleteMultidimensionalRecord(
  document: MultidimensionalTableDocument,
  recordId: string,
): MultidimensionalTableDocument {
  return {
    ...document,
    records: document.records.filter((record) => record.id !== recordId),
  };
}

export function deleteMultidimensionalField(
  document: MultidimensionalTableDocument,
  fieldId: string,
): MultidimensionalTableDocument {
  const field = document.fields.find((currentField) => currentField.id === fieldId);
  if (!field || field.primary) {
    return document;
  }

  return {
    ...document,
    fields: document.fields.filter((currentField) => currentField.id !== fieldId),
    records: document.records.map((record) => {
      const { [fieldId]: _removedValue, ...values } = record.values;
      return { ...record, values };
    }),
    views: document.views.map((view) => ({
      ...view,
      groupByFieldId: view.groupByFieldId === fieldId ? undefined : view.groupByFieldId,
      cardFieldIds: view.cardFieldIds?.filter((cardFieldId) => cardFieldId !== fieldId),
      filterRules: view.filterRules?.filter((rule) => rule.fieldId !== fieldId),
    })),
  };
}

export function formatTimeFieldValue(
  value: MultidimensionalTableFieldValue | undefined,
  field: Pick<MultidimensionalTableField, "timeFormat">,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }

  const parts = parseTimeParts(text);
  if (!parts) {
    return text;
  }

  return formatTimeParts(parts, field.timeFormat ?? defaultTimeFormat);
}

export function timeFormatPlaceholder(format: MultidimensionalTableTimeFormat | undefined): string {
  return multidimensionalTableTimeFormatOptions.find((option) => option.format === (format ?? defaultTimeFormat))?.placeholder ??
    "2026/05/07 12:30";
}

function clampProgressValue(value: MultidimensionalTableFieldValue): string {
  const numericValue = Number(typeof value === "string" ? value : "");
  if (Number.isNaN(numericValue)) {
    return "";
  }
  return String(Math.min(100, Math.max(0, Math.round(numericValue))));
}

function normalizeFieldType(value: unknown): MultidimensionalTableFieldType {
  // 旧版本字段曾使用 date；这里迁移为 time，避免历史文件因为字段枚举变化打不开。
  if (value === "date") {
    return "time";
  }
  return isFieldType(value) ? value : "text";
}

function createEmptySelectOptions(type: MultidimensionalTableFieldType): MultidimensionalTableOption[] | undefined {
  if (type === "singleSelect") {
    return [createSelectOption("单选1"), createSelectOption("单选2")];
  }
  if (type === "multiSelect") {
    return [createSelectOption("多选1"), createSelectOption("多选2")];
  }
  return undefined;
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSelectOption(label: string): MultidimensionalTableOption {
  return {
    id: createLocalId("option"),
    label: label.trim() || "新分组",
    color: optionColors[Math.floor(Math.random() * optionColors.length)],
  };
}

export function optionById(field: MultidimensionalTableField | undefined, optionId: string | null | undefined): MultidimensionalTableOption | null {
  if (!field?.options || !optionId) {
    return null;
  }
  return field.options.find((option) => option.id === optionId) ?? null;
}

function normalizeFields(
  fields: MultidimensionalTableDocument["fields"] | undefined,
  fallback: MultidimensionalTableField[],
): MultidimensionalTableField[] {
  const candidates = Array.isArray(fields) && fields.length > 0 ? fields : fallback;
  return candidates
    .filter((field) => field && typeof field.id === "string" && typeof field.name === "string")
    .map((field) => {
      const type = normalizeFieldType(field.type);
      return {
        id: field.id,
        name: field.name,
        type,
        primary: Boolean(field.primary),
        options: Array.isArray(field.options)
          ? field.options.filter(isOption)
          : createEmptySelectOptions(type),
        timeFormat: type === "time" ? normalizeTimeFormat(field.timeFormat) : undefined,
      };
    });
}

function normalizeRecords(
  records: MultidimensionalTableDocument["records"] | undefined,
  fieldById: Map<string, MultidimensionalTableField>,
): MultidimensionalTableRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .filter((record) => record && typeof record.id === "string" && isRecord(record.values))
    .map((record) => ({
      id: record.id,
      values: Object.fromEntries(
        Object.entries(record.values)
          .filter(([fieldId, value]) => fieldById.has(fieldId) && isFieldValue(value))
          .map(([fieldId, value]) => [fieldId, normalizeFieldValueForType(value, fieldById.get(fieldId)!.type)]),
      ),
      body: typeof record.body === "string" ? record.body : "",
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    }));
}

function normalizeViews(
  views: MultidimensionalTableDocument["views"] | undefined,
  fallback: MultidimensionalTableView[],
  fieldIds: Set<string>,
): MultidimensionalTableView[] {
  const candidates = Array.isArray(views) && views.length > 0 ? views : fallback;
  const normalized = candidates
    .filter((view) => view && typeof view.id === "string" && typeof view.name === "string")
    .map((view) => ({
      id: view.id,
      name: view.name,
      type: view.type === "board" ? "board" as const : "table" as const,
      groupByFieldId: view.groupByFieldId && fieldIds.has(view.groupByFieldId) ? view.groupByFieldId : undefined,
      cardFieldIds: Array.isArray(view.cardFieldIds)
        ? view.cardFieldIds.filter((fieldId) => fieldIds.has(fieldId))
        : undefined,
      cardFieldConfigExplicit: Boolean(view.cardFieldConfigExplicit),
      filterRules: normalizeFilterRules(view.filterRules, fieldIds),
    }));

  // 表格和看板共享同一份数据；缺省视图必须补齐，避免旧文件或手工编辑后打不开。
  const hasTable = normalized.some((view) => view.type === "table");
  const hasBoard = normalized.some((view) => view.type === "board");
  return [
    ...normalized,
    ...(hasTable ? [] : [fallback.find((view) => view.type === "table")!]),
    ...(hasBoard ? [] : [fallback.find((view) => view.type === "board")!]),
  ];
}

function normalizeFilterRules(value: unknown, fieldIds: Set<string>): MultidimensionalTableFilterRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rules = value
    .filter((rule) => isRecord(rule) && typeof rule.fieldId === "string" && fieldIds.has(rule.fieldId))
    .map((rule) => ({
      id: typeof rule.id === "string" && rule.id ? rule.id : createLocalId("filter"),
      fieldId: rule.fieldId as string,
      operator: normalizeFilterOperator(rule.operator),
      value: typeof rule.value === "string" ? rule.value : "",
    }));

  return rules.length > 0 ? rules : undefined;
}

function normalizeFilterOperator(value: unknown): MultidimensionalTableFilterOperator {
  return isFilterOperator(value) ? value : "contains";
}

function parseDelimitedRows(value: string): string[][] {
  const text = value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === "\"") {
      if (quoted && nextCharacter === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function activeImportColumnIndexes(headerRow: string[], dataRows: string[][]): number[] {
  const columnCount = Math.max(headerRow.length, ...dataRows.map((row) => row.length));
  return Array.from({ length: columnCount }, (_, index) => index)
    .filter((index) => Boolean(headerRow[index]?.trim()) || dataRows.some((row) => Boolean(row[index]?.trim())));
}

function normalizeImportedCellValue(
  value: string,
  field: MultidimensionalTableField,
): MultidimensionalTableFieldValue {
  if (field.type === "singleSelect") {
    return optionIdForImportedLabel(field, value);
  }

  if (field.type === "multiSelect") {
    return splitImportedMultiValues(value)
      .map((label) => optionIdForImportedLabel(field, label))
      .filter(Boolean);
  }

  return normalizeFieldValueForType(value, field.type);
}

function optionIdForImportedLabel(field: MultidimensionalTableField, label: string): string {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return "";
  }

  const existingOption = field.options?.find((option) => normalizeImportName(option.label) === normalizeImportName(trimmedLabel));
  if (existingOption) {
    return existingOption.id;
  }

  const createdOption = createSelectOption(trimmedLabel);
  field.options = [...(field.options ?? []), createdOption];
  return createdOption.id;
}

function splitImportedMultiValues(value: string): string[] {
  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueImportFieldName(
  rawName: string,
  fieldByName: Map<string, MultidimensionalTableField>,
): string {
  const baseName = rawName.trim() || "导入字段";
  let candidateName = baseName;
  let suffix = 2;

  while (fieldByName.has(normalizeImportName(candidateName))) {
    candidateName = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return candidateName;
}

function normalizeImportName(name: string): string {
  return name.trim().toLocaleLowerCase("zh-Hans-CN");
}

function isFilterOperator(value: unknown): value is MultidimensionalTableFilterOperator {
  return value === "is" ||
    value === "isNot" ||
    value === "isEmpty" ||
    value === "isNotEmpty" ||
    value === "contains" ||
    value === "notContains" ||
    value === "startsWith" ||
    value === "notStartsWith" ||
    value === "endsWith" ||
    value === "notEndsWith" ||
    value === "equals" ||
    value === "before" ||
    value === "after" ||
    value === "greaterThan" ||
    value === "lessThan";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFieldType(value: unknown): value is MultidimensionalTableFieldType {
  return value === "text" ||
    value === "longText" ||
    value === "singleSelect" ||
    value === "multiSelect" ||
    value === "number" ||
    value === "progress" ||
    value === "attachment" ||
    value === "time" ||
    value === "url";
}

function isFieldValue(value: unknown): value is MultidimensionalTableFieldValue {
  return value === null ||
    typeof value === "string" ||
    (Array.isArray(value) && (value.every((item) => typeof item === "string") || value.every(isAttachmentValue)));
}

function isAttachmentValue(value: unknown): value is MultidimensionalTableAttachment {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    (value.resourceRef === undefined || typeof value.resourceRef === "string") &&
    (value.size === undefined || typeof value.size === "number") &&
    (value.mimeType === undefined || typeof value.mimeType === "string");
}

function normalizeAttachmentFieldValue(value: MultidimensionalTableFieldValue): MultidimensionalTableAttachment[] {
  if (Array.isArray(value) && value.every(isAttachmentValue)) {
    return value.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      resourceRef: attachment.resourceRef,
      size: attachment.size,
      mimeType: attachment.mimeType,
    }));
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === "-") {
      return [];
    }
    return [{
      // 旧版附件是纯文本路径；这里用稳定 ID 避免每次打开文件都产生无意义 diff。
      id: `legacy-${hashText(text)}`,
      name: filenameFromPath(text),
      url: text,
    }];
  }

  return [];
}

function filenameFromPath(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value;
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function isOption(value: unknown): value is MultidimensionalTableOption {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.color === "string";
}

const optionColors = ["green", "blue", "cyan", "yellow", "orange", "gray"];

function normalizeTimeFormat(value: unknown): MultidimensionalTableTimeFormat {
  return isTimeFormat(value) ? value : defaultTimeFormat;
}

function isTimeFormat(value: unknown): value is MultidimensionalTableTimeFormat {
  return multidimensionalTableTimeFormatOptions.some((option) => option.format === value);
}

function parseTimeParts(value: string): {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
} | null {
  const timeOnlyMatch = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (timeOnlyMatch) {
    const now = new Date();
    const [, hourText, minuteText] = timeOnlyMatch;
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    if (!validDateParts(year, month, day, hour, minute)) {
      return null;
    }

    return { year, month, day, hour, minute };
  }

  const match = value.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:[T\s]+(\d{1,2}):(\d{1,2}))?/);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText ? Number(hourText) : undefined;
  const minute = minuteText ? Number(minuteText) : undefined;

  if (!validDateParts(year, month, day, hour, minute)) {
    return null;
  }

  return { year, month, day, hour, minute };
}

function formatTimeParts(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
  },
  format: MultidimensionalTableTimeFormat,
): string {
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  if (format === "hh:mm") {
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  if (format === "yyyy-mm-dd") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
  if (format === "yyyy/mm/dd") {
    return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}`;
  }
  if (format === "yyyy-mm-dd hh:mm") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(hour)}:${pad2(minute)}`;
  }
  if (format === "yyyy年m月d日") {
    return `${parts.year}年${parts.month}月${parts.day}日`;
  }
  if (format === "yyyy年m月d日 hh:mm") {
    return `${parts.year}年${parts.month}月${parts.day}日 ${pad2(hour)}:${pad2(minute)}`;
  }
  return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)} ${pad2(hour)}:${pad2(minute)}`;
}

function validDateParts(
  year: number,
  month: number,
  day: number,
  hour: number | undefined,
  minute: number | undefined,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  if (hour !== undefined && (hour < 0 || hour > 23)) {
    return false;
  }
  return minute === undefined || (minute >= 0 && minute <= 59);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
