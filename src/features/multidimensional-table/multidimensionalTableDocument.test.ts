import {
  changeMultidimensionalFieldType,
  createDefaultMultidimensionalTableDocument,
  createEmptyMultidimensionalTableRecord,
  deleteMultidimensionalField,
  formatTimeFieldValue,
  parseMultidimensionalTableDocument,
  serializeMultidimensionalTableDocument,
  updateMultidimensionalFieldOptions,
  updateMultidimensionalFieldTimeFormat,
  updateMultidimensionalRecordBody,
} from "./multidimensionalTableDocument";

test("空内容会生成默认项目管理模板", () => {
  const document = parseMultidimensionalTableDocument("");

  expect(document.kind).toBe("multidimensional-table");
  expect(document.fields.map((field) => field.name)).toEqual([
    "标题",
    "上线状态",
    "类型",
    "主要内容",
    "预估工时",
    "进度",
    "上线时间",
    "链接",
    "附件",
  ]);
  expect(document.views.map((view) => view.type)).toEqual(["table", "board"]);
  expect(document.activeViewId).toBe("view-board");
});

test("有效多维表格 JSON 可以稳定解析和序列化", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "共性公文迁移到湘潭",
    status: "status-pending",
    type: ["type-dual-center"],
  });
  const content = serializeMultidimensionalTableDocument({ ...source, records: [record] });
  const parsed = parseMultidimensionalTableDocument(content);

  expect(parsed.records[0].values.title).toBe("共性公文迁移到湘潭");
  expect(parsed.records[0].values.status).toBe("status-pending");
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
  const nextDocument = updateMultidimensionalFieldTimeFormat(source, "launchTime", "yyyy年m月d日");
  const field = nextDocument.fields.find((currentField) => currentField.id === "launchTime")!;

  expect(formatTimeFieldValue("2026-05-07T12:30", field)).toBe("2026年5月7日");
});

test("字段删除会同步清理记录值和看板视图引用", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "共性公文迁移到湘潭",
    estimate: "3",
  });
  const deleted = deleteMultidimensionalField({ ...source, records: [record] }, "estimate");

  expect(deleted.fields.some((field) => field.id === "estimate")).toBe(false);
  expect(deleted.records[0].values).not.toHaveProperty("estimate");
  expect(deleted.views.find((view) => view.type === "board")?.cardFieldIds).not.toContain("estimate");
});

test("删除单选和多选字段选项会同步清理记录值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    title: "共性公文迁移到湘潭",
    status: "status-pending",
    type: ["type-dual-center", "type-gateway"],
  });
  const withoutStatusPending = updateMultidimensionalFieldOptions(
    { ...source, records: [record] },
    "status",
    source.fields.find((field) => field.id === "status")!.options!.filter((option) => option.id !== "status-pending"),
  );
  const withoutTypeGateway = updateMultidimensionalFieldOptions(
    withoutStatusPending,
    "type",
    source.fields.find((field) => field.id === "type")!.options!.filter((option) => option.id !== "type-gateway"),
  );

  expect(withoutTypeGateway.records[0].values.status).toBe("");
  expect(withoutTypeGateway.records[0].values.type).toEqual(["type-dual-center"]);
});

test("字段类型切换到时间时会补齐默认时间格式", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const nextDocument = changeMultidimensionalFieldType(source, "estimate", "time");

  expect(nextDocument.fields.find((field) => field.id === "estimate")?.timeFormat).toBe("yyyy/mm/dd hh:mm");
});

test("附件字段会保存结构化附件并兼容旧文本值", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, {
    attachment: [{
      id: "file-1",
      name: "需求说明.pdf",
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
      values: { attachment: "/tmp/旧附件.docx" },
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    }],
    views: source.views,
    activeViewId: source.activeViewId,
  }));

  expect(parsed.records[0].values.attachment).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "需求说明.pdf" }),
  ]));
  expect(legacyParsed.records[0].values.attachment).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "旧附件.docx" }),
  ]));
});

test("记录正文会随记录一起保存", () => {
  const source = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(source.fields, { title: "正文测试" });
  const nextDocument = updateMultidimensionalRecordBody({ ...source, records: [record] }, record.id, "<p>正文内容</p>");

  expect(nextDocument.records[0].body).toBe("<p>正文内容</p>");
  expect(serializeMultidimensionalTableDocument(nextDocument)).toContain("正文内容");
});
