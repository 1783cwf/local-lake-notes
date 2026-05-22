import { applyAiTablePatch } from "./multidimensionalTableAi";
import { createDefaultMultidimensionalTableDocument } from "../multidimensional-table/multidimensionalTableDocument";

test("应用 AI 字段和记录候选时由本地生成字段记录 ID", () => {
  const document = createDefaultMultidimensionalTableDocument();
  const nextDocument = applyAiTablePatch(document, {
    fields: [
      { name: "优先级", type: "singleSelect", options: ["高", "低"] },
      { name: "标签", type: "multiSelect", options: ["研发"] },
    ],
    records: [
      {
        title: "补齐 AI 助手",
        values: {
          优先级: "高",
          标签: ["研发"],
        },
        body: "来自会议纪要",
      },
    ],
    preferBoard: true,
  });

  const priorityField = nextDocument.fields.find((field) => field.name === "优先级");
  const tagField = nextDocument.fields.find((field) => field.name === "标签");
  expect(priorityField?.id).toMatch(/^field-/);
  expect(tagField?.id).toMatch(/^field-/);
  expect(nextDocument.records).toHaveLength(1);
  expect(nextDocument.records[0].values[priorityField!.id]).toBe(priorityField!.options![0].id);
  expect(nextDocument.records[0].values[tagField!.id]).toEqual([tagField!.options![0].id]);
  expect(nextDocument.activeViewId).toBe("view-board");
});
