import { extractLakeOutline } from "./lakeOutline";

test("从 Lake HTML 内容提取标题大纲", () => {
  expect(extractLakeOutline("<h1>标题</h1><p>正文</p><h2>小节</h2>")).toEqual([
    { id: "heading-0", level: 1, text: "标题" },
    { id: "heading-1", level: 2, text: "小节" },
  ]);
});
