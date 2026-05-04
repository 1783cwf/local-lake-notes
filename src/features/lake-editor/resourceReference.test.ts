import {
  createResourceReference,
  dehydrateLakeResources,
  hydrateLakeResources,
  parseResourceReference,
  resourceReferenceFromPublicUrl,
} from "./resourceReference";

test("创建并解析私有资源引用", () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "images/2026/05/a b.png",
    kind: "image",
    name: "截图.png",
    size: 1234,
    mimeType: "image/png",
  });

  expect(parseResourceReference(ref)).toEqual({
    bucket: "yuque",
    key: "images/2026/05/a b.png",
    kind: "image",
    name: "截图.png",
    size: 1234,
    mimeType: "image/png",
  });
});

test("图片资源在 hydrate 与 dehydrate 之间保持可逆", async () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "images/a.png",
    kind: "image",
  });
  const content = `<p><img src="${ref}"></p>`;

  const hydrated = await hydrateLakeResources(content, async () => "asset://preview/a.png");
  expect(hydrated).toContain("asset://preview/a.png");

  const dehydrated = dehydrateLakeResources(hydrated, [{ resourceRef: ref, previewUrl: "asset://preview/a.png" }]);
  expect(dehydrated).toContain(ref.replace(/&/g, "&amp;"));
});

test("附件卡片资源在 hydrate 与 dehydrate 之间保留原文件名", async () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "测试资料.pdf",
    size: 43325,
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: ref, name: "测试资料.pdf", size: 43325 }))}`;
  const content = `<card name="file" value="${value}"></card>`;

  const hydrated = await hydrateLakeResources(content, async () => "asset://preview/a.pdf");
  expect(decodeURIComponent(hydrated)).toContain("测试资料.pdf");
  expect(decodeURIComponent(hydrated)).toContain("asset://preview/a.pdf");

  const dehydrated = dehydrateLakeResources(hydrated, [{ resourceRef: ref, previewUrl: "asset://preview/a.pdf" }]);
  expect(decodeURIComponent(dehydrated)).toContain("测试资料.pdf");
  expect(decodeURIComponent(dehydrated)).toContain("yuque-resource://");
});

test("图片卡片保存时会把预览地址还原为私有资源引用", async () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "images/a.png",
    kind: "image",
    name: "截图.png",
    mimeType: "image/png",
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: ref, name: "截图.png", type: "image/png" }))}`;
  const content = `<card name="image" value="${value}"></card>`;

  const hydrated = await hydrateLakeResources(content, async () => "blob:local-preview");
  expect(decodeURIComponent(hydrated)).toContain("blob:local-preview");

  const dehydrated = dehydrateLakeResources(hydrated, [{ resourceRef: ref, previewUrl: "blob:local-preview" }]);
  expect(decodeURIComponent(dehydrated)).toContain("yuque-resource://");
  expect(decodeURIComponent(dehydrated)).not.toContain("blob:local-preview");
});

test("导出时可以把公共 URL 还原为私有资源引用", () => {
  const ref = resourceReferenceFromPublicUrl(
    "https://oss.weistuday.com:16666/yuque/files/2026/04/test-file.pdf",
    {
      bucket: "yuque",
      publicBaseUrl: "https://oss.weistuday.com:16666/yuque",
      imagePrefix: "images",
      filePrefix: "files",
    },
    {
      kind: "file",
      name: "测试资料.pdf",
    },
  );

  expect(parseResourceReference(ref ?? "")).toEqual({
    bucket: "yuque",
    key: "files/2026/04/test-file.pdf",
    kind: "file",
    name: "测试资料.pdf",
    size: undefined,
    mimeType: undefined,
  });
});

test("非当前公共访问地址不会被还原为私有资源引用", () => {
  const ref = resourceReferenceFromPublicUrl(
    "https://example.com/files/a.pdf",
    {
      bucket: "yuque",
      publicBaseUrl: "https://oss.weistuday.com:16666/yuque",
      imagePrefix: "images",
      filePrefix: "files",
    },
  );

  expect(ref).toBeNull();
});

test("外部链接不会被误改", async () => {
  const content = `<p><img src="https://example.com/a.png"></p>`;

  await expect(hydrateLakeResources(content, async () => "asset://preview/a.png")).resolves.toBe(content);
  expect(dehydrateLakeResources(content, [])).toBe(content);
});
