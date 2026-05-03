import {
  createResourceReference,
  dehydrateLakeResources,
  hydrateLakeResources,
  parseResourceReference,
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
    name: "八期部署资源鲁池.pdf",
    size: 43325,
  });
  const value = `data:${encodeURIComponent(JSON.stringify({ src: ref, name: "八期部署资源鲁池.pdf", size: 43325 }))}`;
  const content = `<card name="file" value="${value}"></card>`;

  const hydrated = await hydrateLakeResources(content, async () => "asset://preview/a.pdf");
  expect(decodeURIComponent(hydrated)).toContain("八期部署资源鲁池.pdf");
  expect(decodeURIComponent(hydrated)).toContain("asset://preview/a.pdf");

  const dehydrated = dehydrateLakeResources(hydrated, [{ resourceRef: ref, previewUrl: "asset://preview/a.pdf" }]);
  expect(decodeURIComponent(dehydrated)).toContain("八期部署资源鲁池.pdf");
  expect(decodeURIComponent(dehydrated)).toContain("yuque-resource://");
});

test("外部链接不会被误改", async () => {
  const content = `<p><img src="https://example.com/a.png"></p>`;

  await expect(hydrateLakeResources(content, async () => "asset://preview/a.png")).resolves.toBe(content);
  expect(dehydrateLakeResources(content, [])).toBe(content);
});
