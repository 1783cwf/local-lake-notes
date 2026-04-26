import { buildDocumentTree, documentTitleFromPath, type WorkspaceDocument } from "./workspaceStore";

const doc = (path: string, parentPath = ""): WorkspaceDocument => ({
  id: path,
  path,
  name: documentTitleFromPath(path),
  parentPath,
  size: 1,
});

test("按目录构建 Lake 文档树并优先显示文件夹", () => {
  const tree = buildDocumentTree([
    doc("b.lake"),
    doc("notes/a.lake", "notes"),
    doc("notes/deep/c.lake", "notes/deep"),
  ]);

  expect(tree.map((node) => node.name)).toEqual(["notes", "b"]);
  expect(tree[0].children.map((node) => node.name)).toEqual(["deep", "a"]);
});

test("从 .lake 路径提取文档标题", () => {
  expect(documentTitleFromPath("nested/高级工程师的要求.lake")).toBe("高级工程师的要求");
});
