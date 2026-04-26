import {
  lakeDocumentToHtml,
  lakeDocumentToMarkdown,
  lakeWorkspaceToMarkdownZip,
} from "./lakeExport";

test("Lake 内容可以导出为 Markdown", () => {
  const markdown = lakeDocumentToMarkdown(
    "标题",
    "<h2>小节</h2><p><strong>hello</strong> <a href=\"https://example.com\">link</a></p>",
  );

  expect(markdown).toContain("# 标题");
  expect(markdown).toContain("## 小节");
  expect(markdown).toContain("**hello** [link](https://example.com)");
});

test("HTML 导出保留 Lake 内容和打印样式", async () => {
  const fileValue = `data:${encodeURIComponent(JSON.stringify({
    name: "批文历史数据.zip",
    src: "file:///tmp/批文历史数据.zip",
    size: 35 * 1024,
  }))}`;
  const html = await lakeDocumentToHtml(
    "标题",
    `<h2>hello</h2><card name="file" value="${fileValue}"></card><p class="ne-p">world</p>`,
  );

  expect(html).toContain("<title>标题</title>");
  expect(html).toContain("@media print");
  expect(html).toContain("lake-export-outline");
  expect(html).toContain("--lake-export-outline-width");
  expect(html).toContain("lake-export-resizer");
  expect(html).toContain("yuque-lake-export-outline-width");
  expect(html).toContain("href=\"#heading-hello\"");
  expect(html).toContain("lake-export-attachment");
  expect(html).toContain("批文历史数据.zip");
  expect(html).toContain("(35 kB)");
  expect(html).toContain("<p class=\"ne-p\">world</p>");
});

test("知识库 Markdown 按目录树导出为 ZIP", async () => {
  const zip = await lakeWorkspaceToMarkdownZip(
    {
      root: "/tmp/kb",
      directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
      documents: [{ id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1 }],
      order: ["folder:notes", "document:notes/a.lake"],
    },
    async () => "<p>正文</p>",
  );
  const entries = readStoredZipEntries(zip);

  expect(entries.map((entry) => entry.path)).toEqual(["notes/", "notes/a.md"]);
  expect(entries[0].content).toBe("");
  expect(entries[1].content).toContain("# a");
  expect(entries[1].content).toContain("正文");
});

function readStoredZipEntries(bytes: Uint8Array): Array<{ path: string; content: string }> {
  const decoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Array<{ path: string; content: string }> = [];
  let offset = 0;

  while (offset < bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressedSize = view.getUint32(offset + 18, true);
    const pathLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const pathStart = offset + 30;
    const contentStart = pathStart + pathLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    entries.push({
      path: decoder.decode(bytes.slice(pathStart, pathStart + pathLength)),
      content: decoder.decode(bytes.slice(contentStart, contentEnd)),
    });
    offset = contentEnd;
  }

  return entries;
}
