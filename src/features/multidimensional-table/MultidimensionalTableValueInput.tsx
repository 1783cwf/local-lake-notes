import { CalendarDays, Check, ChevronDown, Download, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { FileDownloadInput, UploadImageInput, UploadImageOutput } from "../../app/appState";
import { resourceReferenceFromUpload } from "../lake-editor/resourceReference";
import { createEditorFileUpload } from "../lake-editor/uploadAdapter";
import type {
  MultidimensionalTableAttachment,
  MultidimensionalTableDocument,
  MultidimensionalTableField,
  MultidimensionalTableFieldValue,
  MultidimensionalTableOption,
} from "./multidimensionalTableDocument";
import { createSelectOption, formatTimeFieldValue, timeFormatPlaceholder } from "./multidimensionalTableDocument";

interface MultidimensionalTableValueInputProps {
  field: MultidimensionalTableField;
  value: MultidimensionalTableFieldValue | undefined;
  onChange: (value: MultidimensionalTableFieldValue) => void;
  onCreateOption?: (option: MultidimensionalTableOption, nextValue: MultidimensionalTableFieldValue) => void;
  onRenameOption?: (optionId: string, label: string) => void;
  onDeleteOption?: (optionId: string) => void;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  ariaLabel?: string;
  compact?: boolean;
}

export function MultidimensionalTableValueInput({
  field,
  value,
  onChange,
  onCreateOption,
  onRenameOption,
  onDeleteOption,
  onUploadFile,
  onDownloadFile,
  ariaLabel = field.name,
  compact = false,
}: MultidimensionalTableValueInputProps) {
  const className = compact ? "multitable-field-input multitable-field-input--compact" : "multitable-field-input";

  if (field.type === "singleSelect") {
    return (
      <SelectValueInput
        field={field}
        value={value}
        ariaLabel={ariaLabel}
        compact={compact}
        onChange={onChange}
        onCreateOption={onCreateOption}
        onRenameOption={onRenameOption}
        onDeleteOption={onDeleteOption}
      >
        单选
      </SelectValueInput>
    );
  }

  if (field.type === "multiSelect") {
    return (
      <SelectValueInput
        field={field}
        value={value}
        ariaLabel={ariaLabel}
        compact={compact}
        onChange={onChange}
        onCreateOption={onCreateOption}
        onRenameOption={onRenameOption}
        onDeleteOption={onDeleteOption}
      >
        多选
      </SelectValueInput>
    );
  }

  if (field.type === "longText") {
    return (
      <textarea
        className={className}
        value={typeof value === "string" ? value : ""}
        aria-label={ariaLabel}
        rows={compact ? 1 : 2}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "progress") {
    const progressValue = normalizeProgressInput(value);
    return (
      <div className="multitable-progress-input">
        <input
          type="range"
          min={0}
          max={100}
          value={progressValue || "0"}
          aria-label={`${ariaLabel}滑块`}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className={className}
          type="number"
          min={0}
          max={100}
          value={typeof value === "string" ? value : ""}
          aria-label={ariaLabel}
          onChange={(event) => onChange(clampProgressText(event.target.value))}
        />
        <span>%</span>
      </div>
    );
  }

  if (field.type === "time") {
    const textValue = typeof value === "string" ? value : "";
    return (
      <div className={`multitable-time-input${compact ? " multitable-time-input--compact" : ""}`}>
        <CalendarDays size={16} />
        <input
          className={className}
          type="text"
          inputMode="numeric"
          value={textValue}
          aria-label={ariaLabel}
          placeholder={timeFormatPlaceholder(field.timeFormat)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onChange(formatTimeFieldValue(event.currentTarget.value, field))}
        />
      </div>
    );
  }

  if (field.type === "attachment") {
    return (
      <AttachmentValueInput
        value={value}
        ariaLabel={ariaLabel}
        compact={compact}
        onChange={onChange}
        onUploadFile={onUploadFile}
        onDownloadFile={onDownloadFile}
      />
    );
  }

  return (
    <input
      className={className}
      type={inputTypeForField(field)}
      value={typeof value === "string" ? value : ""}
      aria-label={ariaLabel}
      placeholder={placeholderForField(field)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function AttachmentValueInput({
  value,
  ariaLabel,
  compact,
  onChange,
  onUploadFile,
  onDownloadFile,
}: {
  value: MultidimensionalTableFieldValue | undefined;
  ariaLabel: string;
  compact: boolean;
  onChange: (value: MultidimensionalTableFieldValue) => void;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachments = attachmentValues(value);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !onUploadFile) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => {
        const output = await createEditorFileUpload(file, onUploadFile);
        const resourceRef = resourceReferenceFromUpload(output) ?? undefined;
        return {
          id: resourceRef ?? output.url,
          name: output.filename || file.name || "附件",
          url: output.url,
          resourceRef,
          size: output.size,
          mimeType: file.type || undefined,
        } satisfies MultidimensionalTableAttachment;
      }));
      onChange([...attachments, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  const removeAttachment = (attachmentId: string) => {
    onChange(attachments.filter((attachment) => attachment.id !== attachmentId));
  };
  const downloadAttachment = async (attachment: MultidimensionalTableAttachment) => {
    if (!onDownloadFile) {
      return;
    }
    await onDownloadFile({
      url: attachment.url,
      filename: attachment.name,
      resourceRef: attachment.resourceRef,
    });
  };

  return (
    <div className={`multitable-attachment-input${compact ? " multitable-attachment-input--compact" : ""}`}>
      <input
        ref={fileInputRef}
        id={inputId}
        className="visually-hidden"
        type="file"
        multiple
        aria-label={`上传${ariaLabel}`}
        onChange={(event) => {
          void uploadFiles(event.currentTarget.files);
        }}
      />
      <div className="multitable-attachment-input__toolbar">
        <button
          type="button"
          className="multitable-attachment-input__upload"
          disabled={busy || !onUploadFile}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? <Loader2 size={14} className="spin-icon" /> : <Upload size={14} />}
          上传附件
        </button>
        {!onUploadFile ? <span>未配置上传</span> : null}
      </div>
      {attachments.length > 0 ? (
        <div className="multitable-attachment-input__list">
          {attachments.map((attachment) => (
            <span key={attachment.id} className="multitable-attachment-chip">
              <Paperclip size={14} />
              <span>{attachment.name}</span>
              <button
                type="button"
                aria-label={`下载附件 ${attachment.name}`}
                disabled={!onDownloadFile}
                onClick={() => {
                  void downloadAttachment(attachment);
                }}
              >
                <Download size={13} />
              </button>
              <button type="button" aria-label={`移除附件 ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="multitable-attachment-input__empty">暂无附件</span>
      )}
      {error ? <p className="multitable-attachment-input__error">{error}</p> : null}
    </div>
  );
}

function SelectValueInput({
  field,
  value,
  ariaLabel,
  compact,
  onChange,
  onCreateOption,
  onRenameOption,
  onDeleteOption,
}: {
  field: MultidimensionalTableField;
  value: MultidimensionalTableFieldValue | undefined;
  ariaLabel: string;
  compact: boolean;
  onChange: (value: MultidimensionalTableFieldValue) => void;
  onCreateOption?: (option: MultidimensionalTableOption, nextValue: MultidimensionalTableFieldValue) => void;
  onRenameOption?: (optionId: string, label: string) => void;
  onDeleteOption?: (optionId: string) => void;
  children: string;
}) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftOptionName, setDraftOptionName] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionLabel, setEditingOptionLabel] = useState("");
  const multi = field.type === "multiSelect";
  const selectedIds = multi
    ? stringArrayValue(value)
    : typeof value === "string" && value ? [value] : [];
  const selectedOptions = selectedIds
    .map((optionId) => field.options?.find((option) => option.id === optionId))
    .filter(Boolean) as MultidimensionalTableOption[];

  useEffect(() => {
    if (!open) {
      setEditingOptionId(null);
      setEditingOptionLabel("");
      return;
    }

    const closeOnOutsidePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointerDown);
  }, [open]);

  const toggleOption = (optionId: string) => {
    if (!multi) {
      onChange(optionId);
      setOpen(false);
      return;
    }

    onChange(selectedIds.includes(optionId)
      ? selectedIds.filter((selectedId) => selectedId !== optionId)
      : [...selectedIds, optionId]);
  };
  const clearValue = () => {
    onChange(multi ? [] : "");
  };
  const createOption = () => {
    const label = draftOptionName.trim();
    if (!label || !onCreateOption) {
      return;
    }

    const option = createSelectOption(label);
    const nextValue = multi ? [...selectedIds, option.id] : option.id;
    onCreateOption(option, nextValue);
    setDraftOptionName("");
    if (!multi) {
      setOpen(false);
    }
  };
  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createOption();
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };
  const startRenameOption = (option: MultidimensionalTableOption) => {
    setEditingOptionId(option.id);
    setEditingOptionLabel(option.label);
  };
  const finishRenameOption = () => {
    if (!editingOptionId) {
      return;
    }

    const label = editingOptionLabel.trim();
    if (label) {
      onRenameOption?.(editingOptionId, label);
    }
    setEditingOptionId(null);
    setEditingOptionLabel("");
  };
  const cancelRenameOption = () => {
    setEditingOptionId(null);
    setEditingOptionLabel("");
  };
  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finishRenameOption();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRenameOption();
    }
  };
  const onOptionKeyDown = (event: KeyboardEvent<HTMLDivElement>, optionId: string) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOption(optionId);
    }
  };

  return (
    <div ref={rootRef} className={`multitable-select-input${compact ? " multitable-select-input--compact" : ""}`}>
      <button
        type="button"
        className="multitable-select-input__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multitable-select-input__value">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((option) => (
              <span key={option.id} className={`multitable-option-chip multitable-option-chip--${option.color}`}>
                {option.label}
              </span>
            ))
          ) : (
            <span className="multitable-select-input__placeholder">未选择</span>
          )}
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="multitable-select-input__popover" role="listbox" aria-label={`${ariaLabel}选项`}>
          <div className="multitable-select-input__options">
            {(field.options ?? []).map((option) => {
              const selected = selectedIds.includes(option.id);
              const editing = editingOptionId === option.id;
              return (
                <div
                  key={option.id}
                  role="option"
                  aria-selected={selected}
                  tabIndex={0}
                  className={`multitable-select-input__option-row${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}`}
                  onClick={() => toggleOption(option.id)}
                  onKeyDown={(event) => onOptionKeyDown(event, option.id)}
                >
                  {editing ? (
                    <input
                      className="multitable-select-input__option-edit"
                      type="text"
                      value={editingOptionLabel}
                      aria-label={`${ariaLabel}编辑选项 ${option.label}`}
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setEditingOptionLabel(event.target.value)}
                      onBlur={finishRenameOption}
                      onKeyDown={onRenameKeyDown}
                    />
                  ) : (
                    <>
                      <span className="multitable-select-input__option-main">
                        <span className={`multitable-option-dot multitable-option-dot--${option.color}`} />
                        <span>{option.label}</span>
                        {selected ? <Check size={14} /> : null}
                      </span>
                      <span className="multitable-select-input__option-actions">
                        {onRenameOption ? (
                          <button
                            type="button"
                            className="multitable-select-input__option-action"
                            aria-label={`编辑选项 ${option.label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              startRenameOption(option);
                            }}
                          >
                            <Pencil size={13} />
                          </button>
                        ) : null}
                        {onDeleteOption ? (
                          <button
                            type="button"
                            className="multitable-select-input__option-action multitable-select-input__option-action--danger"
                            aria-label={`删除选项 ${option.label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              // 删除选项统一交给文档层清理，避免当前记录和其他记录出现残留 optionId。
                              onDeleteOption(option.id);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : null}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="multitable-select-input__create">
            <input
              id={inputId}
              type="text"
              value={draftOptionName}
              placeholder="新增选项"
              aria-label={`${ariaLabel}新增选项`}
              onChange={(event) => setDraftOptionName(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <button type="button" aria-label={`${ariaLabel}确认新增选项`} onClick={createOption} disabled={!draftOptionName.trim()}>
              <Plus size={14} />
            </button>
          </div>
          {selectedOptions.length > 0 ? (
            <button type="button" className="multitable-select-input__clear" onClick={clearValue}>
              <X size={13} />
              清空
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function updateMultidimensionalRecordValue(
  document: MultidimensionalTableDocument,
  recordId: string,
  fieldId: string,
  value: MultidimensionalTableFieldValue,
): MultidimensionalTableDocument {
  const updatedAt = new Date().toISOString();
  return {
    ...document,
    records: document.records.map((record) => record.id === recordId
      ? {
        ...record,
        values: { ...record.values, [fieldId]: value },
        updatedAt,
      }
      : record),
  };
}

function inputTypeForField(field: MultidimensionalTableField): string {
  if (field.type === "number") {
    return "number";
  }
  if (field.type === "url") {
    return "url";
  }
  return "text";
}

function placeholderForField(field: MultidimensionalTableField): string | undefined {
  if (field.type === "time") {
    return timeFormatPlaceholder(field.timeFormat);
  }
  if (field.type === "attachment") {
    return "附件名称或路径";
  }
  if (field.type === "url") {
    return "https://";
  }
  return undefined;
}

function normalizeProgressInput(value: MultidimensionalTableFieldValue | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return clampProgressText(value);
}

export function attachmentValues(value: MultidimensionalTableFieldValue | undefined): MultidimensionalTableAttachment[] {
  if (Array.isArray(value) && value.every(isAttachmentValue)) {
    return value;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === "-") {
      return [];
    }
    return [{ id: text, name: text.split(/[\\/]/).filter(Boolean).pop() ?? text, url: text }];
  }

  return [];
}

function stringArrayValue(value: MultidimensionalTableFieldValue | undefined): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function isAttachmentValue(value: unknown): value is MultidimensionalTableAttachment {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
    typeof (value as MultidimensionalTableAttachment).id === "string" &&
    typeof (value as MultidimensionalTableAttachment).name === "string" &&
    typeof (value as MultidimensionalTableAttachment).url === "string";
}

function clampProgressText(value: string): string {
  if (!value.trim()) {
    return "";
  }
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return "";
  }
  return String(Math.min(100, Math.max(0, Math.round(numericValue))));
}
