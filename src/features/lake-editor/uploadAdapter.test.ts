import { createEditorFileUpload, createEditorImageUpload } from "./uploadAdapter";

test("把 File 转成 Tauri 上传输入并返回编辑器需要的数据", async () => {
  const uploadImage = vi.fn(async () => ({
    url: "https://oss.example/images/a.png",
    size: 4,
    filename: "a.png",
  }));
  const file = new File([new Uint8Array([1, 2, 3, 4])], "a.png", { type: "image/png" });

  const result = await createEditorImageUpload({ type: "file", data: file }, uploadImage);

  expect(uploadImage).toHaveBeenCalledWith({
    bytes: [1, 2, 3, 4],
    filename: "a.png",
    mimeType: "image/png",
  });
  expect(result.url).toBe("https://oss.example/images/a.png");
});

test("支持 data URL 图片上传", async () => {
  const uploadImage = vi.fn(async () => ({
    url: "https://oss.example/images/image.png",
    size: 2,
    filename: "image.png",
  }));

  await createEditorImageUpload({ type: "base64", data: "data:image/png;base64,AQI=" }, uploadImage);

  expect(uploadImage).toHaveBeenCalledWith({
    bytes: [1, 2],
    filename: "image.png",
    mimeType: "image/png",
  });
});

test("远程 URL 转存第一版明确失败", async () => {
  await expect(
    createEditorImageUpload({ type: "url", data: "https://example.com/a.png" }, vi.fn()),
  ).rejects.toThrow("暂不支持远程图片转存");
});

test("把附件 File 转成 Tauri 上传输入并返回编辑器需要的数据", async () => {
  const uploadFile = vi.fn(async () => ({
    url: "https://oss.example/files/archive.zip",
    size: 4,
    filename: "archive.zip",
    extname: "zip",
  }));
  const file = new File([new Uint8Array([5, 6, 7, 8])], "archive.zip", { type: "application/zip" });

  const result = await createEditorFileUpload(file, uploadFile);

  expect(uploadFile).toHaveBeenCalledWith({
    bytes: [5, 6, 7, 8],
    filename: "archive.zip",
    mimeType: "application/zip",
  });
  expect(result.url).toBe("https://oss.example/files/archive.zip");
  expect(result.extname).toBe("zip");
});
