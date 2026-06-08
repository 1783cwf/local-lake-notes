import {
  changeMultidimensionalFieldType,
  createDefaultMultidimensionalTableDocument,
  createEmptyMultidimensionalTableRecord,
  deleteMultidimensionalField,
  deleteMultidimensionalRecord,
  formatTimeFieldValue,
  importPastedMultidimensionalTableData,
  parseMultidimensionalTableDocument,
  reorderMultidimensionalFields,
  serializeMultidimensionalTableDocument,
  updateMultidimensionalFieldOptions,
  updateMultidimensionalFieldTimeFormat,
  updateMultidimensionalRecordBody,
} from "./multidimensionalTableDocument";

test("空内容会生成默认多维表格模板", () => {
  const document = parseMultidimensionalTableDocument("");

  expect(document.kind).toBe("multidimensional-table");
  expect(document.fields.map((field) => field.name)).toEqual([
    "标题",
    "状态",
    "主要内容",
    "日期",
    "附件",
  ]);
  expect(document.fields.find((field) => field.id === "status")?.options?.map((option) => option.label)).toEqual([
    "单选1",
    "单选2",
  ]);
  expect(document.views.map((view) => view.type)).toEqual(["table", "board"]);
  expect(document.activeViewId).toBe("view-board");
});

test("有效多维表格 JSON 可以稳定解析和序列化", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "测试记录1",
    status: "status-single-1",
  });
  const content = serializeMultidimensionalTableDocument({ ...source, records: [record] });
  const parsed = parseMultidimensionalTableDocument(content);

  expect(parsed.records[0].values.title).toBe("测试记录1");
  expect(parsed.records[0].values.status).toBe("status-single-1");
  expect(serializeMultidimensionalTableDocument(parsed)).toContain("\"kind\": \"multidimensional-table\"");
});

test("缺失视图配置时会补齐表格和看板视图", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const parsed = parseMultidimensionalTableDocument(JSON.stringify({
    kind: "multidimensional-table",
    version: 1,
    fields: source.fields,
    records: [],
  }));

  expect(parsed.views.map((view) => view.type)).toEqual(["table", "board"]);
  expect(parsed.activeViewId).toBe("view-table");
});

test("错误 kind 或版本会给出明确错误", () => {
  expect(() => parseMultidimensionalTableDocument("{}")).toThrow("缺少 kind");
  expect(() => parseMultidimensionalTableDocument(JSON.stringify({
    kind: "multidimensional-table",
    version: 2,
  }))).toThrow("不支持的版本");
});

test("旧版日期字段会迁移为时间字段", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const parsed = parseMultidimensionalTableDocument(JSON.stringify({
    kind: "multidimensional-table",
    version: 1,
    fields: [
      ...source.fields,
      { id: "legacyDate", name: "旧日期", type: "date" },
    ],
    records: [],
    views: source.views,
    activeViewId: source.activeViewId,
  }));

  expect(parsed.fields.find((field) => field.id === "legacyDate")?.type).toBe("time");
});

test("时间字段会按配置格式化展示值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const nextDocument = updateMultidimensionalFieldTimeFormat(source, "date", "yyyy年m月d日");
  const field = nextDocument.fields.find((currentField) => currentField.id === "date")!;

  expect(formatTimeFieldValue("2026-05-07T12:30", field)).toBe("2026年5月7日");
});

test("时间字段支持纯时间格式", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const nextDocument = updateMultidimensionalFieldTimeFormat(source, "date", "hh:mm");
  const field = nextDocument.fields.find((currentField) => currentField.id === "date")!;

  expect(formatTimeFieldValue("2026-05-07T12:30", field)).toBe("12:30");
  expect(formatTimeFieldValue("7:05", field)).toBe("07:05");
});

test("字段删除会同步清理记录值和看板视图引用", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "测试记录1",
    date: "2026-05-07T12:30",
  });
  const deleted = deleteMultidimensionalField({
    ...source,
    records: [record],
    views: source.views.map((view) => view.type === "board"
      ? { ...view, sortFieldId: "date", sortDirection: "desc" }
      : view),
  }, "date");

  expect(deleted.fields.some((field) => field.id === "date")).toBe(false);
  expect(deleted.records[0].values).not.toHaveProperty("date");
  const boardView = deleted.views.find((view) => view.type === "board");
  expect(boardView?.cardFieldIds).not.toContain("date");
  expect(boardView?.sortFieldId).toBeUndefined();
  expect(boardView?.sortDirection).toBeUndefined();
});

test("视图排序配置会解析保存并忽略失效字段", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const parsed = parseMultidimensionalTableDocument(JSON.stringify({
    ...source,
    views: source.views.map((view) => view.type === "table"
      ? { ...view, sortFieldId: "title", sortDirection: "desc" }
      : { ...view, sortFieldId: "missing", sortDirection: "desc" }),
  }));

  const tableView = parsed.views.find((view) => view.type === "table");
  const boardView = parsed.views.find((view) => view.type === "board");
  expect(tableView?.sortFieldId).toBe("title");
  expect(tableView?.sortDirection).toBe("desc");
  expect(boardView?.sortFieldId).toBeUndefined();
  expect(boardView?.sortDirection).toBeUndefined();
  expect(serializeMultidimensionalTableDocument(parsed)).toContain("\"sortFieldId\": \"title\"");
});

test("看板隐藏空分组配置会解析并保存", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const parsed = parseMultidimensionalTableDocument(JSON.stringify({
    ...source,
    views: source.views.map((view) => view.type === "board"
      ? { ...view, hideEmptyGroups: true }
      : view),
  }));

  const boardView = parsed.views.find((view) => view.type === "board");
  expect(boardView?.hideEmptyGroups).toBe(true);
  expect(serializeMultidimensionalTableDocument(parsed)).toContain("\"hideEmptyGroups\": true");
});

test("看板显示标题配置会解析并保存", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const parsed = parseMultidimensionalTableDocument(JSON.stringify({
    ...source,
    views: source.views.map((view) => view.type === "board"
      ? { ...view, showCardTitle: false }
      : view),
  }));

  const boardView = parsed.views.find((view) => view.type === "board");
  expect(boardView?.showCardTitle).toBe(false);
  expect(serializeMultidimensionalTableDocument(parsed)).toContain("\"showCardTitle\": false");
});

test("字段排序只调整字段顺序并保留记录值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "排序测试",
    attachment: "/tmp/demo.pdf",
  });
  const nextDocument = reorderMultidimensionalFields({ ...source, records: [record] }, "attachment", "title");

  expect(nextDocument.fields.map((field) => field.id).slice(0, 2)).toEqual(["attachment", "title"]);
  expect(nextDocument.records[0].values.title).toBe("排序测试");
  expect(nextDocument.records[0].values.attachment).toBe("/tmp/demo.pdf");
});

test("粘贴导入会匹配已有字段并创建缺失字段", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const result = importPastedMultidimensionalTableData(
    source,
    "标题\t附件\t负责人\n导入任务1\t/tmp/demo.pdf\t张三\n导入任务2\t\t李四",
  );
  const ownerField = result.document.fields.find((field) => field.name === "负责人");

  expect(result.importedRecordCount).toBe(2);
  expect(result.matchedFieldCount).toBe(2);
  expect(result.createdFieldCount).toBe(1);
  expect(ownerField?.type).toBe("text");
  expect(result.document.records).toHaveLength(2);
  expect(result.document.records[0].values.title).toBe("导入任务1");
  expect(result.document.records[0].values.attachment).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "demo.pdf" }),
  ]));
  expect(ownerField ? result.document.records[0].values[ownerField.id] : "").toBe("张三");
});

test("导入单选字段会按文本匹配或创建选项", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const result = importPastedMultidimensionalTableData(source, "标题\t状态\n任务1\t单选1\n任务2\t进行中");
  const statusField = result.document.fields.find((field) => field.id === "status")!;
  const createdOption = statusField.options?.find((option) => option.label === "进行中");

  expect(result.createdFieldCount).toBe(0);
  expect(createdOption).toBeTruthy();
  expect(result.document.records[0].values.status).toBe("status-single-1");
  expect(result.document.records[1].values.status).toBe(createdOption?.id);
});

test("删除单选和多选字段选项会同步清理记录值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "测试记录1",
    status: "status-single-1",
  });
  const withoutStatusPending = updateMultidimensionalFieldOptions(
    { ...source, records: [record] },
    "status",
    source.fields.find((field) => field.id === "status")!.options!.filter((option) => option.id !== "status-single-1"),
  );

  expect(withoutStatusPending.records[0].values.status).toBe("");
});

test("字段类型切换到时间时会补齐默认时间格式", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const nextDocument = changeMultidimensionalFieldType(source, "description", "time");

  expect(nextDocument.fields.find((field) => field.id === "description")?.timeFormat).toBe("yyyy/mm/dd hh:mm");
});

test("附件字段会保存结构化附件并兼容旧文本值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    attachment: [{
      id: "file-1",
      name: "测试文件1.pdf",
      url: "yuque-resource://bucket/files/a.pdf?kind=file",
      resourceRef: "yuque-resource://bucket/files/a.pdf?kind=file",
      size: 12,
    }],
  });
  const parsed = parseMultidimensionalTableDocument(serializeMultidimensionalTableDocument({ ...source, records: [record] }));
  const legacyParsed = parseMultidimensionalTableDocument(JSON.stringify({
    kind: "multidimensional-table",
    version: 1,
    fields: source.fields,
    records: [{
      id: "legacy",
      values: { attachment: "/tmp/测试旧文件.docx" },
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }],
    views: source.views,
    activeViewId: source.activeViewId,
  }));

  expect(parsed.records[0].values.attachment).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "测试文件1.pdf" }),
  ]));
  expect(legacyParsed.records[0].values.attachment).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "测试旧文件.docx" }),
  ]));
});

test("记录正文会随记录一起保存", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, { title: "正文测试" });
  const nextDocument = updateMultidimensionalRecordBody({ ...source, records: [record] }, record.id, "<p>正文内容</p>");

  expect(nextDocument.records[0].body).toBe("<p>正文内容</p>");
  expect(serializeMultidimensionalTableDocument(nextDocument)).toContain("正文内容");
});

test("可以按记录 id 删除多维表格记录", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const firstRecord = createEmptyMultidimensionalTableRecord(source.fields, { title: "保留记录" });
  const secondRecord = createEmptyMultidimensionalTableRecord(source.fields, { title: "删除记录" });

  const nextDocument = deleteMultidimensionalRecord({ ...source, records: [firstRecord, secondRecord] }, secondRecord.id);

  expect(nextDocument.records).toHaveLength(1);
  expect(nextDocument.records[0].id).toBe(firstRecord.id);
});
