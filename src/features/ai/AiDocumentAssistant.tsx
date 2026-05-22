import type { FormEvent } from "react";
import { useState } from "react";
import { Bot, Check, Copy, Loader2, X } from "lucide-react";

import type {
  AiDocumentContentScope,
  AiDocumentActionType,
  AiRunDocumentActionOutput,
  AiSplitDocumentOutput,
} from "../../app/appState";
import type { AiDocumentPatchPreview } from "./documentPatch";
import { aiDocumentActionByType, groupedAiDocumentActions } from "./aiActionCatalog";

interface AiDocumentAssistantProps {
  open: boolean;
  documentTitle: string;
  result: AiRunDocumentActionOutput | null;
  patchPreview: AiDocumentPatchPreview | null;
  splitResult: AiSplitDocumentOutput | null;
  running: boolean;
  error: string | null;
  scope: AiDocumentContentScope;
  autoApply: boolean;
  selectionAvailable: boolean;
  selectionReplaceAvailable: boolean;
  onClose: () => void;
  onScopeChange: (scope: AiDocumentContentScope) => void;
  onAutoApplyChange: (enabled: boolean) => void;
  onRunAction: (actionType: AiDocumentActionType, instruction: string) => Promise<void>;
  onApplyResult: () => Promise<void> | void;
  onConfirmSplit: () => Promise<void> | void;
}

export function AiDocumentAssistant({
  open,
  documentTitle,
  result,
  patchPreview,
  splitResult,
  running,
  error,
  scope,
  autoApply,
  selectionAvailable,
  selectionReplaceAvailable,
  onClose,
  onScopeChange,
  onAutoApplyChange,
  onRunAction,
  onApplyResult,
  onConfirmSplit,
}: AiDocumentAssistantProps) {
  const [selectedAction, setSelectedAction] = useState<AiDocumentActionType>("custom-edit");
  const [instruction, setInstruction] = useState("");

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onRunAction(selectedAction, instruction);
  };
  const selectedDefinition = aiDocumentActionByType(selectedAction);
  const instructionPlaceholder = selectedAction === "custom-edit"
    ? "直接描述要怎么改文档；如果输入范围是选中区域，只会生成替换这段选区的预览"
    : "问答动作需要填写问题；其他动作可填写风格、格式或重点要求";
  const canUseSelection = Boolean(selectedDefinition?.supportsSelection && selectionAvailable);
  const activeScope: AiDocumentContentScope = selectedDefinition?.supportsSelection ? scope : "document";
  const replacementLabel = activeScope === "selection" ? "允许并替换选中区域" : "允许并应用修改";

  return (
    <aside className="ai-assistant-panel" aria-label="AI 文档助手">
      <header className="ai-assistant-panel__header">
        <div>
          <span>AI 文档助手</span>
          <strong>{documentTitle}</strong>
        </div>
        <button type="button" className="icon-button" aria-label="关闭 AI 文档助手" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      <form className="ai-assistant-panel__body" onSubmit={submit}>
        <section className="ai-assistant-direct-edit" aria-label="直接编辑指令">
          <label>
            你想怎么改
            <textarea
              value={instruction}
              rows={5}
              placeholder={instructionPlaceholder}
              onChange={(event) => setInstruction(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="ai-assistant-direct-edit__primary"
            disabled={running || !instruction.trim()}
            onClick={() => {
              setSelectedAction("custom-edit");
              void onRunAction("custom-edit", instruction);
            }}
          >
            {running && selectedAction === "custom-edit" ? <Loader2 size={16} className="spin-icon" /> : <Bot size={16} />}
            {running && selectedAction === "custom-edit" ? "生成中" : "生成修改预览"}
          </button>
          <label className="ai-assistant-auto-apply">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(event) => onAutoApplyChange(event.target.checked)}
            />
            自动模式
          </label>
        </section>

        {groupedAiDocumentActions().map((group) => (
          <section key={group.group} className="ai-assistant-action-group" aria-label={group.group}>
            <h3>{group.group}</h3>
            <div>
              {group.actions.map((action) => (
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
        ))}

        {selectedDefinition?.supportsSelection ? (
          <section className="ai-assistant-action-group" aria-label="输入范围">
            <h3>输入范围</h3>
            <div>
              <button
                type="button"
                className={activeScope === "document" ? "is-active" : ""}
                onClick={() => onScopeChange("document")}
              >
                当前文档
              </button>
              <button
                type="button"
                className={activeScope === "selection" ? "is-active" : ""}
                disabled={!canUseSelection}
                title={selectionAvailable ? undefined : "当前 Lake 运行时未暴露稳定选区读取 API"}
                onClick={() => onScopeChange("selection")}
              >
                选中区域
              </button>
            </div>
            {scope === "selection" && selectionAvailable ? (
              <p className="ai-assistant-hint">会把当前选区作为输入，确认后只替换这段选区。</p>
            ) : null}
            {scope === "selection" && selectionAvailable && !selectionReplaceAvailable ? (
              <p className="ai-assistant-hint">可读取选区，但当前 Lake 运行时没有暴露选区替换 API；生成后只能复制。</p>
            ) : null}
          </section>
        ) : null}

        <button type="submit" className="primary-button" disabled={running}>
          {running ? <Loader2 size={16} className="spin-icon" /> : <Bot size={16} />}
          {running ? "生成中" : "生成预览"}
        </button>

        {error ? <p className="settings-error">{error}</p> : null}

        {splitResult ? (
          <section className="ai-assistant-result" aria-label="AI 拆分预览">
            <div className="ai-assistant-result__header">
              <h3>{splitResult.title}</h3>
              <button type="button" className="primary-button" onClick={onConfirmSplit}>
                <Check size={15} />
                确认创建
              </button>
            </div>
            <div className="ai-assistant-split-list">
              {splitResult.parts.map((part, index) => (
                <article key={`${part.title}-${index}`}>
                  <strong>{index + 1}. {part.title}</strong>
                  <p>{part.content.slice(0, 220)}{part.content.length > 220 ? "..." : ""}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {result ? (
          <section className="ai-assistant-result" aria-label="AI 预览结果">
            <div className="ai-assistant-result__header">
              <h3>{result.title}</h3>
              <div>
                <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(result.content)}>
                  <Copy size={15} />
                  复制
                </button>
                {result.previewMode === "replace-document" ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={result.contentScope === "selection" && !selectionReplaceAvailable}
                    onClick={onApplyResult}
                  >
                    <Check size={15} />
                    {replacementLabel}
                  </button>
                ) : null}
              </div>
            </div>
            {result.previewMode === "patch" && patchPreview ? (
              <p className="ai-assistant-hint">修改差异已显示在文档区域，请在文档上方确认或取消。</p>
            ) : (
              <pre>{result.content}</pre>
            )}
          </section>
        ) : null}
      </form>
    </aside>
  );
}
