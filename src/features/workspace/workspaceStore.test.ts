import {
  applyWorkspaceMove,
  buildDocumentTree,
  documentTitleFromPath,
  flattenTreeOrder,
  resolveWorkspaceMove,
  type WorkspaceDirectory,
  type WorkspaceDocument,
  type WorkspacePayload,
} from "./workspaceStore";

const doc = (path: string, parentPath = ""): WorkspaceDocument => ({
  id: path,
  path,
  name: documentTitleFromPath(path),
  parentPath,
  kind: path.endsWith(".dbtable.json") ? "multidimensional-table" : path.endsWith(".json") ? "spreadsheet" : "lake",
  size: 1,
});

const dir = (
  path: string,
  parentPath = "",
  options: { isDocumentChildContainer?: boolean } = {},
): WorkspaceDirectory => ({
  id: path,
  path,
  name: path.split("/").pop() ?? path,
  parentPath,
  ...options,
});

test("按目录构建文档树并优先显示文件夹", () => {
  const tree = buildDocumentTree(
    [
      doc("b.lake"),
      doc("notes/a.lake", "notes"),
      doc("notes/budget.json", "notes"),
      doc("notes/deep/c.lake", "notes/deep"),
    ],
    [dir("notes"), dir("notes/deep", "notes")],
  );

  expect(tree.map((node) => node.name)).toEqual(["notes", "b"]);
  expect(tree[0].children.map((node) => node.name)).toEqual(["deep", "a", "budget"]);
  expect(tree[0].children.find((node) => node.name === "budget")?.document?.kind).toBe("spreadsheet");
});

test("按保存的拖拽顺序排列同级节点", () => {
  const tree = buildDocumentTree(
    [doc("a.lake"), doc("b.lake")],
    [],
    ["document:b.lake", "document:a.lake"],
  );

  expect(tree.map((node) => node.name)).toEqual(["b", "a"]);
  expect(flattenTreeOrder(tree)).toEqual(["document:b.lake", "document:a.lake"]);
});

test("文档同名目录会合并为文档子级", () => {
  const tree = buildDocumentTree(
    [doc("测试文件1.lake"), doc("测试文件1/测试文件2.lake", "测试文件1")],
    [dir("测试文件1")],
    ["document:测试文件1.lake", "document:测试文件1/测试文件2.lake"],
  );

  expect(tree).toHaveLength(1);
  expect(tree[0]).toMatchObject({
    itemId: "document:测试文件1.lake",
    type: "document",
    name: "测试文件1",
  });
  expect(tree[0].children.map((node) => node.itemId)).toEqual(["document:测试文件1/测试文件2.lake"]);
});

test("带内部标记的空同名目录会作为文档子级容器隐藏", () => {
  const tree = buildDocumentTree(
    [doc("测试文件1.lake")],
    [dir("测试文件1", "", { isDocumentChildContainer: true })],
  );

  expect(tree).toHaveLength(1);
  expect(tree[0]).toMatchObject({
    itemId: "document:测试文件1.lake",
    type: "document",
    name: "测试文件1",
  });
});

test("普通空同名目录不会误合并为文档子级容器", () => {
  const tree = buildDocumentTree(
    [doc("测试文件1.lake")],
    [dir("测试文件1")],
  );

  expect(tree.map((node) => node.itemId)).toEqual(["folder:测试文件1", "document:测试文件1.lake"]);
});

test("从 .lake 路径提取文档标题", () => {
  expect(documentTitleFromPath("nested/测试文件1.lake")).toBe("测试文件1");
});

test("从 Univer 快照 JSON 路径提取表格标题", () => {
  expect(documentTitleFromPath("nested/测试表格1.json")).toBe("测试表格1");
});

test("从多维表格 JSON 路径提取标题", () => {
  expect(documentTitleFromPath("nested/测试表格2.dbtable.json")).toBe("测试表格2");
});

test("计算文档拖入目录的目标父目录和乐观路径", () => {
  const workspace = workspacePayload(
    [doc("a.json"), doc("notes/b.lake", "notes")],
    [dir("notes")],
  );
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);

  const move = resolveWorkspaceMove(tree, "document:a.json", {
    placement: "inside",
    targetId: "folder:notes",
  });

  expect(move).toMatchObject({
    ok: true,
    noop: false,
    targetParentPath: "notes",
    targetPath: "notes/a.json",
  });
  expect(move.ok && applyWorkspaceMove(workspace, move).documents.find((entry) => entry.name === "a")?.path)
    .toBe("notes/a.json");
});

test("计算文档拖入另一个文档的目标父目录", () => {
  const workspace = workspacePayload(
    [doc("测试文件1.lake"), doc("测试文件3.lake")],
    [],
    ["document:测试文件1.lake", "document:测试文件3.lake"],
  );
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);

  const move = resolveWorkspaceMove(tree, "document:测试文件3.lake", {
    placement: "inside",
    targetId: "document:测试文件1.lake",
  });
  const movedWorkspace = move.ok ? applyWorkspaceMove(workspace, move) : workspace;

  expect(move).toMatchObject({
    ok: true,
    targetParentPath: "测试文件1",
    targetPath: "测试文件1/测试文件3.lake",
  });
  expect(movedWorkspace.documents.find((entry) => entry.name === "测试文件3")?.parentPath).toBe("测试文件1");
});

test("移动带子级的文档时同步迁移同名子目录内容", () => {
  const workspace = workspacePayload(
    [
      doc("测试文件1.lake"),
      doc("测试文件1/测试文件2.lake", "测试文件1"),
      doc("测试文件4.lake"),
    ],
    [dir("测试文件1")],
    [
      "document:测试文件4.lake",
      "document:测试文件1.lake",
      "document:测试文件1/测试文件2.lake",
    ],
  );
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);

  const move = resolveWorkspaceMove(tree, "document:测试文件1.lake", {
    placement: "inside",
    targetId: "document:测试文件4.lake",
  });
  const movedWorkspace = move.ok ? applyWorkspaceMove(workspace, move) : workspace;

  expect(move).toMatchObject({
    ok: true,
    targetParentPath: "测试文件4",
    targetPath: "测试文件4/测试文件1.lake",
  });
  expect(movedWorkspace.directories.map((entry) => entry.path)).toEqual(["测试文件4/测试文件1"]);
  expect(movedWorkspace.documents.map((entry) => entry.path)).toEqual([
    "测试文件4/测试文件1.lake",
    "测试文件4/测试文件1/测试文件2.lake",
    "测试文件4.lake",
  ]);
});

test("计算文档拖到根列表末尾", () => {
  const tree = buildDocumentTree(
    [doc("notes/a.lake", "notes"), doc("b.lake")],
    [dir("notes")],
    ["folder:notes", "document:notes/a.lake", "document:b.lake"],
  );

  const move = resolveWorkspaceMove(tree, "document:notes/a.lake", { placement: "root-end" });

  expect(move).toMatchObject({
    ok: true,
    targetParentPath: "",
    targetPath: "a.lake",
    order: ["folder:notes", "document:b.lake", "document:notes/a.lake"],
  });
});

test("计算目录拖到另一个目录内部并同步子路径", () => {
  const workspace = workspacePayload(
    [doc("notes/deep/a.lake", "notes/deep")],
    [dir("archive"), dir("notes"), dir("notes/deep", "notes")],
  );
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);

  const move = resolveWorkspaceMove(tree, "folder:notes", {
    placement: "inside",
    targetId: "folder:archive",
  });
  const movedWorkspace = move.ok ? applyWorkspaceMove(workspace, move) : workspace;

  expect(move).toMatchObject({
    ok: true,
    targetParentPath: "archive",
    targetPath: "archive/notes",
  });
  expect(movedWorkspace.directories.map((entry) => entry.path)).toEqual([
    "archive",
    "archive/notes",
    "archive/notes/deep",
  ]);
  expect(movedWorkspace.documents[0].path).toBe("archive/notes/deep/a.lake");
});

test("阻止目录拖入自身或子目录", () => {
  const tree = buildDocumentTree(
    [doc("notes/deep/a.lake", "notes/deep")],
    [dir("notes"), dir("notes/deep", "notes")],
  );

  expect(resolveWorkspaceMove(tree, "folder:notes", {
    placement: "inside",
    targetId: "folder:notes",
  })).toMatchObject({ ok: false });
  expect(resolveWorkspaceMove(tree, "folder:notes", {
    placement: "inside",
    targetId: "folder:notes/deep",
  })).toMatchObject({ ok: false });
});

test("阻止文档拖入自身子级", () => {
  const tree = buildDocumentTree(
    [doc("测试文件1.lake"), doc("测试文件1/测试文件2.lake", "测试文件1")],
    [dir("测试文件1")],
  );

  expect(resolveWorkspaceMove(tree, "document:测试文件1.lake", {
    placement: "inside",
    targetId: "document:测试文件1/测试文件2.lake",
  })).toMatchObject({ ok: false });
});

test("同一位置拖拽标记为 no-op", () => {
  const tree = buildDocumentTree(
    [doc("a.lake"), doc("b.lake")],
    [],
    ["document:a.lake", "document:b.lake"],
  );

  const move = resolveWorkspaceMove(tree, "document:b.lake", {
    placement: "after",
    targetId: "document:a.lake",
  });

  expect(move).toMatchObject({ ok: true, noop: true });
});

function workspacePayload(
  documents: WorkspaceDocument[],
  directories: WorkspaceDirectory[] = [],
  order = flattenTreeOrder(buildDocumentTree(documents, directories)),
): WorkspacePayload {
  return {
    root: "/tmp/kb",
    directories,
    documents,
    order,
  };
}
