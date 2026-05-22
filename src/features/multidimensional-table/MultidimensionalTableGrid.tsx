import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
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
  reorderMultidimensionalFields,
  updateMultidimensionalFieldOptions,
} from "./multidimensionalTableDocument";
import { FieldTypeIcon, MultidimensionalTableFieldConfigPanel } from "./MultidimensionalTableFieldConfigPanel";
import { MultidimensionalTableValueInput, updateMultidimensionalRecordValue } from "./MultidimensionalTableValueInput";

interface MultidimensionalTableGridProps {
  document: MultidimensionalTableDocument;
  records?: MultidimensionalTableRecord[];
  onChange: (document: MultidimensionalTableDocument) => void;
  onAddRecord: (values?: Record<string, MultidimensionalTableFieldValue>) => void;
  onDeleteRecord: (recordId: string) => void;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
}

export function MultidimensionalTableGrid({
  document,
  records = document.records,
  onChange,
  onAddRecord,
  onDeleteRecord,
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
  const fieldIds = document.fields.map((field) => field.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const addField = () => {
    const field = createField(document.fields);
    onChange(appendMultidimensionalField(document, field));
  };
  const reorderField = (event: DragEndEvent) => {
    const activeFieldId = String(event.active.id);
    const overFieldId = event.over?.id ? String(event.over.id) : "";
    if (!overFieldId || activeFieldId === overFieldId) {
      return;
    }

    onChange(reorderMultidimensionalFields(document, activeFieldId, overFieldId));
  };

  return (
    <div className="multitable-grid" data-testid="multitable-grid">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderField}>
        <SortableContext items={fieldIds} strategy={horizontalListSortingStrategy}>
          <div className="multitable-grid__header" style={headerGridStyle}>
            {document.fields.map((field) => (
              <SortableFieldHeader
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
        </SortableContext>
      </DndContext>
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
            <div className="multitable-grid__cell multitable-grid__cell--row-actions">
              <button type="button" aria-label={`删除记录 ${recordTitle(record, document.fields)}`} onClick={() => onDeleteRecord(record.id)}>
                <Trash2 size={15} />
              </button>
            </div>
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

function recordTitle(record: MultidimensionalTableRecord, fields: MultidimensionalTableField[]): string {
  const primaryField = fields.find((field) => field.primary) ?? fields[0];
  const value = primaryField ? record.values[primaryField.id] : "";
  return typeof value === "string" && value.trim() ? value.trim() : "未命名记录";
}

function SortableFieldHeader({
  document,
  field,
  onChange,
}: {
  document: MultidimensionalTableDocument;
  field: MultidimensionalTableField;
  onChange: (document: MultidimensionalTableDocument) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } satisfies CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`multitable-grid__sortable-field${isDragging ? " is-dragging" : ""}`}
    >
      <FieldHeader
        document={document}
        field={field}
        dragHandleProps={{
          attributes,
          listeners,
        }}
        onChange={onChange}
      />
    </div>
  );
}

function FieldHeader({
  document,
  field,
  dragHandleProps,
  onChange,
}: {
  document: MultidimensionalTableDocument;
  field: MultidimensionalTableField;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners | undefined;
  };
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
        className="multitable-grid-field-drag-handle"
        aria-label={`拖拽排序字段 ${field.name}`}
        {...(dragHandleProps?.attributes ?? {})}
        {...(dragHandleProps?.listeners ?? {})}
      >
        <GripVertical size={14} />
      </button>
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
