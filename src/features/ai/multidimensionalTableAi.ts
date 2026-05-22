import type {
  AiTableFieldCandidate,
  AiTablePatch,
  AiTableRecordCandidate,
  AiTableValueCandidate,
} from "../../app/appState";
import {
  createEmptyMultidimensionalTableRecord,
  createField,
  createSelectOption,
  defaultValueForField,
  normalizeFieldValueForType,
  normalizeMultidimensionalTableDocument,
  type MultidimensionalTableDocument,
  type MultidimensionalTableField,
  type MultidimensionalTableFieldType,
  type MultidimensionalTableFieldValue,
} from "../multidimensional-table/multidimensionalTableDocument";

export function applyAiTablePatch(
  document: MultidimensionalTableDocument,
  patch: AiTablePatch,
): MultidimensionalTableDocument {
  let nextDocument = normalizeMultidimensionalTableDocument(document);
  const fieldByName = new Map(nextDocument.fields.map((field) => [normalizeName(field.name), field]));
  const addedFields: MultidimensionalTableField[] = [];

  for (const fieldCandidate of patch.fields ?? []) {
    const fieldName = fieldCandidate.name.trim();
    if (!fieldName || fieldByName.has(normalizeName(fieldName))) {
      continue;
    }
    const field = createAiField([...nextDocument.fields, ...addedFields], fieldCandidate);
    addedFields.push(field);
    fieldByName.set(normalizeName(field.name), field);
  }

  if (addedFields.length > 0) {
    nextDocument = {
      ...nextDocument,
      fields: [...nextDocument.fields, ...addedFields],
      records: nextDocument.records.map((record) => ({
        ...record,
        values: {
          ...record.values,
          ...Object.fromEntries(addedFields.map((field) => [field.id, defaultValueForField(field)])),
        },
      })),
      views: nextDocument.views.map((view) => view.type === "board"
        ? { ...view, cardFieldIds: Array.from(new Set([...(view.cardFieldIds ?? []), ...addedFields.map((field) => field.id)])) }
        : view),
    };
  }

  const records = (patch.records ?? [])
    .map((recordCandidate) => createAiRecord(nextDocument.fields, fieldByName, recordCandidate))
    .filter(Boolean);
  if (records.length > 0) {
    nextDocument = {
      ...nextDocument,
      records: [...nextDocument.records, ...records],
    };
  }

  if (patch.preferBoard) {
    const boardView = nextDocument.views.find((view) => view.type === "board");
    if (boardView) {
      nextDocument = {
        ...nextDocument,
        activeViewId: boardView.id,
      };
    }
  }

  return normalizeMultidimensionalTableDocument(nextDocument);
}

function createAiField(
  existingFields: MultidimensionalTableField[],
  candidate: AiTableFieldCandidate,
): MultidimensionalTableField {
  const type = candidate.type;
  const field = createField(existingFields, type);
  field.name = candidate.name.trim();

  if (type === "singleSelect" || type === "multiSelect") {
    const optionLabels = (candidate.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean);
    field.options = optionLabels.length > 0
      ? optionLabels.map(createSelectOption)
      : field.options;
  }

  return field;
}

function createAiRecord(
  fields: MultidimensionalTableField[],
  fieldByName: Map<string, MultidimensionalTableField>,
  candidate: AiTableRecordCandidate,
) {
  const values: Record<string, MultidimensionalTableFieldValue> = {};
  const primaryField = fields.find((field) => field.primary) ?? fields[0];

  if (candidate.title && primaryField) {
    values[primaryField.id] = candidate.title;
  }

  for (const [fieldName, rawValue] of Object.entries(candidate.values ?? {})) {
    const field = fieldByName.get(normalizeName(fieldName));
    if (!field) {
      continue;
    }
    values[field.id] = normalizeAiTableValue(rawValue, field);
  }

  const record = createEmptyMultidimensionalTableRecord(fields, values);
  record.body = candidate.body?.trim() ?? "";
  return record;
}

function normalizeAiTableValue(
  value: AiTableValueCandidate,
  field: MultidimensionalTableField,
): MultidimensionalTableFieldValue {
  if (field.type === "singleSelect") {
    return optionIdForLabel(field, valueToText(value));
  }
  if (field.type === "multiSelect") {
    const labels = Array.isArray(value) ? value : [valueToText(value)];
    return labels
      .map((label) => optionIdForLabel(field, label))
      .filter(Boolean);
  }
  return normalizeFieldValueForType(valueToFieldValue(value, field.type), field.type);
}

function optionIdForLabel(field: MultidimensionalTableField, label: string): string {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return "";
  }
  const existingOption = field.options?.find((option) => normalizeName(option.label) === normalizeName(trimmedLabel));
  if (existingOption) {
    return existingOption.id;
  }
  const created = createSelectOption(trimmedLabel);
  field.options = [...(field.options ?? []), created];
  return created.id;
}

function valueToFieldValue(
  value: AiTableValueCandidate,
  type: MultidimensionalTableFieldType,
): MultidimensionalTableFieldValue {
  if (type === "multiSelect") {
    return Array.isArray(value) ? value.map(valueToText).filter(Boolean) : [];
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join("、");
  }
  return String(value);
}

function valueToText(value: AiTableValueCandidate): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join("、");
  }
  return String(value).trim();
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("zh-Hans-CN");
}
