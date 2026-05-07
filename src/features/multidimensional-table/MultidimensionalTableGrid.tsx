import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { FileDownloadInput, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type {
  MultidimensionalTableDocument,
  MultidimensionalTableField,
  MultidimensionalTableFieldValue,
  MultidimensionalTableOption,
  MultidimensionalTableRecord,
} from "./multidimensionalTableDocument";
import {
  appendMultidimensionalField,
  createField,
  fieldTypeLabel,
  updateMultidimensionalFieldOptions,
} from "./multidimensionalTableDocument";
import { FieldTypeIcon, MultidimensionalTableFieldConfigPanel } from "./MultidimensionalTableFieldConfigPanel";
import { MultidimensionalTableValueInput, updateMultidimensionalRecordValue } from "./MultidimensionalTableValueInput";

interface MultidimensionalTableGridProps {
  document: MultidimensionalTableDocument;
  records?: MultidimensionalTableRecord[];
  onChange: (document: MultidimensionalTableDocument) => void;
  onAddRecord: (values?: Record<string, MultidimensionalTableFieldValue>) => void;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
}

export function MultidimensionalTableGrid({
  document,
  records = document.records,
  onChange,
  onAddRecord,
  onUploadFile,
  onDownloadFile,
}: MultidimensionalTableGridProps) {
  const headerGridStyle = {
    gridTemplateColumns: `repeat(${document.fields.length}, minmax(168px, 1fr)) 116px`,
    minWidth: `${document.fields.length * 168 + 116}px`,
  } satisfies CSSProperties;
  const rowGridStyle = {
    gridTemplateColumns: `repeat(${document.fields.length}, minmax(168px, 1fr)) 116px`,
    minWidth: `${document.fields.length * 168 + 116}px`,
  } satisfies CSSProperties;
  const addField = () => {
    const field = createField(document.fields);
    onChange(appendMultidimensionalField(document, field));
  };

  return (
    <div className="multitable-grid" data-testid="multitable-grid">
      <div className="multitable-grid__header" style={headerGridStyle}>
        {document.fields.map((field) => (
          <FieldHeader
            key={field.id}
            document={document}
            field={field}
            onChange={onChange}
          />
        ))}
        <button type="button" className="multitable-grid__add-field" onClick={addField}>
          <Plus size={14} />
          新字段
        </button>
      </div>
      <div className="multitable-grid__body">
        {records.map((record) => (
          <div key={record.id} className="multitable-grid__row" style={rowGridStyle}>
            {document.fields.map((field) => (
              <div key={field.id} className="multitable-grid__cell">
                <MultidimensionalTableValueInput
                  field={field}
                  value={record.values[field.id]}
                  onUploadFile={onUploadFile}
                  onDownloadFile={onDownloadFile}
                  onChange={(value) => {
                    onChange(updateMultidimensionalRecordValue(document, record.id, field.id, value));
                  }}
                  onCreateOption={(option, nextValue) => {
                    onChange(updateRecordValueWithNewOption(document, record.id, field.id, option, nextValue));
                  }}
                  onRenameOption={(optionId, label) => {
                    onChange(renameFieldOption(document, field.id, optionId, label));
                  }}
                  onDeleteOption={(optionId) => {
                    onChange(deleteFieldOption(document, field.id, optionId));
                  }}
                />
              </div>
            ))}
            <div className="multitable-grid__cell multitable-grid__cell--row-spacer" aria-hidden="true" />
          </div>
        ))}
      </div>
      <button type="button" className="multitable-add-record" onClick={() => onAddRecord()}>
        <Plus size={15} />
        新增记录
      </button>
    </div>
  );
}

function FieldHeader({
  document,
  field,
  onChange,
}: {
  document: MultidimensionalTableDocument;
  field: MultidimensionalTableField;
  onChange: (document: MultidimensionalTableDocument) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const closeOnOutsidePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };

    window.document.addEventListener("mousedown", closeOnOutsidePointerDown);
    return () => window.document.removeEventListener("mousedown", closeOnOutsidePointerDown);
  }, [panelOpen]);

  return (
    <div ref={rootRef} className="multitable-grid__cell multitable-grid__cell--header">
      <button
        type="button"
        className="multitable-grid-field-button"
        aria-label={`${field.name}字段设置`}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((current) => !current)}
      >
        <FieldTypeIcon type={field.type} size={15} />
        <span className="multitable-grid-field-button__name">{field.name}</span>
        <span className="multitable-grid-field-button__type">{fieldTypeLabel(field.type)}</span>
        <ChevronDown size={14} />
      </button>
      {panelOpen ? (
        <MultidimensionalTableFieldConfigPanel
          document={document}
          field={field}
          variant="popover"
          onChange={onChange}
          onDone={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function updateRecordValueWithNewOption(
  document: MultidimensionalTableDocument,
  recordId: string,
  fieldId: string,
  option: MultidimensionalTableOption,
  value: MultidimensionalTableFieldValue,
): MultidimensionalTableDocument {
  return updateMultidimensionalRecordValue(
    updateMultidimensionalFieldOptions(
      document,
      fieldId,
      [
        ...(document.fields.find((field) => field.id === fieldId)?.options ?? []),
        option,
      ],
    ),
    recordId,
    fieldId,
    value,
  );
}

export function renameFieldOption(
  document: MultidimensionalTableDocument,
  fieldId: string,
  optionId: string,
  label: string,
): MultidimensionalTableDocument {
  const field = document.fields.find((currentField) => currentField.id === fieldId);
  if (!field?.options) {
    return document;
  }

  return updateMultidimensionalFieldOptions(
    document,
    fieldId,
    field.options.map((option) => option.id === optionId ? { ...option, label } : option),
  );
}

export function deleteFieldOption(
  document: MultidimensionalTableDocument,
  fieldId: string,
  optionId: string,
): MultidimensionalTableDocument {
  const field = document.fields.find((currentField) => currentField.id === fieldId);
  if (!field?.options) {
    return document;
  }

  return updateMultidimensionalFieldOptions(
    document,
    fieldId,
    field.options.filter((option) => option.id !== optionId),
  );
}
