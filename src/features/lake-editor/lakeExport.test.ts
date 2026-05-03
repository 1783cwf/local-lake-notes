import {
  createOfficialLakeMarkdownConverter,
  lakeDocumentToHtml,
  lakeDocumentToHtmlBundle,
  lakeDocumentToHtmlWithResources,
  lakeDocumentMarkdownToBundle,
  lakeDocumentMarkdownToTextWithResources,
  lakeDocumentToMarkdown,
  lakeWorkspaceToMarkdownZip,
} from "./lakeExport";
import { createResourceReference } from "./resourceReference";

afterEach(() => {
  window.Doc = undefined;
});

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
    name: "测试附件.zip",
    src: "file:///tmp/测试附件.zip",
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
  expect(html).toContain("测试附件.zip");
  expect(html).toContain("(35 kB)");
  expect(html).toContain("<p class=\"ne-p\">world</p>");
});

test("短时签名 HTML 导出会重写图片和附件链接", async () => {
  const imageRef = createResourceReference({ bucket: "yuque", key: "images/a.png", kind: "image" });
  const fileRef = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "资料.pdf",
  });
  const fileValue = `data:${encodeURIComponent(JSON.stringify({ src: fileRef, name: "资料.pdf" }))}`;
  const html = await lakeDocumentToHtmlWithResources(
    "标题",
    `<p><img src="${imageRef}" alt="截图"></p><card name="file" value="${fileValue}"></card>`,
    {
      strategy: "signed-url",
      signedUrlTtlSeconds: 3600,
      signResource: async (_resourceRef, filename) => `https://signed.example/${filename ?? "image"}`,
    },
  );

  expect(html).toContain("资源链接有效期：1 小时");
  expect(html).toContain("https://signed.example/截图");
  expect(html).toContain("https://signed.example/资料.pdf");
});

test("短时签名 HTML 导出可将图片内嵌为 base64 并保留附件签名链接", async () => {
  const imageRef = createResourceReference({ bucket: "yuque", key: "images/a.png", kind: "image", mimeType: "image/png" });
  const fileRef = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "资料.pdf",
  });
  const fileValue = `data:${encodeURIComponent(JSON.stringify({ src: fileRef, name: "资料.pdf" }))}`;
  const html = await lakeDocumentToHtmlWithResources(
    "标题",
    `<p><img src="${imageRef}" alt="截图"></p><card name="file" value="${fileValue}"></card>`,
    {
      strategy: "signed-url",
      signedUrlTtlSeconds: 3600,
      embedImages: true,
      signResource: async (_resourceRef, filename) => `https://signed.example/${filename ?? "file"}`,
      loadResource: async () => new Uint8Array([65]),
    },
  );

  expect(html).toContain("src=\"data:image/png;base64,QQ==\"");
  expect(html).toContain("https://signed.example/资料.pdf");
  expect(html).not.toContain("https://signed.example/截图");
});

test("短时签名 HTML 导出会把公共 URL 按资源规则重写", async () => {
  const signedRefs: string[] = [];
  const html = await lakeDocumentToHtmlWithResources(
    "标题",
    [
      "<p>",
      "<img src=\"https://oss.weistuday.com:16666/yuque/images/2026/05/a.png\" alt=\"截图.png\">",
      "</p>",
      "<p>",
      "<a href=\"https://oss.weistuday.com:16666/yuque/files/2026/04/test-file.pdf\">测试资料.pdf</a>",
      "</p>",
    ].join(""),
    {
      strategy: "signed-url",
      signedUrlTtlSeconds: 3600,
      bucket: "yuque",
      publicBaseUrl: "https://oss.weistuday.com:16666/yuque",
      imagePrefix: "images",
      filePrefix: "files",
      signResource: async (resourceRef, filename) => {
        signedRefs.push(resourceRef);
        return `https://signed.example/${filename ?? "resource"}`;
      },
    },
  );

  expect(html).not.toContain("https://oss.weistuday.com:16666/yuque/");
  expect(html).toContain("https://signed.example/截图.png");
  expect(html).toContain("https://signed.example/测试资料.pdf");
  expect(html).toContain("lake-export-attachment");
  expect(signedRefs).toHaveLength(2);
  expect(signedRefs[0]).toContain("yuque-resource://yuque/images/2026/05/a.png");
  expect(signedRefs[1]).toContain("yuque-resource://yuque/files/2026/04/test-file.pdf");
});

test("本地资源包 HTML 导出会生成 index 和资源文件", async () => {
  const imageRef = createResourceReference({
    bucket: "yuque",
    key: "images/a.png",
    kind: "image",
    name: "截图.png",
  });
  const fileRef = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "资料.pdf",
  });
  const fileValue = `data:${encodeURIComponent(JSON.stringify({ src: fileRef, name: "资料.pdf" }))}`;
  const zip = await lakeDocumentToHtmlBundle(
    "标题",
    `<p><img src="${imageRef}" alt="截图"></p><card name="file" value="${fileValue}"></card>`,
    {
      strategy: "bundle",
      signedUrlTtlSeconds: 3600,
      loadResource: async () => new Uint8Array([65]),
    },
  );
  const entries = readStoredZipEntries(zip);

  expect(entries.map((entry) => entry.path)).toEqual(["index.html", "attachments/资料.pdf"]);
  expect(entries[0].content).toContain("data:image/png;base64,QQ==");
  expect(entries[0].content).toContain("attachments/资料.pdf");
  expect(entries[1].content).toBe("A");
});

test("本地资源包 HTML 导出会把公共 URL 打进资源目录", async () => {
  const zip = await lakeDocumentToHtmlBundle(
    "标题",
    "<p><a href=\"https://oss.weistuday.com:16666/yuque/files/a.pdf\">资料.pdf</a></p>",
    {
      strategy: "bundle",
      signedUrlTtlSeconds: 3600,
      bucket: "yuque",
      publicBaseUrl: "https://oss.weistuday.com:16666/yuque",
      imagePrefix: "images",
      filePrefix: "files",
      loadResource: async () => new Uint8Array([67]),
    },
  );
  const entries = readStoredZipEntries(zip);

  expect(entries.map((entry) => entry.path)).toEqual(["index.html", "attachments/资料.pdf"]);
  expect(entries[0].content).not.toContain("https://oss.weistuday.com:16666/yuque/");
  expect(entries[0].content).toContain("attachments/资料.pdf");
  expect(entries[1].content).toBe("C");
});

test("Markdown 本地资源包导出会生成 md 和资源文件", async () => {
  const imageRef = createResourceReference({
    bucket: "yuque",
    key: "images/a.png",
    kind: "image",
    name: "截图.png",
  });
  const zip = await lakeDocumentMarkdownToBundle(
    "标题",
    `![截图](${imageRef})`,
    {
      strategy: "bundle",
      signedUrlTtlSeconds: 3600,
      loadResource: async () => new Uint8Array([66]),
    },
  );
  const entries = readStoredZipEntries(zip);

  expect(entries.map((entry) => entry.path)).toEqual(["标题.md", "assets/截图.png"]);
  expect(entries[0].content).toContain("![截图](assets/截图.png)");
  expect(entries[1].content).toBe("B");
});

test("Markdown 短时签名导出保持单文件并重写链接", async () => {
  const imageRef = createResourceReference({
    bucket: "yuque",
    key: "images/a.png",
    kind: "image",
    name: "截图.png",
  });
  const markdown = await lakeDocumentMarkdownToTextWithResources(
    "标题",
    `![截图](${imageRef})`,
    {
      strategy: "signed-url",
      signedUrlTtlSeconds: 3600,
      signResource: async () => "https://signed.example/a.png",
    },
  );

  expect(markdown).toContain("![截图](https://signed.example/a.png)");
});

test("知识库 Markdown 按目录树导出为 ZIP", async () => {
  const convertDocument = vi.fn(async () => "![图片](file:///tmp/a.png)\n");
  const zip = await lakeWorkspaceToMarkdownZip(
    {
      root: "/tmp/kb",
      directories: [{ id: "notes", path: "notes", name: "notes", parentPath: "" }],
      documents: [{ id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1 }],
      order: ["folder:notes", "document:notes/a.lake"],
    },
    async () => "<p>正文</p>",
    convertDocument,
  );
  const entries = readStoredZipEntries(zip);

  expect(entries.map((entry) => entry.path)).toEqual(["notes/", "notes/a.md"]);
  expect(entries[0].content).toBe("");
  expect(entries[1].content).toBe("![图片](file:///tmp/a.png)\n");
  expect(convertDocument).toHaveBeenCalledWith(
    { id: "notes/a.lake", path: "notes/a.lake", name: "a", parentPath: "notes", size: 1 },
    "<p>正文</p>",
  );
});

test("官方 Markdown 转换器使用 Lake setDocument 和 getDocument", async () => {
  const editor = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "![图片](file:///tmp/a.png)\n"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };

  const converter = createOfficialLakeMarkdownConverter();
  const markdown = await converter.convert(
    { id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1 },
    "<p>正文</p>",
  );
  converter.dispose();

  expect(window.Doc.createOpenEditor).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({
      input: {},
      toc: { enable: false },
      codeblock: expect.objectContaining({
        codemirrorURL: "/vendor/lakex-doc/codemirror.js",
      }),
      math: expect.objectContaining({
        KaTexURL: "/vendor/lakex-doc/katex.min.js",
      }),
    }),
  );
  expect(editor.setDocument).toHaveBeenCalledWith("text/lake", "<p>正文</p>");
  expect(editor.getDocument).toHaveBeenCalledWith("text/markdown");
  expect(markdown).toContain("# a");
  expect(markdown).toContain("![图片](file:///tmp/a.png)");
  expect(editor.destroy).toHaveBeenCalled();
  expect(document.querySelector("[data-lake-export-converter='true']")).toBeNull();
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
