import type { LakeEditorInstance } from "./editorTypes";
import type { LakeAiImportContentType } from "./lakeAiImport";

export interface LakeSelectionCapability {
  canReadSelection: boolean;
  canReplaceSelection: boolean;
}

export interface LakeSelectionSnapshot {
  markdown: string;
  text: string;
}

type SelectionDocumentReaderName = "getSelectionDocument" | "getSelectedDocument";
type SelectionTextReaderName = "getSelectionText" | "getSelectedText";
type SelectionReplacerName = "replaceSelection" | "replaceSelectionDocument" | "replaceSelectedDocument";

const selectionDocumentReaders: SelectionDocumentReaderName[] = ["getSelectionDocument", "getSelectedDocument"];
const selectionTextReaders: SelectionTextReaderName[] = ["getSelectionText", "getSelectedText"];
const selectionReplacers: SelectionReplacerName[] = ["replaceSelection", "replaceSelectionDocument", "replaceSelectedDocument"];

export function lakeSelectionCapability(editor: LakeEditorInstance | null): LakeSelectionCapability {
  return {
    canReadSelection: Boolean(editor) && (
      selectionDocumentReaders.some((methodName) => typeof editor?.[methodName] === "function") ||
      selectionTextReaders.some((methodName) => typeof editor?.[methodName] === "function")
    ),
    canReplaceSelection: Boolean(editor) && selectionReplacers.some((methodName) => typeof editor?.[methodName] === "function"),
  };
}

export function readLakeEditorSelection(editor: LakeEditorInstance | null): LakeSelectionSnapshot | null {
  if (!editor) {
    return null;
  }

  const markdown = readSelectionMarkdown(editor);
  const text = markdown || readSelectionText(editor);
  if (!text.trim()) {
    return null;
  }

  return {
    markdown: markdown || text,
    text,
  };
}

export function replaceLakeEditorSelection(
  editor: LakeEditorInstance | null,
  contentType: LakeAiImportContentType,
  content: string,
): boolean {
  if (!editor || !content.trim()) {
    return false;
  }

  for (const methodName of selectionReplacers) {
    const replacer = editor[methodName];
    if (typeof replacer !== "function") {
      continue;
    }
    // 只使用 Lake 实例显式暴露的替换能力；不通过 DOM 或光标位置猜测选区边界。
    replacer.call(editor, contentType, content);
    return true;
  }

  return false;
}

function readSelectionMarkdown(editor: LakeEditorInstance): string {
  for (const methodName of selectionDocumentReaders) {
    const reader = editor[methodName];
    if (typeof reader !== "function") {
      continue;
    }
    const content = reader.call(editor, "text/markdown");
    if (typeof content === "string" && content.trim()) {
      return content;
    }
  }
  return "";
}

function readSelectionText(editor: LakeEditorInstance): string {
  for (const methodName of selectionTextReaders) {
    const reader = editor[methodName];
    if (typeof reader !== "function") {
      continue;
    }
    const content = reader.call(editor);
    if (typeof content === "string" && content.trim()) {
      return content;
    }
  }
  return "";
}
