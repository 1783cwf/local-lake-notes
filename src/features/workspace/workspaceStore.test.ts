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
  size: 1,
});

const dir = (path: string, parentPath = ""): WorkspaceDirectory => ({
  id: path,
  path,
  name: path.split("/").pop() ?? path,
  parentPath,
});

test("按目录构建 Lake 文档树并优先显示文件夹", () => {
  const tree = buildDocumentTree(
    [doc("b.lake"), doc("notes/a.lake", "notes"), doc("notes/deep/c.lake", "notes/deep")],
    [dir("notes"), dir("notes/deep", "notes")],
  );

  expect(tree.map((node) => node.name)).toEqual(["notes", "b"]);
  expect(tree[0].children.map((node) => node.name)).toEqual(["deep", "a"]);
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

test("从 .lake 路径提取文档标题", () => {
  expect(documentTitleFromPath("nested/高级工程师的要求.lake")).toBe("高级工程师的要求");
});

test("计算文档拖入目录的目标父目录和乐观路径", () => {
  const workspace = workspacePayload(
    [doc("a.lake"), doc("notes/b.lake", "notes")],
    [dir("notes")],
  );
  const tree = buildDocumentTree(workspace.documents, workspace.directories, workspace.order);

  const move = resolveWorkspaceMove(tree, "document:a.lake", {
    placement: "inside",
    targetId: "folder:notes",
  });

  expect(move).toMatchObject({
    ok: true,
    noop: false,
    targetParentPath: "notes",
    targetPath: "notes/a.lake",
  });
  expect(move.ok && applyWorkspaceMove(workspace, move).documents.find((entry) => entry.name === "a")?.path)
    .toBe("notes/a.lake");
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
