import {
  CalendarDays,
  Check,
  CircleDot,
  Gauge,
  Hash,
  Link as LinkIcon,
  ListChecks,
  Paperclip,
  Plus,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  MultidimensionalTableDocument,
  MultidimensionalTableField,
  MultidimensionalTableFieldType,
  MultidimensionalTableOption,
  MultidimensionalTableTimeFormat,
} from "./multidimensionalTableDocument";
import {
  appendMultidimensionalField,
  changeMultidimensionalFieldType,
  createField,
  createSelectOption,
  defaultTimeFormat,
  deleteMultidimensionalField,
  fieldTypeLabel,
  multidimensionalTableFieldTypeOptions,
  multidimensionalTableTimeFormatOptions,
  renameMultidimensionalField,
  updateMultidimensionalFieldOptions,
  updateMultidimensionalFieldTimeFormat,
} from "./multidimensionalTableDocument";

interface MultidimensionalTableFieldConfigPanelProps {
  document: MultidimensionalTableDocument;
  field?: MultidimensionalTableField;
  variant?: "detail" | "popover";
  onChange: (document: MultidimensionalTableDocument) => void;
  onDone: () => void;
}

export function MultidimensionalTableFieldConfigPanel({
  document,
  field,
  variant = "detail",
  onChange,
  onDone,
}: MultidimensionalTableFieldConfigPanelProps) {
  const [draftName, setDraftName] = useState(field?.name ?? "新字段");
  const [draftType, setDraftType] = useState<MultidimensionalTableFieldType>(field?.type ?? "text");
  const [draftOptions, setDraftOptions] = useState<MultidimensionalTableOption[]>(() => optionDraftsForField(field, "text"));
  const [draftTimeFormat, setDraftTimeFormat] = useState<MultidimensionalTableTimeFormat>(field?.timeFormat ?? defaultTimeFormat);
  const selectLike = draftType === "singleSelect" || draftType === "multiSelect";
  const panelMode = field ? "编辑字段配置" : "新增字段配置";

  useEffect(() => {
    setDraftName(field?.name ?? "新字段");
    setDraftType(field?.type ?? "text");
    setDraftOptions(optionDraftsForField(field, field?.type ?? "text"));
    setDraftTimeFormat(field?.timeFormat ?? defaultTimeFormat);
  }, [field]);

  const updateType = (type: MultidimensionalTableFieldType) => {
    setDraftType(type);
    if (type === "singleSelect" || type === "multiSelect") {
      setDraftOptions((options) => options.length ? options : optionDraftsForField(field, type));
    }
    if (type === "time") {
      setDraftTimeFormat(field?.timeFormat ?? defaultTimeFormat);
    }
  };
  const updateOptionLabel = (optionId: string, label: string) => {
    setDraftOptions(draftOptions.map((option) => option.id === optionId ? { ...option, label } : option));
  };
  const removeOption = (optionId: string) => {
    setDraftOptions(draftOptions.filter((option) => option.id !== optionId));
  };
  const confirm = () => {
    const name = draftName.trim();
    if (!field) {
      const newField = {
        ...createField(document.fields, draftType),
        name: name || `新${fieldTypeLabel(draftType)}字段`,
        options: selectLike ? sanitizedOptions(draftOptions) : undefined,
        timeFormat: draftType === "time" ? draftTimeFormat : undefined,
      };
      onChange(appendMultidimensionalField(document, newField));
      onDone();
      return;
    }

    let nextDocument = renameMultidimensionalField(document, field.id, name || field.name);
    if (field.type !== draftType) {
      nextDocument = changeMultidimensionalFieldType(nextDocument, field.id, draftType);
    }
    if (selectLike) {
      nextDocument = updateMultidimensionalFieldOptions(nextDocument, field.id, sanitizedOptions(draftOptions));
    }
    if (draftType === "time") {
      nextDocument = updateMultidimensionalFieldTimeFormat(nextDocument, field.id, draftTimeFormat);
    }
    onChange(nextDocument);
    onDone();
  };
  const deleteField = () => {
    if (!field) {
      return;
    }
    onChange(deleteMultidimensionalField(document, field.id));
    onDone();
  };

  return (
    <section
      className={`multitable-detail-field-panel multitable-detail-field-panel--${variant}`}
      aria-label={panelMode}
    >
      <label>
        <span>数据表列名</span>
        <input
          value={draftName}
          aria-label={field ? `${field.name}字段名称` : "数据表列名"}
          onChange={(event) => setDraftName(event.target.value)}
        />
      </label>
      <div className="multitable-detail-field-panel__type">
        <p>列类型</p>
        <div className="multitable-detail-field-panel__type-grid">
          {multidimensionalTableFieldTypeOptions.map((option) => {
            const selected = option.type === draftType;
            return (
              <button
                key={option.type}
                type="button"
                className={selected ? "is-selected" : ""}
                aria-pressed={selected}
                onClick={() => updateType(option.type)}
              >
                <FieldTypeIcon type={option.type} size={18} />
                <span>{option.label}</span>
                {selected ? <Check size={17} /> : null}
              </button>
            );
          })}
        </div>
      </div>
      {selectLike ? (
        <div className="multitable-detail-field-panel__options">
          <div className="multitable-detail-field-panel__options-title">
            <span>选项设置</span>
            <span>颜色</span>
          </div>
          {draftOptions.map((option, index) => (
            <div key={option.id} className="multitable-detail-field-panel__option-row">
              <span className={`multitable-option-dot multitable-option-dot--${option.color}`} />
              <input
                value={option.label}
                aria-label={`选项 ${index + 1}`}
                onChange={(event) => updateOptionLabel(option.id, event.target.value)}
              />
              <button type="button" aria-label={`删除选项 ${index + 1}`} onClick={() => removeOption(option.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="multitable-detail-field-panel__add-option"
            onClick={() => setDraftOptions([...draftOptions, createSelectOption(`选项 ${draftOptions.length + 1}`)])}
          >
            <Plus size={16} />
            添加一个选项
          </button>
        </div>
      ) : null}
      {draftType === "time" ? (
        <label>
          <span>时间格式</span>
          <select
            value={draftTimeFormat}
            aria-label={field ? `${field.name}时间格式` : "时间格式"}
            onChange={(event) => setDraftTimeFormat(event.target.value as MultidimensionalTableTimeFormat)}
          >
            {multidimensionalTableTimeFormatOptions.map((option) => (
              <option key={option.format} value={option.format}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="multitable-detail-field-panel__actions">
        {field && !field.primary ? (
          <button type="button" className="is-danger" onClick={deleteField}>
            <Trash2 size={15} />
            删除字段
          </button>
        ) : null}
        <span />
        <button type="button" onClick={onDone}>取消</button>
        <button type="button" className="is-primary" onClick={confirm}>确定</button>
      </div>
    </section>
  );
}

export function FieldTypeIcon({
  type,
  size = 16,
}: {
  type: MultidimensionalTableFieldType;
  size?: number;
}) {
  if (type === "singleSelect") {
    return <CircleDot size={size} />;
  }
  if (type === "multiSelect") {
    return <ListChecks size={size} />;
  }
  if (type === "number") {
    return <Hash size={size} />;
  }
  if (type === "progress") {
    return <Gauge size={size} />;
  }
  if (type === "attachment") {
    return <Paperclip size={size} />;
  }
  if (type === "time") {
    return <CalendarDays size={size} />;
  }
  if (type === "url") {
    return <LinkIcon size={size} />;
  }
  return <TextCursorInput size={size} />;
}

function optionDraftsForField(
  field: MultidimensionalTableField | undefined,
  type: MultidimensionalTableFieldType,
): MultidimensionalTableOption[] {
  if (field?.options?.length) {
    return field.options;
  }
  if (type !== "singleSelect" && type !== "multiSelect") {
    return [createSelectOption("选项 1"), createSelectOption("选项 2"), createSelectOption("选项 3")];
  }
  return [createSelectOption("选项 1"), createSelectOption("选项 2")];
}

function sanitizedOptions(options: MultidimensionalTableOption[]): MultidimensionalTableOption[] {
  const nextOptions = options
    .map((option) => ({ ...option, label: option.label.trim() }))
    .filter((option) => option.label);

  // 单选/多选字段至少保留一个选项，避免已有记录进入无可选项的空状态。
  return nextOptions.length ? nextOptions : [createSelectOption("选项 1")];
}
