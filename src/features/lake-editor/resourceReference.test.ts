import {
  createResourceReference,
  collectResourceReferences,
  dehydrateLakeResources,
  hydrateLakeResources,
  hydrateLakeResourcesWithPreviews,
  normalizeResourcePreviewConcurrency,
  parseResourceReference,
  resourceReferenceFromPublicUrl,
  runResourcePreviewQueue,
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

test("创建并解析加密资源引用", () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "images/2026/05/a.png",
    kind: "image",
    name: "截图.png",
    size: 1234,
    mimeType: "image/png",
    encryption: {
      algorithm: "age-v1",
      keyFingerprint: "abc123",
    },
  });

  expect(parseResourceReference(ref)).toEqual({
    bucket: "yuque",
    key: "images/2026/05/a.png",
    kind: "image",
    name: "截图.png",
    size: 1234,
    mimeType: "image/png",
    encryption: {
      algorithm: "age-v1",
      keyFingerprint: "abc123",
    },
  });
});

test("加密资源引用缺少 fingerprint 时解析失败", () => {
  expect(parseResourceReference("yuque-resource://yuque/images/a.png?kind=image&enc=age-v1")).toBeNull();
});

test("创建并解析本地存储资源引用", () => {
  const ref = createResourceReference({
    provider: "local",
    storageId: "local",
    bucket: "local",
    key: "images/a.png",
    kind: "image",
  });

  expect(parseResourceReference(ref)).toEqual({
    provider: "local",
    storageId: "local",
    bucket: "local",
    key: "images/a.png",
    kind: "image",
  });
});

test("未知 provider 的资源引用不会导致解析异常", () => {
  expect(parseResourceReference("yuque-resource://local/images/a.png?provider=ftp&kind=image")).toBeNull();
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

test("打开文档时不会预加载附件卡片资源", async () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "测试文件2.pdf",
    size: 43325,
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: ref, name: "测试文件2.pdf", size: 43325 }))}`;
  const content = `<card name="file" value="${value}"></card>`;
  const preparePreview = vi.fn(async () => "asset://preview/a.pdf");

  const hydrated = await hydrateLakeResources(content, preparePreview);

  expect(preparePreview).not.toHaveBeenCalled();
  expect(decodeURIComponent(hydrated)).toContain("测试文件2.pdf");
  expect(decodeURIComponent(hydrated)).toContain("yuque-resource://");
});

test("打开文档可按需收集附件卡片资源", () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "测试文件2.pdf",
    size: 43325,
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: ref, name: "测试文件2.pdf", size: 43325 }))}`;
  const content = `<card name="file" value="${value}"></card>`;

  expect(hydrateLakeResourcesWithPreviews(content, [{ resourceRef: ref, previewUrl: "asset://preview/a.pdf" }])).not.toContain("asset://preview/a.pdf");
  expect(decodeURIComponent(hydrateLakeResourcesWithPreviews(content, [{ resourceRef: ref, previewUrl: "asset://preview/a.pdf" }], { includeFileCards: true }))).toContain("asset://preview/a.pdf");
  expect(collectResourceReferences(content)).toEqual([]);
  expect(collectResourceReferences(content, { includeFileCards: true })).toEqual([ref]);
});

test("附件卡片保存时仍会把预览地址还原为私有资源引用", () => {
  const ref = createResourceReference({
    bucket: "yuque",
    key: "files/a.pdf",
    kind: "file",
    name: "测试文件2.pdf",
    size: 43325,
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: "asset://preview/a.pdf", name: "测试文件2.pdf", size: 43325 }))}`;
  const content = `<card name="file" value="${value}"></card>`;
  const dehydrated = dehydrateLakeResources(content, [{ resourceRef: ref, previewUrl: "asset://preview/a.pdf" }]);

  expect(decodeURIComponent(dehydrated)).toContain("测试文件2.pdf");
  expect(decodeURIComponent(dehydrated)).toContain("yuque-resource://");
  expect(decodeURIComponent(dehydrated)).not.toContain("asset://preview/a.pdf");
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
    "https://oss.example.test/yuque/files/2026/04/test-file.pdf",
    {
      bucket: "yuque",
      publicBaseUrl: "https://oss.example.test/yuque",
      imagePrefix: "images",
      filePrefix: "files",
    },
    {
      kind: "file",
      name: "测试文件2.pdf",
    },
  );

  expect(parseResourceReference(ref ?? "")).toEqual({
    bucket: "yuque",
    key: "files/2026/04/test-file.pdf",
    kind: "file",
    name: "测试文件2.pdf",
    size: undefined,
    mimeType: undefined,
  });
});

test("非当前公共访问地址不会被还原为私有资源引用", () => {
  const ref = resourceReferenceFromPublicUrl(
    "https://example.com/files/a.pdf",
    {
      bucket: "yuque",
      publicBaseUrl: "https://oss.example.test/yuque",
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

test("资源预览并发数限制在 4 到 8 之间", () => {
  expect(normalizeResourcePreviewConcurrency(1)).toBe(4);
  expect(normalizeResourcePreviewConcurrency(6)).toBe(6);
  expect(normalizeResourcePreviewConcurrency(12)).toBe(8);
});

test("资源预览队列按指定并发执行", async () => {
  let active = 0;
  let maxActive = 0;
  await runResourcePreviewQueue(["a", "b", "c", "d", "e", "f"], 4, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
  });

  expect(maxActive).toBe(4);
});
