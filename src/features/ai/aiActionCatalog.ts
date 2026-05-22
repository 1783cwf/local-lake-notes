import type { AiDocumentActionType } from "../../app/appState";

export type AiDocumentActionGroup = "文档理解" | "写作处理" | "写作工作流";

export interface AiDocumentActionDefinition {
  type: AiDocumentActionType;
  label: string;
  group: AiDocumentActionGroup;
  requiresInstruction?: boolean;
  supportsSelection?: boolean;
}

export const aiDocumentActions: AiDocumentActionDefinition[] = [
  { type: "summarize-document", label: "总结", group: "文档理解" },
  { type: "answer-question", label: "问答", group: "文档理解", requiresInstruction: true },
  { type: "generate-title", label: "标题", group: "文档理解" },
  { type: "generate-abstract", label: "摘要", group: "文档理解" },
  { type: "generate-todos", label: "待办", group: "文档理解" },
  { type: "generate-meeting-minutes", label: "会议纪要", group: "文档理解" },
  { type: "rewrite", label: "改写", group: "写作处理", supportsSelection: true },
  { type: "polish", label: "润色", group: "写作处理", supportsSelection: true },
  { type: "expand", label: "扩写", group: "写作处理", supportsSelection: true },
  { type: "compress", label: "压缩", group: "写作处理", supportsSelection: true },
  { type: "organize-headings", label: "整理结构", group: "写作处理", supportsSelection: true },
  { type: "outline-to-draft", label: "提纲成稿", group: "写作工作流", supportsSelection: true },
  { type: "notes-to-article", label: "笔记成文", group: "写作工作流", supportsSelection: true },
  { type: "long-form-structure", label: "长文建议", group: "写作工作流" },
  { type: "tech-to-tutorial", label: "转教程", group: "写作工作流", supportsSelection: true },
  { type: "tech-to-readme", label: "转 README", group: "写作工作流", supportsSelection: true },
  { type: "tech-to-release-notes", label: "转发布说明", group: "写作工作流", supportsSelection: true },
  { type: "custom-edit", label: "自由编辑", group: "写作工作流", requiresInstruction: true, supportsSelection: true },
  { type: "split-document", label: "拆分子文档", group: "写作工作流" },
];

export function groupedAiDocumentActions(): Array<{ group: string; actions: AiDocumentActionDefinition[] }> {
  return ["文档理解", "写作处理", "写作工作流"].map((group) => ({
    group,
    actions: aiDocumentActions.filter((action) => action.group === group),
  }));
}

export function aiDocumentActionByType(actionType: AiDocumentActionType): AiDocumentActionDefinition | undefined {
  return aiDocumentActions.find((action) => action.type === actionType);
}
