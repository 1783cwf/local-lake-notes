import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultidimensionalTableEditor } from "./MultidimensionalTableEditor";
import type { LakeEditorInstance } from "../lake-editor/editorTypes";
import {
  createDefaultMultidimensionalTableDocument,
  createEmptyMultidimensionalTableRecord,
  type MultidimensionalTableDocument,
  type MultidimensionalTableField,
  serializeMultidimensionalTableDocument,
} from "./multidimensionalTableDocument";

afterEach(() => {
  window.Doc = undefined;
});

const documentEntry = {
  id: "project.dbtable.json",
  path: "project.dbtable.json",
  name: "project",
  parentPath: "",
  size: 1,
  kind: "multidimensional-table" as const,
};

const categoryField: MultidimensionalTableField = {
  id: "category",
  name: "分类",
  type: "multiSelect",
  options: [
    { id: "multi-1", label: "多选1", color: "cyan" },
    { id: "multi-2", label: "多选2", color: "green" },
  ],
};

function tableWithCategory(): MultidimensionalTableDocument {
  const table = createDefaultMultidimensionalTableDocument();
  return {
    ...table,
    fields: [...table.fields, categoryField],
    views: table.views.map((view) => view.type === "board"
      ? { ...view, cardFieldIds: [...(view.cardFieldIds ?? []), categoryField.id] }
      : view),
  };
}

test("默认打开看板视图并能切换到表格视图", async () => {
  const user = userEvent.setup();
  renderEditor();

  expect(screen.getByTestId("multitable-board")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: /表格/ }));

  expect(screen.getByTestId("multitable-grid")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "表格配置" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "字段" })).not.toBeInTheDocument();
});

test("可以在同一个多维表格中新增看板视图并共享原有数据", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("button", { name: "新增看板" }));

  expect(screen.getByRole("tab", { name: /看板 2/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: /测试记录1/ })).toBeInTheDocument();

  await waitFor(() => {
    expect(savedContent).toContain("\"name\": \"看板 2\"");
    expect(savedContent).toContain("\"type\": \"board\"");
  }, { timeout: 1400 });

  const savedDocument = JSON.parse(savedContent);
  expect(savedDocument.views.filter((view: { type: string }) => view.type === "board")).toHaveLength(2);
  expect(savedDocument.records).toHaveLength(1);
});

test("视图页签支持重命名和删除多余看板", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("button", { name: "新增看板" }));
  await user.click(screen.getByRole("button", { name: "看板 2 视图操作" }));
  await user.click(screen.getByRole("menuitem", { name: "重命名" }));
  await user.clear(screen.getByLabelText("重命名视图 看板 2"));
  await user.type(screen.getByLabelText("重命名视图 看板 2"), "测试视图1");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("tab", { name: /测试视图1/ })).toHaveAttribute("aria-selected", "true");
  await waitFor(() => {
    expect(savedContent).toContain("\"name\": \"测试视图1\"");
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "测试视图1 视图操作" }));
  await user.click(screen.getByRole("menuitem", { name: "删除" }));

  expect(screen.queryByRole("tab", { name: /测试视图1/ })).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /进展看板/ })).toHaveAttribute("aria-selected", "true");
  await waitFor(() => {
    const savedDocument = JSON.parse(savedContent);
    expect(savedDocument.views.filter((view: { type: string }) => view.type === "board")).toHaveLength(1);
    expect(savedDocument.activeViewId).toBe("view-board");
  }, { timeout: 1400 });
});

test("唯一表格视图不允许删除", async () => {
  const user = userEvent.setup();
  renderEditor();

  await user.click(screen.getByRole("button", { name: "表格 视图操作" }));

  expect(screen.getByRole("menuitem", { name: "删除" })).toBeDisabled();
});

test("工具栏已移除生成表单并支持搜索筛选排序", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  const table = tableWithCategory();
  const firstRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "B 任务",
    status: "status-single-1",
    category: ["multi-1"],
    description: "测试内容1",
  });
  const secondRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "A 任务",
    status: "status-single-2",
    category: ["multi-2"],
    description: "测试内容2",
  });

  renderEditor({
    onSave,
    content: serializeMultidimensionalTableDocument({ ...table, activeViewId: "view-table", records: [firstRecord, secondRecord] }),
  });

  expect(screen.queryByRole("button", { name: "生成表单" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "搜索" }));
  await user.type(screen.getByLabelText("搜索记录"), "测试内容1");
  expect(screen.getByDisplayValue("B 任务")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("A 任务")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清除条件" }));
  await user.click(screen.getByRole("button", { name: "筛选" }));
  await user.click(screen.getByRole("button", { name: "添加筛选规则" }));
  await user.selectOptions(screen.getByLabelText("筛选字段 1"), "status");
  await user.selectOptions(screen.getByLabelText("筛选值 1"), "status-single-2");
  expect(screen.queryByDisplayValue("B 任务")).not.toBeInTheDocument();
  expect(screen.getByDisplayValue("A 任务")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清除条件" }));
  await user.click(screen.getByRole("button", { name: "排序" }));
  await user.selectOptions(screen.getByLabelText("排序字段"), "title");

  const titleInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".multitable-grid__row input[aria-label='标题']"));
  expect(titleInputs.map((input) => input.value)).toEqual(["A 任务", "B 任务"]);
  await waitFor(() => {
    expect(savedContent).toContain("\"sortFieldId\": \"title\"");
    expect(savedContent).toContain("\"sortDirection\": \"asc\"");
  }, { timeout: 1400 });
});

test("排序条件会保存到当前视图并在重新打开后生效", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  const table = tableWithCategory();
  const firstRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "B 任务",
    status: "status-single-1",
    category: ["multi-1"],
    description: "测试内容1",
  });
  const secondRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "A 任务",
    status: "status-single-2",
    category: ["multi-2"],
    description: "测试内容2",
  });
  const content = serializeMultidimensionalTableDocument({
    ...table,
    activeViewId: "view-table",
    records: [firstRecord, secondRecord],
  });
  const rendered = renderEditor({ onSave, content });

  await user.click(screen.getByRole("button", { name: "排序" }));
  await user.selectOptions(screen.getByLabelText("排序字段"), "title");
  await user.selectOptions(screen.getByLabelText("排序方向"), "desc");

  await waitFor(() => {
    expect(savedContent).toContain("\"sortFieldId\": \"title\"");
    expect(savedContent).toContain("\"sortDirection\": \"desc\"");
  }, { timeout: 1400 });

  rendered.unmount();
  renderEditor({ content: savedContent });

  const titleInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".multitable-grid__row input[aria-label='标题']"));
  expect(titleInputs.map((input) => input.value)).toEqual(["B 任务", "A 任务"]);
  await user.click(screen.getByRole("button", { name: "排序" }));
  expect(screen.getByLabelText("排序字段")).toHaveValue("title");
  expect(screen.getByLabelText("排序方向")).toHaveValue("desc");
});

test("筛选支持多规则并保存到当前视图", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  const table = createDefaultMultidimensionalTableDocument();
  const firstRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "待办任务",
    status: "status-single-1",
    description: "测试内容1",
  });
  const secondRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "测试记录2",
    status: "status-single-2",
    description: "测试内容2",
  });
  const thirdRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "测试记录3",
    status: "status-single-2",
    description: "测试内容1",
  });
  const content = serializeMultidimensionalTableDocument({
    ...table,
    activeViewId: "view-board",
    records: [firstRecord, secondRecord, thirdRecord],
  });
  const rendered = renderEditor({ onSave, content });

  await user.click(screen.getByRole("button", { name: "筛选" }));
  await user.click(screen.getByRole("button", { name: "添加筛选规则" }));
  await user.selectOptions(screen.getByLabelText("筛选字段 1"), "status");
  await user.selectOptions(screen.getByLabelText("筛选值 1"), "status-single-2");
  await user.click(screen.getByRole("button", { name: "添加筛选规则" }));
  await user.selectOptions(screen.getByLabelText("筛选字段 2"), "description");
  await user.selectOptions(screen.getByLabelText("筛选条件 2"), "contains");
  await user.type(screen.getByLabelText("筛选值 2"), "测试内容1");

  expect(screen.queryByRole("button", { name: /待办任务/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /测试记录2/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /测试记录3/ })).toBeInTheDocument();

  await waitFor(() => {
    expect(savedContent).toContain("\"filterRules\"");
    expect(savedContent).toContain("\"status-single-2\"");
    expect(savedContent).toContain("测试内容1");
  }, { timeout: 1400 });

  rendered.unmount();
  renderEditor({ content: savedContent });

  expect(screen.queryByRole("button", { name: /待办任务/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /测试记录2/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /测试记录3/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2个筛选" })).toBeInTheDocument();
});

test("表格视图编辑文本字段后会防抖保存", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.clear(screen.getByLabelText("标题"));
  await user.type(screen.getByLabelText("标题"), "新的测试记录");

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("新的测试记录"));
  }, { timeout: 1400 });
});

test("表格视图可以删除记录并保存", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByRole("button", { name: /删除记录 测试记录1/ }));

  expect(screen.queryByDisplayValue("测试记录1")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(JSON.parse(savedContent).records).toHaveLength(0);
  }, { timeout: 1400 });
});

test("表格视图可以新增字段并修改字段分类", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByRole("button", { name: "新字段" }));
  await user.click(screen.getByRole("button", { name: /新文本字段 .*字段设置/ }));
  const fieldNameInput = screen.getByLabelText(/新文本字段 .*字段名称/);
  await user.clear(fieldNameInput);
  await user.type(fieldNameInput, "完成比例");
  await user.click(screen.getByRole("button", { name: "进度" }));
  await user.click(screen.getByRole("button", { name: "确定" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"type\": \"progress\""));
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("完成比例"));
  }, { timeout: 1400 });
});

test("表格视图可以粘贴导入并创建缺失字段", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByRole("button", { name: "导入" }));
  fireEvent.change(screen.getByLabelText("粘贴表格数据"), {
    target: { value: "标题\t负责人\n导入任务\t张三" },
  });
  await user.click(screen.getByRole("button", { name: "导入数据" }));

  expect(screen.getByText(/已导入 1 条记录/)).toBeInTheDocument();
  await waitFor(() => {
    const savedDocument = JSON.parse(savedContent);
    const ownerField = savedDocument.fields.find((field: { name: string }) => field.name === "负责人");
    expect(ownerField).toBeTruthy();
    expect(savedDocument.records.some((record: { values: Record<string, string> }) => record.values.title === "导入任务")).toBe(true);
    expect(savedDocument.records.some((record: { values: Record<string, string> }) => record.values[ownerField.id] === "张三")).toBe(true);
  }, { timeout: 1400 });
});

test("字段配置可以修改时间格式并删除字段", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByRole("button", { name: "日期字段设置" }));
  await user.selectOptions(screen.getByLabelText("日期时间格式"), "yyyy-mm-dd");
  await user.click(screen.getByRole("button", { name: "确定" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"timeFormat\": \"yyyy-mm-dd\""));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "日期字段设置" }));
  await user.click(screen.getByRole("button", { name: /删除字段/ }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.not.stringContaining("\"id\": \"date\""));
  }, { timeout: 1400 });
  expect(document.querySelectorAll(".multitable-grid__header .multitable-grid__cell--header")).toHaveLength(5);
  expect(document.querySelectorAll(".multitable-grid__row:first-child .multitable-grid__cell")).toHaveLength(6);
  expect(document.querySelector(".multitable-grid__row:first-child .multitable-grid__cell--row-actions")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /删除记录 测试记录1/ })).toBeInTheDocument();
});

test("单选和多选字段可以用选项面板选择并新增选项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByLabelText("状态"));
  await user.click(screen.getByRole("option", { name: /单选2/ }));
  await user.click(screen.getByLabelText("分类"));
  await user.click(screen.getByRole("option", { name: /多选2/ }));
  await user.type(screen.getByLabelText("分类新增选项"), "新分类");
  await user.click(screen.getByLabelText("分类确认新增选项"));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("status-single-2"));
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("新分类"));
  }, { timeout: 1400 });
});

test("单选和多选下拉选项支持编辑和删除", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByLabelText("状态"));
  await user.click(screen.getByRole("button", { name: "编辑选项 单选1" }));
  await user.clear(screen.getByLabelText("状态编辑选项 单选1"));
  await user.type(screen.getByLabelText("状态编辑选项 单选1"), "待处理");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("option", { name: /待处理/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除选项 待处理" }));
  await waitFor(() => {
    expect(savedContent).not.toContain("status-single-1");
  }, { timeout: 1400 });

  await user.click(screen.getByLabelText("分类"));
  await user.click(screen.getByRole("button", { name: "编辑选项 多选1" }));
  await user.clear(screen.getByLabelText("分类编辑选项 多选1"));
  await user.type(screen.getByLabelText("分类编辑选项 多选1"), "多选编辑");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("option", { name: /多选编辑/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除选项 多选2" }));
  await waitFor(() => {
    expect(savedContent).toContain("多选编辑");
    expect(savedContent).not.toContain("multi-2");
    expect(savedContent).toContain("multi-1");
  }, { timeout: 1400 });
});

test("看板新增记录会写入当前分组状态", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getAllByRole("button", { name: "新增记录" })[0]);

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("status-single-1"));
  }, { timeout: 1400 });
});

test("看板带日期筛选时新增记录会直接打开详情", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  const table = tableWithCategory();
  const content = serializeMultidimensionalTableDocument({
    ...table,
    activeViewId: "view-board",
    records: [],
    views: table.views.map((view) => view.id === "view-board"
      ? { ...view, filterRules: [{ id: "filter-date", fieldId: "date", operator: "thisWeek" }] }
      : view),
  });

  renderEditor({ onSave, content });

  await user.click(screen.getAllByRole("button", { name: "新增记录" })[0]);

  expect(screen.getByRole("complementary", { name: "记录详情" })).toBeInTheDocument();
  expect(screen.getByLabelText("看板标题")).toHaveValue("");
  await waitFor(() => {
    expect(savedContent).toContain("status-single-1");
  }, { timeout: 1400 });
});

test("看板详情可以删除记录并关闭详情", async () => {
  const user = userEvent.setup();
  let savedContent = "";
  const onSave = vi.fn(async (_path: string, content: string) => {
    savedContent = content;
  });
  renderEditor({ onSave });

  await user.click(screen.getByRole("button", { name: /测试记录1/ }));
  await user.click(screen.getByRole("button", { name: "删除记录" }));

  expect(screen.queryByRole("complementary", { name: "记录详情" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /测试记录1/ })).not.toBeInTheDocument();
  await waitFor(() => {
    expect(JSON.parse(savedContent).records).toHaveLength(0);
  }, { timeout: 1400 });
});

test("看板配置可以控制卡片字段显示隐藏", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  expect(screen.getAllByText("主要内容").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "看板配置" }));
  expect(screen.getByLabelText(/标题/)).toBeInTheDocument();
  expect(screen.getByLabelText(/状态/)).toBeInTheDocument();
  await user.click(screen.getByLabelText(/主要内容/));

  expect(screen.queryByText("测试内容1")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"cardFieldIds\""));
  }, { timeout: 1400 });

  await user.click(screen.getByLabelText(/标题/));
  expect(screen.queryByRole("button", { name: /测试记录1/ })).not.toBeInTheDocument();
});

test("看板配置和筛选面板点击外部区域会收起", async () => {
  const user = userEvent.setup();
  renderEditor();

  await user.click(screen.getByRole("button", { name: "看板配置" }));
  expect(screen.getByRole("region", { name: "看板字段显示设置" })).toBeInTheDocument();

  await user.click(screen.getByTestId("multitable-board"));
  expect(screen.queryByRole("region", { name: "看板字段显示设置" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "筛选" }));
  expect(screen.getByRole("region", { name: "视图条件" })).toBeInTheDocument();

  await user.click(screen.getByTestId("multitable-board"));
  expect(screen.queryByRole("region", { name: "视图条件" })).not.toBeInTheDocument();
});

test("看板可以切换分组字段并直接调整卡片记录", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  const table = createDefaultMultidimensionalTableDocument();
  const priorityField = {
    id: "priority",
    name: "优先级",
    type: "singleSelect" as const,
    options: [
      { id: "priority-high", label: "高", color: "orange" },
      { id: "priority-low", label: "低", color: "gray" },
    ],
  };
  const record = createEmptyMultidimensionalTableRecord([...table.fields, priorityField], {
    title: "测试记录1",
    status: "status-single-1",
    category: ["multi-1", "multi-2"],
    description: "测试内容1",
    date: "2026-04-13T09:00",
    priority: "priority-high",
    attachment: [],
  });

  renderEditor({
    onSave,
    content: serializeMultidimensionalTableDocument({
      ...table,
      fields: [...table.fields, priorityField],
      records: [record],
    }),
  });

  await user.selectOptions(screen.getByLabelText("看板分组字段"), "priority");
  await user.click(screen.getByRole("button", { name: /测试记录1/ }));
  await user.clear(screen.getByLabelText("看板标题"));
  await user.type(screen.getByLabelText("看板标题"), "新的看板任务");
  await user.click(screen.getByRole("button", { name: "编辑字段 日期" }));
  await user.selectOptions(screen.getByLabelText("日期时间格式"), "yyyy年m月d日");
  await user.click(screen.getByRole("button", { name: "确定" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"groupByFieldId\": \"priority\""));
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("新的看板任务"));
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"timeFormat\": \"yyyy年m月d日\""));
  }, { timeout: 1400 });
});

test("看板详情支持附件上传下载和正文编辑", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  const onUploadFile = vi.fn(async () => ({
    url: "blob:测试文件1.pdf",
    filename: "测试文件1.pdf",
    size: 4,
    resourceRef: "yuque-resource://bucket/files/a.pdf?kind=file",
  }));
  const onDownloadFile = vi.fn(async () => undefined);
  renderEditor({ onSave, onUploadFile, onDownloadFile });

  await user.click(screen.getByRole("button", { name: /测试记录1/ }));
  await user.upload(screen.getByLabelText("上传记录附件"), new File(["demo"], "测试文件1.pdf", { type: "application/pdf" }));

  await waitFor(() => {
    expect(onUploadFile).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("测试文件1.pdf"));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "下载附件 测试文件1.pdf" }));
  expect(onDownloadFile).toHaveBeenCalledWith({
    url: "blob:测试文件1.pdf",
    filename: "测试文件1.pdf",
    resourceRef: "yuque-resource://bucket/files/a.pdf?kind=file",
  });

  await user.type(screen.getByLabelText("记录正文内容"), "记录正文");
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("记录正文"));
  }, { timeout: 1400 });
});

test("看板详情点击外部区域会关闭", async () => {
  const user = userEvent.setup();
  renderEditor();

  await user.click(screen.getByRole("button", { name: /测试记录1/ }));
  expect(screen.getByRole("complementary", { name: "记录详情" })).toBeInTheDocument();

  await user.click(document.querySelector(".multitable-record-detail-backdrop")!);
  expect(screen.queryByRole("complementary", { name: "记录详情" })).not.toBeInTheDocument();
});

test("看板详情正文可以全屏编辑并保存", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("button", { name: /测试记录1/ }));
  await user.click(screen.getByRole("button", { name: "全屏编辑正文" }));

  expect(screen.getByRole("dialog", { name: "正文全屏编辑" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("全屏记录正文内容"), "全屏正文内容");

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("全屏正文内容"));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "关闭全屏正文编辑" }));
  expect(screen.queryByRole("dialog", { name: "正文全屏编辑" })).not.toBeInTheDocument();
});

test("看板详情正文全屏会开启 Lake 大纲", async () => {
  const user = userEvent.setup();
  const editor: LakeEditorInstance = {
    setDocument: vi.fn(),
    getDocument: vi.fn(() => "<h1>正文标题</h1>"),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  window.Doc = {
    createOpenEditor: vi.fn(() => editor),
  };
  renderEditor();

  await user.click(screen.getByRole("button", { name: /测试记录1/ }));

  await waitFor(() => {
    expect(window.Doc?.createOpenEditor).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        toc: {
          enable: false,
          normalView: false,
        },
      }),
    );
  });

  await user.click(screen.getByRole("button", { name: "全屏编辑正文" }));

  await waitFor(() => {
    expect(window.Doc?.createOpenEditor).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({
        toc: {
          enable: true,
          normalView: true,
        },
      }),
    );
  });
});

function renderEditor({
  onSave = vi.fn(async () => undefined),
  onUploadFile = vi.fn(async () => ({
    url: "blob:attachment.bin",
    filename: "attachment.bin",
    size: 0,
  })),
  onDownloadFile = vi.fn(async () => undefined),
  content,
}: {
  onSave?: (relativePath: string, content: string) => Promise<void>;
  onUploadFile?: (input: { bytes: number[]; filename: string; mimeType?: string }) => Promise<{
    url: string;
    size: number;
    filename: string;
    resourceRef?: string;
  }>;
  onDownloadFile?: (input: { url: string; filename: string; resourceRef?: string }) => Promise<void>;
  content?: string;
} = {}) {
  const table = tableWithCategory();
  const record = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "测试记录1",
    status: "status-single-1",
    category: ["multi-1", "multi-2"],
    description: "测试内容1",
    date: "2026-04-13T09:00",
    attachment: [],
  });
  return render(
    <MultidimensionalTableEditor
      document={documentEntry}
      content={content ?? serializeMultidimensionalTableDocument({ ...table, records: [record] })}
      manualSaveRequest={0}
      onSave={onSave}
      onUploadFile={onUploadFile}
      onDownloadFile={onDownloadFile}
      onUploadImage={onUploadFile}
      onPrepareResourcePreview={async () => "blob:preview"}
      onSaveStatusChange={vi.fn()}
    />,
  );
}
