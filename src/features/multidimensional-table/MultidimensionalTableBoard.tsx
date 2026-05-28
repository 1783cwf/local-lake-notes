import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  GripVertical,
  Link as LinkIcon,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { FileDownloadInput, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type {
  MultidimensionalTableDocument,
  MultidimensionalTableField,
  MultidimensionalTableFieldValue,
  MultidimensionalTableOption,
  MultidimensionalTableRecord,
  MultidimensionalTableView,
} from "./multidimensionalTableDocument";
import {
  createSelectOption,
  deleteMultidimensionalField,
  formatTimeFieldValue,
  optionById,
  updateMultidimensionalRecordBody,
} from "./multidimensionalTableDocument";
import { FieldTypeIcon, MultidimensionalTableFieldConfigPanel } from "./MultidimensionalTableFieldConfigPanel";
import { attachmentValues, MultidimensionalTableValueInput, updateMultidimensionalRecordValue } from "./MultidimensionalTableValueInput";
import { deleteFieldOption, renameFieldOption, updateRecordValueWithNewOption } from "./MultidimensionalTableGrid";
import { MultidimensionalTableRichTextEditor } from "./MultidimensionalTableRichTextEditor";

interface MultidimensionalTableBoardProps {
  document: MultidimensionalTableDocument;
  records?: MultidimensionalTableRecord[];
  onChange: (document: MultidimensionalTableDocument) => void;
  onAddRecord: (values?: Record<string, MultidimensionalTableFieldValue>) => string;
  onDeleteRecord: (recordId: string) => void;
  selectedRecordId: string | null;
  onSelectedRecordIdChange: (recordId: string | null) => void;
  onUploadImage?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview?: (resourceRef: string) => Promise<string>;
  resourcePreviewConcurrency?: number;
}

const unassignedColumnId = "__unassigned__";

export function MultidimensionalTableBoard({
  document,
  records = document.records,
  onChange,
  onAddRecord,
  onDeleteRecord,
  selectedRecordId,
  onSelectedRecordIdChange,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  resourcePreviewConcurrency,
}: MultidimensionalTableBoardProps) {
  const boardView = document.views.find((view) => view.id === document.activeViewId && view.type === "board") ??
    document.views.find((view) => view.type === "board");
  const groupField = document.fields.find((field) => field.id === boardView?.groupByFieldId && field.type === "singleSelect") ??
    document.fields.find((field) => field.type === "singleSelect");
  const primaryField = document.fields.find((field) => field.primary) ?? document.fields[0];
  const cardFields = cardFieldsForView(document, boardView, primaryField, groupField);
  const showPrimaryField = cardFields.some((field) => field.id === primaryField?.id);
  const columns = useMemo(() => boardColumns(records, groupField), [records, groupField]);
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const draggingRecord = draggingRecordId ? document.records.find((record) => record.id === draggingRecordId) ?? null : null;
  const selectedRecord = selectedRecordId ? document.records.find((record) => record.id === selectedRecordId) ?? null : null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));
  const addRecordAndOpen = (values: Record<string, MultidimensionalTableFieldValue> = {}) => {
    // 看板筛选可能让新建空记录立即离开当前列；先记住 ID，确保详情面板能直接打开完整记录。
    onSelectedRecordIdChange(onAddRecord(values));
  };

  const onDragStart = (event: DragStartEvent) => {
    setDraggingRecordId(String(event.active.id));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const recordId = String(event.active.id);
    const targetColumnId = String(event.over?.id ?? "");
    setDraggingRecordId(null);

    if (!groupField || !targetColumnId || !columns.some((column) => column.id === targetColumnId)) {
      return;
    }

    const nextValue = targetColumnId === unassignedColumnId ? "" : targetColumnId;
    onChange(updateMultidimensionalRecordValue(document, recordId, groupField.id, nextValue));
  };
  const addColumn = () => {
    if (!groupField) {
      return;
    }
    const option = createSelectOption(`新分组 ${groupField.options?.length ? groupField.options.length + 1 : 1}`);
    onChange({
      ...document,
      fields: document.fields.map((field) => field.id === groupField.id
        ? { ...field, options: [...(field.options ?? []), option] }
        : field),
    });
  };
  if (!groupField || !primaryField) {
    return <div className="multitable-empty">请先添加单选分组字段和标题字段。</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="multitable-board-layout" data-testid="multitable-board">
        <div className="multitable-board">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              primaryField={primaryField}
              cardFields={cardFields}
              groupField={groupField}
              showPrimaryField={showPrimaryField}
              onOpenRecord={onSelectedRecordIdChange}
              onAddRecord={() => addRecordAndOpen({ [groupField.id]: column.id === unassignedColumnId ? "" : column.id })}
            />
          ))}
          <button type="button" className="multitable-board__add-column" onClick={addColumn}>
            <Plus size={16} />
            新建分组
          </button>
        </div>
        {selectedRecord ? (
          <RecordDetailPanel
            document={document}
            record={selectedRecord}
            primaryField={primaryField}
            fields={document.fields}
            onChange={onChange}
            onClose={() => onSelectedRecordIdChange(null)}
            onAddNext={() => addRecordAndOpen({ [groupField.id]: selectedRecord.values[groupField.id] ?? "" })}
            onDelete={() => {
              onDeleteRecord(selectedRecord.id);
              onSelectedRecordIdChange(null);
            }}
            onUploadImage={onUploadImage}
            onUploadFile={onUploadFile}
            onDownloadFile={onDownloadFile}
            onPrepareResourcePreview={onPrepareResourcePreview}
            resourcePreviewConcurrency={resourcePreviewConcurrency}
          />
        ) : null}
      </div>
      <DragOverlay>
        {draggingRecord ? (
          <RecordCard
            record={draggingRecord}
            primaryField={primaryField}
            cardFields={cardFields}
            groupField={groupField}
            showPrimaryField={showPrimaryField}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  column,
  primaryField,
  cardFields,
  groupField,
  showPrimaryField,
  onOpenRecord,
  onAddRecord,
}: {
  column: BoardColumnData;
  primaryField: MultidimensionalTableField;
  cardFields: MultidimensionalTableField[];
  groupField: MultidimensionalTableField;
  showPrimaryField: boolean;
  onOpenRecord: (recordId: string) => void;
  onAddRecord: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={`multitable-board-column${isOver ? " is-over" : ""}`}>
      <header className="multitable-board-column__header">
        <button type="button" aria-label={`在${column.title}新增记录`} onClick={onAddRecord}>
          <Plus size={15} />
        </button>
        <button type="button" aria-label={`${column.title}列更多操作`}>
          <MoreHorizontal size={16} />
        </button>
        <span className={`multitable-option-chip multitable-option-chip--${column.option?.color ?? "gray"}`}>
          {column.title}
        </span>
        <span className="multitable-board-column__count">{column.records.length}</span>
      </header>
      <div className="multitable-board-column__cards">
        {column.records.map((record) => (
          <DraggableRecordCard
            key={record.id}
            record={record}
            primaryField={primaryField}
            cardFields={cardFields}
            groupField={groupField}
            showPrimaryField={showPrimaryField}
            onOpenRecord={onOpenRecord}
          />
        ))}
      </div>
      <button type="button" className="multitable-board-column__add-record" onClick={onAddRecord}>
        <Plus size={14} />
        新增记录
      </button>
    </section>
  );
}

function DraggableRecordCard({
  record,
  primaryField,
  cardFields,
  groupField,
  showPrimaryField,
  onOpenRecord,
}: {
  record: MultidimensionalTableRecord;
  primaryField: MultidimensionalTableField;
  cardFields: MultidimensionalTableField[];
  groupField: MultidimensionalTableField;
  showPrimaryField: boolean;
  onOpenRecord: (recordId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: record.id });
  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "is-dragging" : ""}>
      <RecordCard
        record={record}
        primaryField={primaryField}
        cardFields={cardFields}
        groupField={groupField}
        showPrimaryField={showPrimaryField}
        onOpenRecord={onOpenRecord}
        dragActivatorProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function RecordCard({
  record,
  primaryField,
  cardFields,
  groupField,
  showPrimaryField,
  onOpenRecord,
  dragActivatorProps,
  dragging = false,
}: {
  record: MultidimensionalTableRecord;
  primaryField: MultidimensionalTableField;
  cardFields: MultidimensionalTableField[];
  groupField?: MultidimensionalTableField;
  showPrimaryField: boolean;
  onOpenRecord?: (recordId: string) => void;
  dragActivatorProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const openRecord = () => onOpenRecord?.(record.id);
  const openRecordByKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRecord();
    }
  };

  return (
    <article
      className={`multitable-card${dragging ? " multitable-card--dragging" : ""}`}
      role={onOpenRecord ? "button" : undefined}
      tabIndex={onOpenRecord ? 0 : undefined}
      onClick={openRecord}
      onKeyDown={openRecordByKeyboard}
      {...dragActivatorProps}
    >
      {showPrimaryField ? (
        <div className="multitable-card__title-row">
          <button
            type="button"
            className="multitable-card__drag"
            aria-label="拖动记录"
            onClick={(event) => event.stopPropagation()}
          >
            <GripVertical size={13} />
          </button>
          <h3>{textValue(record.values[primaryField.id]) || "未命名记录"}</h3>
        </div>
      ) : null}
      <div className="multitable-card__fields">
        {cardFields.map((field) => (
          <CardField
            key={field.id}
            record={record}
            field={field}
            groupField={groupField}
          />
        ))}
      </div>
    </article>
  );
}

function CardField({
  record,
  field,
  groupField,
}: {
  record: MultidimensionalTableRecord;
  field: MultidimensionalTableField;
  groupField?: MultidimensionalTableField;
}) {
  return (
    <div className="multitable-card-field">
      <span className="multitable-card-field__label">
        <FieldTypeIcon type={field.type} size={14} />
        {field.name}
      </span>
      {renderFieldValue(field, groupField, record.values[field.id])}
    </div>
  );
}

function RecordDetailPanel({
  document,
  record,
  primaryField,
  fields,
  onChange,
  onClose,
  onAddNext,
  onDelete,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  resourcePreviewConcurrency,
}: {
  document: MultidimensionalTableDocument;
  record: MultidimensionalTableRecord;
  primaryField: MultidimensionalTableField;
  fields: MultidimensionalTableField[];
  onChange: (document: MultidimensionalTableDocument) => void;
  onClose: () => void;
  onAddNext: () => void;
  onDelete: () => void;
  onUploadImage?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview?: (resourceRef: string) => Promise<string>;
  resourcePreviewConcurrency?: number;
}) {
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [bodyFullscreenOpen, setBodyFullscreenOpen] = useState(false);
  const editableFields = fields.filter((field) => field.id !== primaryField.id);
  const editingField = fields.find((field) => field.id === editingFieldId);
  const recordTitle = textValue(record.values[primaryField.id]) || "未命名记录";
  const updateBody = (body: string) => onChange(updateMultidimensionalRecordBody(document, record.id, body));

  useEffect(() => {
    if (!bodyFullscreenOpen) {
      return;
    }
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => {
      window.document.body.style.overflow = previousOverflow;
    };
  }, [bodyFullscreenOpen]);

  return (
    <div className="multitable-record-detail-backdrop" role="presentation" onPointerDown={onClose}>
      <aside
        className="multitable-record-detail"
        aria-label="记录详情"
        onPointerDown={(event) => event.stopPropagation()}
      >
      <header className="multitable-record-detail__topbar">
        <button type="button" aria-label="复制记录链接">
          <LinkIcon size={18} />
        </button>
        <span />
        <button type="button" aria-label="上一条记录">
          <ChevronRight size={18} className="multitable-record-detail__icon-up" />
        </button>
        <button type="button" aria-label="下一条记录">
          <ChevronRight size={18} />
        </button>
        <span />
        <button type="button" aria-label="更多记录操作">
          <MoreHorizontal size={18} />
        </button>
        <button type="button" aria-label="关闭记录详情" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="multitable-record-detail__body">
        <input
          className="multitable-record-detail__title"
          value={textValue(record.values[primaryField.id])}
          aria-label="看板标题"
          placeholder="未命名记录"
          onChange={(event) => onChange(updateMultidimensionalRecordValue(document, record.id, primaryField.id, event.target.value))}
        />
        <div className="multitable-record-detail__fields">
          {editableFields.map((field) => (
            <div key={field.id} className="multitable-record-detail__field">
              <div className="multitable-record-detail__field-label">
                <span>
                  <FieldTypeIcon type={field.type} size={17} />
                  {field.name}
                </span>
                <span className="multitable-record-detail__field-actions">
                  <button
                    type="button"
                    aria-label={`编辑字段 ${field.name}`}
                    onClick={() => {
                      setFieldPanelOpen(false);
                      setEditingFieldId(field.id);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除字段 ${field.name}`}
                    onClick={() => onChange(deleteMultidimensionalField(document, field.id))}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>
              <MultidimensionalTableValueInput
                field={field}
                value={record.values[field.id]}
                ariaLabel={`记录${field.name}`}
                onUploadFile={onUploadFile}
                onDownloadFile={onDownloadFile}
                onChange={(value) => onChange(updateMultidimensionalRecordValue(document, record.id, field.id, value))}
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
        </div>
        <button
          type="button"
          className="multitable-record-detail__add-field"
          onClick={() => {
            setEditingFieldId(null);
            setFieldPanelOpen((current) => !current);
          }}
        >
          <Plus size={16} />
          新增字段
        </button>
        {fieldPanelOpen ? (
          <MultidimensionalTableFieldConfigPanel
            document={document}
            onChange={onChange}
            onDone={() => setFieldPanelOpen(false)}
          />
        ) : null}
        {editingField ? (
          <MultidimensionalTableFieldConfigPanel
            document={document}
            field={editingField}
            onChange={onChange}
            onDone={() => setEditingFieldId(null)}
          />
        ) : null}
        <section className="multitable-record-body">
          <div className="multitable-record-body__header">
            <div className="multitable-record-body__label">正文内容</div>
            <button type="button" aria-label="全屏编辑正文" onClick={() => setBodyFullscreenOpen(true)}>
              <Maximize2 size={15} />
              全屏编辑
            </button>
          </div>
          {bodyFullscreenOpen ? (
            <div className="multitable-record-body__fullscreen-placeholder">正在全屏编辑正文内容</div>
          ) : (
            <MultidimensionalTableRichTextEditor
              value={record.body ?? ""}
              onChange={updateBody}
              onUploadImage={onUploadImage}
              onUploadFile={onUploadFile}
              onDownloadFile={onDownloadFile}
              onPrepareResourcePreview={onPrepareResourcePreview}
              resourcePreviewConcurrency={resourcePreviewConcurrency}
            />
          )}
        </section>
      </div>
      {bodyFullscreenOpen ? createPortal(
        <RecordBodyFullscreenEditor
          title={recordTitle}
          value={record.body ?? ""}
          onChange={updateBody}
          onClose={() => setBodyFullscreenOpen(false)}
          onUploadImage={onUploadImage}
          onUploadFile={onUploadFile}
          onDownloadFile={onDownloadFile}
          onPrepareResourcePreview={onPrepareResourcePreview}
          resourcePreviewConcurrency={resourcePreviewConcurrency}
        />,
        window.document.body,
      ) : null}
      <footer className="multitable-record-detail__footer">
        <button type="button" className="is-danger" onClick={onDelete}>删除记录</button>
        <button type="button" onClick={onAddNext}>添加下一个</button>
        <button type="button" className="multitable-record-detail__finish" onClick={onClose}>完成</button>
      </footer>
      </aside>
    </div>
  );
}

function RecordBodyFullscreenEditor({
  title,
  value,
  onChange,
  onClose,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  resourcePreviewConcurrency,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onUploadImage?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview?: (resourceRef: string) => Promise<string>;
  resourcePreviewConcurrency?: number;
}) {
  return (
    <div className="multitable-record-body-fullscreen" role="dialog" aria-modal="true" aria-label="正文全屏编辑">
      <section className="multitable-record-body-fullscreen__panel">
        <header className="multitable-record-body-fullscreen__header">
          <div>
            <span>正文内容</span>
            <strong>{title}</strong>
          </div>
          <button type="button" aria-label="关闭全屏正文编辑" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="multitable-record-body-fullscreen__editor">
          <MultidimensionalTableRichTextEditor
            value={value}
            ariaLabel="全屏记录正文内容"
            tocEnabled
            onChange={onChange}
            onUploadImage={onUploadImage}
            onUploadFile={onUploadFile}
            onDownloadFile={onDownloadFile}
            onPrepareResourcePreview={onPrepareResourcePreview}
            resourcePreviewConcurrency={resourcePreviewConcurrency}
          />
        </div>
      </section>
    </div>
  );
}

interface BoardColumnData {
  id: string;
  title: string;
  option: MultidimensionalTableOption | null;
  records: MultidimensionalTableRecord[];
}

function boardColumns(
  records: MultidimensionalTableRecord[],
  groupField: MultidimensionalTableField | undefined,
): BoardColumnData[] {
  const options = groupField?.options ?? [];
  const columns = options.map((option) => ({
    id: option.id,
    title: option.label,
    option,
    records: records.filter((record) => record.values[groupField!.id] === option.id),
  }));
  const unassigned = records.filter((record) => !groupField || !record.values[groupField.id]);
  return unassigned.length > 0
    ? [...columns, { id: unassignedColumnId, title: "未分组", option: null, records: unassigned }]
    : columns;
}

function cardFieldsForView(
  document: MultidimensionalTableDocument,
  boardView: MultidimensionalTableView | undefined,
  _primaryField: MultidimensionalTableField | undefined,
  _groupField: MultidimensionalTableField | undefined,
): MultidimensionalTableField[] {
  const preferredFields = (boardView?.cardFieldIds ?? [])
    .map((fieldId) => document.fields.find((field) => field.id === fieldId))
    .filter(Boolean) as MultidimensionalTableField[];

  const fallbackFields = document.fields;
  return boardView?.cardFieldConfigExplicit && Array.isArray(boardView.cardFieldIds) ? preferredFields : fallbackFields;
}

function renderFieldValue(
  field: MultidimensionalTableField,
  groupField: MultidimensionalTableField | undefined,
  value: MultidimensionalTableFieldValue,
): ReactNode {
  if (field.type === "multiSelect") {
    const values = Array.isArray(value) ? value : [];
    const chips = values
      .map((optionId) => field.options?.find((option) => option.id === optionId))
      .filter(Boolean) as MultidimensionalTableOption[];

    return chips.length > 0 ? (
      <span className="multitable-card-field__chips">
        {chips.map((option) => (
          <span key={option.id} className={`multitable-option-chip multitable-option-chip--${option.color}`}>
            {option.label}
          </span>
        ))}
      </span>
    ) : <p>-</p>;
  }

  if (field.type === "singleSelect") {
    const option = field.id === groupField?.id
      ? optionById(groupField, textValue(value))
      : optionById(field, textValue(value));
    return option ? (
      <span className={`multitable-option-chip multitable-option-chip--${option.color}`}>
        {option.label}
      </span>
    ) : <p>-</p>;
  }

  if (field.type === "progress") {
    const progressValue = textValue(value);
    return (
      <span className="multitable-card-field__progress">
        <span><i style={{ width: `${Number(progressValue) || 0}%` }} /></span>
        <b>{progressValue ? `${progressValue}%` : "0%"}</b>
      </span>
    );
  }

  if (field.type === "time") {
    return <p>{formatTimeFieldValue(value, field) || "-"}</p>;
  }

  if (field.type === "attachment") {
    const attachments = attachmentValues(value);
    return <p>{attachments.length > 0 ? `${attachments.length} 个附件` : "-"}</p>;
  }

  return <p>{textValue(value) || "-"}</p>;
}

function textValue(value: MultidimensionalTableFieldValue): string {
  return typeof value === "string" ? value : "";
}
