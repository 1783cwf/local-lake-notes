import type { FormEvent } from "react";
import { useState } from "react";
import { Bot, Check, Copy, Loader2, X } from "lucide-react";

import type {
  AiRunSpreadsheetActionOutput,
  AiRunTableActionOutput,
  AiSpreadsheetActionType,
  AiSpreadsheetPatch,
  AiTableActionType,
  AiTablePatch,
} from "../../app/appState";

interface AiTableActionDefinition {
  type: AiTableActionType;
  label: string;
  requiresInstruction?: boolean;
}

const aiTableActions: AiTableActionDefinition[] = [
  { type: "generate-fields", label: "生成字段", requiresInstruction: true },
  { type: "create-records", label: "创建记录", requiresInstruction: true },
  { type: "extract-tasks", label: "输入转记录", requiresInstruction: true },
  { type: "summarize-table", label: "表格摘要" },
  { type: "suggest-tags-status", label: "标签/状态建议" },
  { type: "meeting-to-task-board", label: "会议转看板", requiresInstruction: true },
];

interface AiSpreadsheetActionDefinition {
  type: AiSpreadsheetActionType;
  label: string;
  requiresInstruction?: boolean;
}

const aiSpreadsheetActions: AiSpreadsheetActionDefinition[] = [
  { type: "create-sheet", label: "新建工作表", requiresInstruction: true },
  { type: "append-rows", label: "追加行", requiresInstruction: true },
  { type: "summarize-spreadsheet", label: "表格摘要" },
];

interface AiTableAssistantProps {
  open: boolean;
  tableTitle: string;
  result: AiRunTableActionOutput | null;
  running: boolean;
  error: string | null;
  onClose: () => void;
  onRunAction: (actionType: AiTableActionType, instruction: string) => Promise<void>;
  onApplyPatch: (patch: AiTablePatch) => Promise<void> | void;
}

interface AiSpreadsheetAssistantProps {
  open: boolean;
  spreadsheetTitle: string;
  result: AiRunSpreadsheetActionOutput | null;
  running: boolean;
  error: string | null;
  onClose: () => void;
  onRunAction: (actionType: AiSpreadsheetActionType, instruction: string) => Promise<void>;
  onApplyPatch: (patch: AiSpreadsheetPatch) => Promise<void> | void;
}

export function AiTableAssistant({
  open,
  tableTitle,
  result,
  running,
  error,
  onClose,
  onRunAction,
  onApplyPatch,
}: AiTableAssistantProps) {
  const [selectedAction, setSelectedAction] = useState<AiTableActionType>("generate-fields");
  const [instruction, setInstruction] = useState("");

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onRunAction(selectedAction, instruction);
  };
  const selectedDefinition = aiTableActions.find((action) => action.type === selectedAction);
  const submitDisabled = running || Boolean(selectedDefinition?.requiresInstruction && !instruction.trim());

  return (
    <aside className="ai-assistant-panel" aria-label="AI 多维表格助手">
      <header className="ai-assistant-panel__header">
        <div>
          <span>AI 多维表格助手</span>
          <strong>{tableTitle}</strong>
        </div>
        <button type="button" className="icon-button" aria-label="关闭 AI 多维表格助手" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      <form className="ai-assistant-panel__body" onSubmit={submit}>
        <section className="ai-assistant-action-group" aria-label="表格动作">
          <h3>表格助手</h3>
          <div>
            {aiTableActions.map((action) => (
              <button
                key={action.type}
                type="button"
                className={selectedAction === action.type ? "is-active" : ""}
                onClick={() => setSelectedAction(action.type)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <label>
          补充内容或要求
          <textarea
            value={instruction}
            rows={4}
            placeholder="可粘贴任务、会议纪要或记录内容；默认只写入现有字段，需要新增字段时请明确说明"
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>
        {selectedAction !== "generate-fields" ? (
          <p className="ai-assistant-hint">除非明确要求新增字段，否则会优先按当前表格字段创建新记录。</p>
        ) : null}

        <button type="submit" className="primary-button" disabled={submitDisabled}>
          {running ? <Loader2 size={16} className="spin-icon" /> : <Bot size={16} />}
          {running ? "生成中" : "生成预览"}
        </button>

        {error ? <p className="settings-error">{error}</p> : null}

        {result ? (
          <section className="ai-assistant-result" aria-label="AI 表格预览结果">
            <div className="ai-assistant-result__header">
              <h3>{result.title}</h3>
              <div>
                <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(result.summary)}>
                  <Copy size={15} />
                  复制
                </button>
                {result.patch ? (
                  <button type="button" className="primary-button" onClick={() => onApplyPatch(result.patch!)}>
                    <Check size={15} />
                    应用到表格
                  </button>
                ) : null}
              </div>
            </div>
            <pre>{tablePreviewText(result)}</pre>
          </section>
        ) : null}
      </form>
    </aside>
  );
}

export function AiSpreadsheetAssistant({
  open,
  spreadsheetTitle,
  result,
  running,
  error,
  onClose,
  onRunAction,
  onApplyPatch,
}: AiSpreadsheetAssistantProps) {
  const [selectedAction, setSelectedAction] = useState<AiSpreadsheetActionType>("create-sheet");
  const [instruction, setInstruction] = useState("");

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onRunAction(selectedAction, instruction);
  };
  const selectedDefinition = aiSpreadsheetActions.find((action) => action.type === selectedAction);
  const submitDisabled = running || Boolean(selectedDefinition?.requiresInstruction && !instruction.trim());

  return (
    <aside className="ai-assistant-panel" aria-label="AI 表格助手">
      <header className="ai-assistant-panel__header">
        <div>
          <span>AI 表格助手</span>
          <strong>{spreadsheetTitle}</strong>
        </div>
        <button type="button" className="icon-button" aria-label="关闭 AI 表格助手" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      <form className="ai-assistant-panel__body" onSubmit={submit}>
        <section className="ai-assistant-action-group" aria-label="Univer 表格动作">
          <h3>表格助手</h3>
          <div>
            {aiSpreadsheetActions.map((action) => (
              <button
                key={action.type}
                type="button"
                className={selectedAction === action.type ? "is-active" : ""}
                onClick={() => setSelectedAction(action.type)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <label>
          补充内容或要求
          <textarea
            value={instruction}
            rows={4}
            placeholder="描述要生成的表格、要追加的行，或说明摘要重点"
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>

        <button type="submit" className="primary-button" disabled={submitDisabled}>
          {running ? <Loader2 size={16} className="spin-icon" /> : <Bot size={16} />}
          {running ? "生成中" : "生成预览"}
        </button>

        {error ? <p className="settings-error">{error}</p> : null}

        {result ? (
          <section className="ai-assistant-result" aria-label="AI 表格预览结果">
            <div className="ai-assistant-result__header">
              <h3>{result.title}</h3>
              <div>
                <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(result.summary)}>
                  <Copy size={15} />
                  复制
                </button>
                {result.patch ? (
                  <button type="button" className="primary-button" onClick={() => onApplyPatch(result.patch!)}>
                    <Check size={15} />
                    应用到表格
                  </button>
                ) : null}
              </div>
            </div>
            <pre>{spreadsheetPreviewText(result)}</pre>
          </section>
        ) : null}
      </form>
    </aside>
  );
}

function tablePreviewText(result: AiRunTableActionOutput): string {
  const lines = [result.summary.trim()].filter(Boolean);
  if (result.patch?.fields?.length) {
    lines.push("\n字段候选：");
    lines.push(...result.patch.fields.map((field) => `- ${field.name}（${field.type}${field.options?.length ? `：${field.options.join("、")}` : ""}）`));
  }
  if (result.patch?.records?.length) {
    lines.push("\n记录候选：");
    lines.push(...result.patch.records.map((record) => `- ${record.title || record.body || "未命名记录"}`));
  }
  if (result.patch?.preferBoard) {
    lines.push("\n将切换到看板视图。");
  }
  return lines.join("\n");
}

function spreadsheetPreviewText(result: AiRunSpreadsheetActionOutput): string {
  const lines = [result.summary.trim()].filter(Boolean);
  if (result.patch?.sheets?.length) {
    lines.push("\n工作表候选：");
    lines.push(...result.patch.sheets.map((sheet) => `- ${sheet.name}（${sheet.rows.length} 行）`));
  }
  if (result.patch?.appendRows?.length) {
    lines.push("\n追加行候选：");
    lines.push(...result.patch.appendRows.slice(0, 20).map((row) => `- ${row.map((cell) => cell ?? "").join(" | ")}`));
  }
  return lines.join("\n");
}
