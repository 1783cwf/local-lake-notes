export type LakeAiImportContentType = "text/markdown" | "text/html";

export interface LakeAiImportContent {
  type: LakeAiImportContentType;
  content: string;
}

export function prepareAiMarkdownForLakeImport(markdown: string): LakeAiImportContent {
  if (!requiresHtmlImport(markdown)) {
    return { type: "text/markdown", content: markdown };
  }
  return {
    type: "text/html",
    content: markdownToHtmlForLakeImport(markdown),
  };
}

function markdownToHtmlForLakeImport(markdown: string): string {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFence = line.match(/^```(\S*)\s*$/);
    if (codeFence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```\s*$/)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      const languageClass = codeFence[1] ? ` class="language-${escapeAttribute(codeFence[1])}"` : "";
      blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.map((item) => `<p>${inlineMarkdownToHtml(item)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const { html, nextIndex } = renderMarkdownTable(lines, index);
      blocks.push(html);
      index = nextIndex;
      continue;
    }

    if (isListLine(line)) {
      const ordered = isOrderedListLine(line);
      const items: string[] = [];
      while (index < lines.length && (ordered ? isOrderedListLine(lines[index]) : isUnorderedListLine(lines[index]))) {
        const itemText = lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
        items.push(`<li>${renderListItemContent(itemText)}</li>`);
        index += 1;
      }
      blocks.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !lines[index].match(/^```/)
      && !lines[index].match(/^(#{1,6})\s+/)
      && !isBlockquoteLine(lines[index])
      && !isMarkdownTableStart(lines, index)
      && !isListLine(lines[index])
      && lines[index].trim() !== "---"
      && lines[index].trim() !== "***"
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdownToHtml(paragraphLines.join("\n"))}</p>`);
  }

  return blocks.join("\n");
}

function requiresHtmlImport(markdown: string): boolean {
  const lines = markdown.split("\n");
  return lines.some((line, index) => isMarkdownTableStart(lines, index) || isBlockquoteLine(line) || isTaskListLine(line));
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return Boolean(isMarkdownTableRow(lines[index]) && isMarkdownTableSeparator(lines[index + 1] ?? ""));
}

function renderMarkdownTable(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const headerCells = splitMarkdownTableRow(lines[startIndex]);
  let index = startIndex + 2;
  const bodyRows: string[][] = [];

  while (index < lines.length && isMarkdownTableRow(lines[index])) {
    bodyRows.push(splitMarkdownTableRow(lines[index]));
    index += 1;
  }

  const header = `<thead><tr>${headerCells.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join("")}</tr></thead>`;
  const body = bodyRows.length
    ? `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`
    : "";
  return { html: `<table>${header}${body}</table>`, nextIndex: index };
}

function isMarkdownTableRow(line: string | undefined): boolean {
  if (!line) {
    return false;
  }
  const trimmed = line.trim();
  return trimmed.includes("|") && splitMarkdownTableRow(trimmed).length >= 2;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isListLine(line: string): boolean {
  return isUnorderedListLine(line) || isOrderedListLine(line);
}

function isUnorderedListLine(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line);
}

function isOrderedListLine(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line);
}

function isTaskListLine(line: string): boolean {
  return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(line);
}

function isBlockquoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line);
}

function renderListItemContent(value: string): string {
  const task = value.match(/^\[([ xX])\]\s+(.+)$/);
  if (!task) {
    return inlineMarkdownToHtml(value);
  }
  const checked = task[1].toLowerCase() === "x" ? " checked" : "";
  return `<input type="checkbox" disabled${checked}> ${inlineMarkdownToHtml(task[2])}`;
}

function inlineMarkdownToHtml(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
