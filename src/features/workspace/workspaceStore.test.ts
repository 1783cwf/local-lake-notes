import {
  buildDocumentTree,
  documentTitleFromPath,
  flattenTreeOrder,
  type WorkspaceDirectory,
  type WorkspaceDocument,
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
