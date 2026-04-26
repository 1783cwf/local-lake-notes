import indexHtml from "../index.html?raw";
import { buildDocumentTree } from "../src/features/workspace/workspaceStore";

test("E2E smoke 基础文档树链路可用", () => {
  const tree = buildDocumentTree([
    {
      id: "guide.lake",
      path: "guide.lake",
      name: "guide",
      parentPath: "",
      size: 10,
    },
  ]);

  expect(tree).toHaveLength(1);
  expect(tree[0].type).toBe("document");
});

test("本地语雀编辑器资源在 body 生成后加载", () => {
  const rootIndex = indexHtml.indexOf('<div id="root"></div>');
  const lakeRuntimeIndex = indexHtml.indexOf("/vendor/lakex-doc/doc.umd.js");

  expect(lakeRuntimeIndex).toBeGreaterThan(rootIndex);
});
