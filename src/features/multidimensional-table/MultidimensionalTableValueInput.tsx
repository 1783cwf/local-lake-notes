import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from "react";

import type { FileDownloadInput, UploadImageInput, UploadImageOutput } from "../../app/appState";
import { resourceReferenceFromUpload } from "../lake-editor/resourceReference";
import { createEditorFileUpload } from "../lake-editor/uploadAdapter";
import type {
  MultidimensionalTableAttachment,
  MultidimensionalTableDocument,
  MultidimensionalTableField,
  MultidimensionalTableFieldValue,
  MultidimensionalTableOption,
  MultidimensionalTableTimeFormat,
} from "./multidimensionalTableDocument";
import { createSelectOption, defaultTimeFormat, formatTimeFieldValue, timeFormatPlaceholder } from "./multidimensionalTableDocument";

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
  longTextHeight?: number;
  onLongTextHeightChange?: (height: number) => void;
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
  longTextHeight,
  onLongTextHeightChange,
}: MultidimensionalTableValueInputProps) {
  const className = compact ? "multitable-field-input multitable-field-input--compact" : "multitable-field-input";
  const longTextRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeInteractionRef = useRef(false);
  const pendingHeightRef = useRef<number | null>(null);
  useLongTextResizePersistence({
    enabled: field.type === "longText" && !compact,
    textareaRef: longTextRef,
    resizeInteractionRef,
    pendingHeightRef,
    savedHeight: longTextHeight,
    onHeightChange: onLongTextHeightChange,
  });

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
        ref={longTextRef}
        className={className}
        value={typeof value === "string" ? value : ""}
        aria-label={ariaLabel}
        rows={compact ? 1 : 2}
        style={longTextHeight && !compact ? { height: `${longTextHeight}px` } as CSSProperties : undefined}
        onPointerDown={() => {
          resizeInteractionRef.current = true;
        }}
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
    return (
      <TimeValueInput
        field={field}
        value={value}
        ariaLabel={ariaLabel}
        className={className}
        compact={compact}
        onChange={onChange}
      />
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

function useLongTextResizePersistence({
  enabled,
  textareaRef,
  resizeInteractionRef,
  pendingHeightRef,
  savedHeight,
  onHeightChange,
}: {
  enabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  resizeInteractionRef: MutableRefObject<boolean>;
  pendingHeightRef: MutableRefObject<number | null>;
  savedHeight: number | undefined;
  onHeightChange: ((height: number) => void) | undefined;
}) {
  useEffect(() => {
    if (!enabled || !onHeightChange || !textareaRef.current || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    let timer: number | undefined;
    const textarea = textareaRef.current;
    const observer = new ResizeObserver(() => {
      const nextHeight = normalizeLongTextHeight(textarea.offsetHeight);
      if (!resizeInteractionRef.current || nextHeight === savedHeight || nextHeight === pendingHeightRef.current) {
        return;
      }
      pendingHeightRef.current = nextHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        onHeightChange(nextHeight);
      }, 220);
    });
    observer.observe(textarea);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [enabled, onHeightChange, pendingHeightRef, resizeInteractionRef, savedHeight, textareaRef]);
}

function normalizeLongTextHeight(value: number): number {
  return Math.min(720, Math.max(64, Math.round(value)));
}

type TimePickerMode = "date" | "datetime" | "time";

interface TimePickerParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface TimePickerCalendarCell extends TimePickerParts {
  currentMonth: boolean;
  today: boolean;
}

function TimeValueInput({
  field,
  value,
  ariaLabel,
  className,
  compact,
  onChange,
}: {
  field: MultidimensionalTableField;
  value: MultidimensionalTableFieldValue | undefined;
  ariaLabel: string;
  className: string;
  compact: boolean;
  onChange: (value: MultidimensionalTableFieldValue) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textValue = typeof value === "string" ? value : "";
  const format = field.timeFormat ?? defaultTimeFormat;
  const mode = timePickerMode(format);
  const [open, setOpen] = useState(false);
  const [draftParts, setDraftParts] = useState<TimePickerParts>(() => parseTimePickerValue(textValue, format) ?? nowTimePickerParts());
  const [visibleMonth, setVisibleMonth] = useState(() => monthCursorFromParts(draftParts));
  const showDate = mode !== "time";
  const showTime = mode !== "date";
  const calendarCells = showDate ? buildCalendarCells(visibleMonth) : [];

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextParts = parseTimePickerValue(textValue, format) ?? nowTimePickerParts();
    setDraftParts(nextParts);
    setVisibleMonth(monthCursorFromParts(nextParts));
  }, [format, open, textValue]);

  useEffect(() => {
    if (!open) {
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

  const normalizeInputValue = () => {
    onChange(formatTimeFieldValue(inputRef.current?.value ?? textValue, field));
  };
  const setDraftDate = (cell: TimePickerCalendarCell) => {
    setDraftParts((current) => ({
      ...current,
      year: cell.year,
      month: cell.month,
      day: cell.day,
    }));
    setVisibleMonth({ year: cell.year, month: cell.month });
  };
  const setNow = () => {
    const now = nowTimePickerParts();
    setDraftParts(now);
    setVisibleMonth(monthCursorFromParts(now));
  };
  const commitDraft = () => {
    onChange(formatTimePickerParts(draftParts, format));
    setOpen(false);
  };
  const clearValue = () => {
    onChange("");
    setOpen(false);
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onChange(formatTimeFieldValue(event.currentTarget.value, field));
      setOpen(false);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`multitable-time-input multitable-time-input--${mode}${compact ? " multitable-time-input--compact" : ""}`}
    >
      <button
        type="button"
        className="multitable-time-input__icon"
        aria-label={`打开${ariaLabel}选择器`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {mode === "time" ? <Clock size={16} /> : <CalendarDays size={16} />}
      </button>
      <input
        ref={inputRef}
        className={className}
        type="text"
        inputMode="numeric"
        value={textValue}
        aria-label={ariaLabel}
        placeholder={timeFormatPlaceholder(format)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onBlur={normalizeInputValue}
        onKeyDown={onInputKeyDown}
      />
      {textValue ? (
        <button type="button" className="multitable-time-input__clear" aria-label={`清空${ariaLabel}`} onClick={clearValue}>
          <X size={14} />
        </button>
      ) : null}
      {open ? (
        <div
          className={`multitable-time-picker multitable-time-picker--${mode}`}
          role="dialog"
          aria-label={`${ariaLabel}选择器`}
        >
          {showDate ? (
            <div className="multitable-time-picker__calendar">
              <div className="multitable-time-picker__monthbar">
                <button type="button" aria-label="上一年" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -12))}>
                  <ChevronsLeft size={16} />
                </button>
                <button type="button" aria-label="上个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>
                  <ChevronLeft size={16} />
                </button>
                <strong>{visibleMonth.year}年 {visibleMonth.month}月</strong>
                <button type="button" aria-label="下个月" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>
                  <ChevronRight size={16} />
                </button>
                <button type="button" aria-label="下一年" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 12))}>
                  <ChevronsRight size={16} />
                </button>
              </div>
              <div className="multitable-time-picker__weekdays" aria-hidden="true">
                {["一", "二", "三", "四", "五", "六", "日"].map((weekday) => <span key={weekday}>{weekday}</span>)}
              </div>
              <div className="multitable-time-picker__days">
                {calendarCells.map((cell) => {
                  const selected = sameDateParts(cell, draftParts);
                  return (
                    <button
                      key={`${cell.year}-${cell.month}-${cell.day}`}
                      type="button"
                      className={[
                        "multitable-time-picker__day",
                        cell.currentMonth ? "" : "is-muted",
                        cell.today ? "is-today" : "",
                        selected ? "is-selected" : "",
                      ].filter(Boolean).join(" ")}
                      aria-label={`选择日期 ${cell.year}-${pad2(cell.month)}-${pad2(cell.day)}`}
                      aria-pressed={selected}
                      onClick={() => setDraftDate(cell)}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {showTime ? (
            <div className="multitable-time-picker__time" aria-label="时间">
              <strong>{pad2(draftParts.hour)}:{pad2(draftParts.minute)}</strong>
              <div className="multitable-time-picker__time-columns">
                <TimePickerColumn
                  label="小时"
                  values={Array.from({ length: 24 }, (_, index) => index)}
                  selectedValue={draftParts.hour}
                  onSelect={(hour) => setDraftParts((current) => ({ ...current, hour }))}
                />
                <TimePickerColumn
                  label="分钟"
                  values={Array.from({ length: 60 }, (_, index) => index)}
                  selectedValue={draftParts.minute}
                  onSelect={(minute) => setDraftParts((current) => ({ ...current, minute }))}
                />
              </div>
            </div>
          ) : null}
          <div className="multitable-time-picker__footer">
            <button type="button" className="multitable-time-picker__now" onClick={setNow}>
              {mode === "date" ? "今天" : "此刻"}
            </button>
            <button type="button" className="multitable-time-picker__confirm" onClick={commitDraft}>
              确定
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimePickerColumn({
  label,
  values,
  selectedValue,
  onSelect,
}: {
  label: string;
  values: number[];
  selectedValue: number;
  onSelect: (value: number) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "center" });
  }, [selectedValue]);

  return (
    <div className="multitable-time-picker__time-column" aria-label={label}>
      {values.map((value) => {
        const selected = value === selectedValue;
        return (
          <button
            key={value}
            ref={selected ? selectedRef : undefined}
            type="button"
            className={selected ? "is-selected" : ""}
            aria-label={`选择${label} ${value}`}
            aria-pressed={selected}
            onClick={() => onSelect(value)}
          >
            {pad2(value)}
          </button>
        );
      })}
    </div>
  );
}

function timePickerMode(format: MultidimensionalTableTimeFormat): TimePickerMode {
  if (format === "hh:mm") {
    return "time";
  }
  return format.includes("hh:mm") ? "datetime" : "date";
}

function parseTimePickerValue(value: string, format: MultidimensionalTableTimeFormat): TimePickerParts | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const timeOnlyMatch = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (timeOnlyMatch) {
    const now = nowTimePickerParts();
    const hour = Number(timeOnlyMatch[1]);
    const minute = Number(timeOnlyMatch[2]);
    return validTimePickerParts(now.year, now.month, now.day, hour, minute)
      ? { ...now, hour, minute }
      : null;
  }

  const match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})(?:日)?(?:[T\s]+(\d{1,2}):(\d{1,2}))?/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;

  return validTimePickerParts(year, month, day, hour, minute)
    ? { year, month, day, hour, minute }
    : null;
}

function formatTimePickerParts(parts: TimePickerParts, format: MultidimensionalTableTimeFormat): string {
  if (format === "hh:mm") {
    return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  if (format === "yyyy-mm-dd") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
  if (format === "yyyy/mm/dd") {
    return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}`;
  }
  if (format === "yyyy-mm-dd hh:mm") {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  if (format === "yyyy年m月d日") {
    return `${parts.year}年${parts.month}月${parts.day}日`;
  }
  if (format === "yyyy年m月d日 hh:mm") {
    return `${parts.year}年${parts.month}月${parts.day}日 ${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function nowTimePickerParts(): TimePickerParts {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

function monthCursorFromParts(parts: Pick<TimePickerParts, "year" | "month">): { year: number; month: number } {
  return { year: parts.year, month: parts.month };
}

function shiftMonth(cursor: { year: number; month: number }, offset: number): { year: number; month: number } {
  const next = new Date(cursor.year, cursor.month - 1 + offset, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

function buildCalendarCells(cursor: { year: number; month: number }): TimePickerCalendarCell[] {
  const firstDay = new Date(cursor.year, cursor.month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const today = nowTimePickerParts();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.year, cursor.month - 1, 1 - startOffset + index);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: 0,
      minute: 0,
      currentMonth: date.getMonth() === cursor.month - 1,
      today: date.getFullYear() === today.year && date.getMonth() + 1 === today.month && date.getDate() === today.day,
    };
  });
}

function sameDateParts(left: Pick<TimePickerParts, "year" | "month" | "day">, right: Pick<TimePickerParts, "year" | "month" | "day">): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function validTimePickerParts(year: number, month: number, day: number, hour: number, minute: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
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

export function updateMultidimensionalRecordFieldHeight(
  document: MultidimensionalTableDocument,
  recordId: string,
  fieldId: string,
  height: number,
): MultidimensionalTableDocument {
  const field = document.fields.find((currentField) => currentField.id === fieldId);
  if (field?.type !== "longText") {
    return document;
  }

  const updatedAt = new Date().toISOString();
  const nextHeight = normalizeLongTextHeight(height);
  return {
    ...document,
    records: document.records.map((record) => record.id === recordId
      ? {
        ...record,
        fieldLayouts: {
          ...(record.fieldLayouts ?? {}),
          [fieldId]: { ...(record.fieldLayouts?.[fieldId] ?? {}), height: nextHeight },
        },
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
