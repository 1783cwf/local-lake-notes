import type { AiDocumentContentScope, AiDocumentPatch, AiDocumentPatchOperation } from "../../app/appState";

export interface AiDocumentPatchPreviewLine {
  type: "context" | "added" | "removed";
  text: string;
}

export interface AiDocumentPatchPreview {
  before: string;
  after: string;
  lines: AiDocumentPatchPreviewLine[];
  errors: string[];
}

export function previewAiDocumentPatch(
  content: string,
  patch: AiDocumentPatch,
  scope: AiDocumentContentScope,
): AiDocumentPatchPreview {
  const result = applyAiDocumentPatch(content, patch, scope);
  return {
    before: content,
    after: result.content,
    lines: diffMarkdownLines(content, result.content),
    errors: result.errors,
  };
}

export function applyAiDocumentPatch(
  content: string,
  patch: AiDocumentPatch,
  scope: AiDocumentContentScope,
): { content: string; errors: string[] } {
  return (patch.operations ?? []).reduce(
    (state, operation, index) => {
      if (state.errors.length) {
        return state;
      }
      const next = applyAiDocumentPatchOperation(state.content, operation, scope);
      return next.error
        ? { ...state, errors: [`第 ${index + 1} 个操作失败：${next.error}`] }
        : { content: next.content, errors: [] };
    },
    { content, errors: [] as string[] },
  );
}

function applyAiDocumentPatchOperation(
  content: string,
  operation: AiDocumentPatchOperation,
  scope: AiDocumentContentScope,
): { content: string; error?: string } {
  switch (operation.type) {
    case "replace-selection":
      if (scope !== "selection") {
        return { content, error: "replace-selection 只能用于当前选中区域" };
      }
      return { content: operation.markdown.trim() };
    case "insert-before":
      return replaceByAnchor(content, operation.anchor, (anchor) => `${withTrailingLineBreak(operation.markdown)}${anchor}`);
    case "insert-after":
      return replaceByAnchor(content, operation.anchor, (anchor) => `${anchor}${leadingLineBreak(operation.markdown)}`);
    case "replace-text":
      return replaceByAnchor(content, operation.anchor, () => operation.markdown.trim());
    case "delete-text":
      return replaceByAnchor(content, operation.anchor, () => "");
    case "prepend-document":
      return { content: `${withTrailingLineBreak(operation.markdown)}${content}` };
    case "append-document":
      return { content: `${content}${leadingLineBreak(operation.markdown)}` };
    default:
      return { content, error: "未知操作类型" };
  }
}

function replaceByAnchor(content: string, anchor: string, replace: (anchor: string) => string): { content: string; error?: string } {
  if (!anchor.trim()) {
    return { content, error: "缺少定位文本" };
  }
  const index = content.indexOf(anchor);
  if (index < 0) {
    return { content, error: `没有找到定位文本：${anchor}` };
  }
  const nextContent = `${content.slice(0, index)}${replace(anchor)}${content.slice(index + anchor.length)}`;
  return { content: nextContent };
}

function withTrailingLineBreak(markdown: string): string {
  const trimmed = markdown.trim();
  return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
}

function leadingLineBreak(markdown: string): string {
  const trimmed = markdown.trim();
  return trimmed ? `\n\n${trimmed}` : "";
}

function diffMarkdownLines(before: string, after: string): AiDocumentPatchPreviewLine[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const table = longestCommonSubsequenceTable(beforeLines, afterLines);
  const lines: AiDocumentPatchPreviewLine[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      lines.push({ type: "context", text: beforeLines[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
      lines.push({ type: "removed", text: beforeLines[beforeIndex] });
      beforeIndex += 1;
    } else {
      lines.push({ type: "added", text: afterLines[afterIndex] });
      afterIndex += 1;
    }
  }
  while (beforeIndex < beforeLines.length) {
    lines.push({ type: "removed", text: beforeLines[beforeIndex] });
    beforeIndex += 1;
  }
  while (afterIndex < afterLines.length) {
    lines.push({ type: "added", text: afterLines[afterIndex] });
    afterIndex += 1;
  }

  return compactContextLines(lines);
}

function longestCommonSubsequenceTable(beforeLines: string[], afterLines: string[]): number[][] {
  const table = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0));
  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
        ? table[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
    }
  }
  return table;
}

function compactContextLines(lines: AiDocumentPatchPreviewLine[]): AiDocumentPatchPreviewLine[] {
  const changedIndexes = lines
    .map((line, index) => line.type === "context" ? -1 : index)
    .filter((index) => index >= 0);
  if (!changedIndexes.length) {
    return lines.slice(0, 12);
  }

  const visible = new Set<number>();
  for (const index of changedIndexes) {
    for (let offset = -3; offset <= 3; offset += 1) {
      const nextIndex = index + offset;
      if (nextIndex >= 0 && nextIndex < lines.length) {
        visible.add(nextIndex);
      }
    }
  }

  const compacted: AiDocumentPatchPreviewLine[] = [];
  let hiddenContext = false;
  lines.forEach((line, index) => {
    if (visible.has(index)) {
      if (hiddenContext) {
        compacted.push({ type: "context", text: "..." });
        hiddenContext = false;
      }
      compacted.push(line);
    } else if (line.type === "context") {
      hiddenContext = true;
    }
  });
  return compacted;
}
