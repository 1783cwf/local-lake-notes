import { beforeEach, describe, expect, test } from "vitest";

import {
  createLakeDocument,
  createWorkspaceRoot,
  forgetWorkspaceRoot,
  getRecentWorkspace,
  listKnownWorkspaces,
  listLakeDocuments,
  readLakeDocument,
  setWorkspaceRoot,
  writeLakeDocument,
} from "./tauri";

describe("tauri browser workspace fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("从旧单知识库缓存迁移到已知知识库列表", async () => {
    window.localStorage.setItem(
      "yuque-lake-notes.browser-workspace",
      JSON.stringify({
        root: "/browser-preview/legacy",
        directories: [],
        documents: [{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", kind: "lake", size: 1 }],
        order: ["document:a.lake"],
      }),
    );

    const recent = await getRecentWorkspace();
    const known = await listKnownWorkspaces();

    expect(recent?.root).toBe("/browser-preview/legacy");
    expect(recent?.documents.map((document) => document.path)).toEqual(["a.lake"]);
    expect(known).toMatchObject([{ root: "/browser-preview/legacy", name: "legacy" }]);
  });

  test("支持添加和切换多个浏览器知识库", async () => {
    await setWorkspaceRoot("/browser-preview/work");
    await createLakeDocument("工作", "");
    await setWorkspaceRoot("/browser-preview/life");
    await createLakeDocument("生活", "");

    const known = await listKnownWorkspaces();
    expect(known.map((workspace) => workspace.root)).toEqual([
      "/browser-preview/life",
      "/browser-preview/work",
    ]);

    await setWorkspaceRoot("/browser-preview/work");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["工作.lake"]);

    await setWorkspaceRoot("/browser-preview/life");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["生活.lake"]);
  });

  test("新建知识库会创建新的 root 并激活", async () => {
    const workspace = await createWorkspaceRoot("/browser-preview", "项目 资料");

    expect(workspace.root).toBe("/browser-preview/项目-资料");
    expect((await getRecentWorkspace())?.root).toBe("/browser-preview/项目-资料");
    expect(await listKnownWorkspaces()).toMatchObject([
      { root: "/browser-preview/项目-资料", name: "项目-资料" },
    ]);
  });

  test("不同知识库中的同名文档内容互不覆盖", async () => {
    await setWorkspaceRoot("/browser-preview/a");
    const first = await createLakeDocument("同名", "");
    await writeLakeDocument(first.createdDocument.path, "<p>a</p>");

    await setWorkspaceRoot("/browser-preview/b");
    const second = await createLakeDocument("同名", "");
    await writeLakeDocument(second.createdDocument.path, "<p>b</p>");

    await setWorkspaceRoot("/browser-preview/a");
    expect(await readLakeDocument("同名.lake")).toBe("<p>a</p>");

    await setWorkspaceRoot("/browser-preview/b");
    expect(await readLakeDocument("同名.lake")).toBe("<p>b</p>");
  });

  test("从列表移除知识库不会影响其他知识库", async () => {
    await setWorkspaceRoot("/browser-preview/a");
    await createLakeDocument("A", "");
    await setWorkspaceRoot("/browser-preview/b");
    await createLakeDocument("B", "");

    const known = await forgetWorkspaceRoot("/browser-preview/b");

    expect(known.map((workspace) => workspace.root)).toEqual(["/browser-preview/a"]);
    expect(await getRecentWorkspace()).toBeNull();

    await setWorkspaceRoot("/browser-preview/a");
    expect((await listLakeDocuments()).documents.map((document) => document.path)).toEqual(["A.lake"]);
  });
});
