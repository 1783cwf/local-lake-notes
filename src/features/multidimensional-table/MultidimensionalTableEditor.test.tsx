import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultidimensionalTableEditor } from "./MultidimensionalTableEditor";
import {
  createDefaultMultidimensionalTableDocument,
  createEmptyMultidimensionalTableRecord,
  serializeMultidimensionalTableDocument,
} from "./multidimensionalTableDocument";

const documentEntry = {
  id: "project.dbtable.json",
  path: "project.dbtable.json",
  name: "project",
  parentPath: "",
  size: 1,
  kind: "multidimensional-table" as const,
};

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
  expect(screen.getByRole("button", { name: /共性公文迁移到湘潭/ })).toBeInTheDocument();

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
  await user.type(screen.getByLabelText("重命名视图 看板 2"), "发布排期");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("tab", { name: /发布排期/ })).toHaveAttribute("aria-selected", "true");
  await waitFor(() => {
    expect(savedContent).toContain("\"name\": \"发布排期\"");
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "发布排期 视图操作" }));
  await user.click(screen.getByRole("menuitem", { name: "删除" }));

  expect(screen.queryByRole("tab", { name: /发布排期/ })).not.toBeInTheDocument();
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
  const table = createDefaultMultidimensionalTableDocument();
  const firstRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "B 任务",
    status: "status-pending",
    type: ["type-dual-center"],
    description: "湘潭项目",
  });
  const secondRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "A 任务",
    status: "status-progress",
    type: ["type-gateway"],
    description: "株洲项目",
  });

  renderEditor({
    content: serializeMultidimensionalTableDocument({ ...table, activeViewId: "view-table", records: [firstRecord, secondRecord] }),
  });

  expect(screen.queryByRole("button", { name: "生成表单" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "搜索" }));
  await user.type(screen.getByLabelText("搜索记录"), "湘潭");
  expect(screen.getByDisplayValue("B 任务")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("A 任务")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清除条件" }));
  await user.click(screen.getByRole("button", { name: "筛选" }));
  await user.click(screen.getByRole("button", { name: "添加筛选规则" }));
  await user.selectOptions(screen.getByLabelText("筛选字段 1"), "status");
  await user.selectOptions(screen.getByLabelText("筛选值 1"), "status-progress");
  expect(screen.queryByDisplayValue("B 任务")).not.toBeInTheDocument();
  expect(screen.getByDisplayValue("A 任务")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "清除条件" }));
  await user.click(screen.getByRole("button", { name: "排序" }));
  await user.selectOptions(screen.getByLabelText("排序字段"), "title");

  const titleInputs = Array.from(document.querySelectorAll<HTMLInputElement>(".multitable-grid__row input[aria-label='标题']"));
  expect(titleInputs.map((input) => input.value)).toEqual(["A 任务", "B 任务"]);
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
    status: "status-pending",
    description: "湘潭项目",
  });
  const secondRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "株洲任务",
    status: "status-progress",
    description: "株洲项目",
  });
  const thirdRecord = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "湘潭任务",
    status: "status-progress",
    description: "湘潭项目",
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
  await user.selectOptions(screen.getByLabelText("筛选值 1"), "status-progress");
  await user.click(screen.getByRole("button", { name: "添加筛选规则" }));
  await user.selectOptions(screen.getByLabelText("筛选字段 2"), "description");
  await user.selectOptions(screen.getByLabelText("筛选条件 2"), "contains");
  await user.type(screen.getByLabelText("筛选值 2"), "湘潭");

  expect(screen.queryByRole("button", { name: /待办任务/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /株洲任务/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /湘潭任务/ })).toBeInTheDocument();

  await waitFor(() => {
    expect(savedContent).toContain("\"filterRules\"");
    expect(savedContent).toContain("\"status-progress\"");
    expect(savedContent).toContain("湘潭");
  }, { timeout: 1400 });

  rendered.unmount();
  renderEditor({ content: savedContent });

  expect(screen.queryByRole("button", { name: /待办任务/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /株洲任务/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /湘潭任务/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2个筛选" })).toBeInTheDocument();
});

test("表格视图编辑文本字段后会防抖保存", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.clear(screen.getByLabelText("标题"));
  await user.type(screen.getByLabelText("标题"), "新的上线任务");

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("新的上线任务"));
  }, { timeout: 1400 });
});

test("表格视图可以新增字段并修改字段类型", async () => {
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

test("字段配置可以修改时间格式并删除字段", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByRole("button", { name: "上线时间字段设置" }));
  await user.selectOptions(screen.getByLabelText("上线时间时间格式"), "yyyy-mm-dd");
  await user.click(screen.getByRole("button", { name: "确定" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"timeFormat\": \"yyyy-mm-dd\""));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "预估工时字段设置" }));
  await user.click(screen.getByRole("button", { name: /删除字段/ }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.not.stringContaining("\"id\": \"estimate\""));
  }, { timeout: 1400 });
  expect(document.querySelectorAll(".multitable-grid__header .multitable-grid__cell--header")).toHaveLength(8);
  expect(document.querySelectorAll(".multitable-grid__row:first-child .multitable-grid__cell")).toHaveLength(9);
  expect(document.querySelector(".multitable-grid__row:first-child .multitable-grid__cell--row-spacer")).toBeInTheDocument();
});

test("单选和多选字段可以用选项面板选择并新增选项", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("tab", { name: /表格/ }));
  await user.click(screen.getByLabelText("上线状态"));
  await user.click(screen.getByRole("option", { name: /进行中/ }));
  await user.click(screen.getByLabelText("类型"));
  await user.click(screen.getByRole("option", { name: /流量网关/ }));
  await user.type(screen.getByLabelText("类型新增选项"), "新类型");
  await user.click(screen.getByLabelText("类型确认新增选项"));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("status-progress"));
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("新类型"));
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
  await user.click(screen.getByLabelText("上线状态"));
  await user.click(screen.getByRole("button", { name: "编辑选项 待上线" }));
  await user.clear(screen.getByLabelText("上线状态编辑选项 待上线"));
  await user.type(screen.getByLabelText("上线状态编辑选项 待上线"), "待处理");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("option", { name: /待处理/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除选项 待处理" }));
  await waitFor(() => {
    expect(savedContent).not.toContain("status-pending");
  }, { timeout: 1400 });

  await user.click(screen.getByLabelText("类型"));
  await user.click(screen.getByRole("button", { name: "编辑选项 双中心" }));
  await user.clear(screen.getByLabelText("类型编辑选项 双中心"));
  await user.type(screen.getByLabelText("类型编辑选项 双中心"), "双活中心");
  await user.keyboard("{Enter}");

  expect(screen.getByRole("option", { name: /双活中心/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "删除选项 流量网关" }));
  await waitFor(() => {
    expect(savedContent).toContain("双活中心");
    expect(savedContent).not.toContain("type-gateway");
    expect(savedContent).toContain("type-dual-center");
  }, { timeout: 1400 });
});

test("看板新增记录会写入当前分组状态", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getAllByRole("button", { name: "新增记录" })[0]);

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("status-pending"));
  }, { timeout: 1400 });
});

test("看板配置可以控制卡片字段显示隐藏", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  expect(screen.getAllByText("主要内容").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "看板配置" }));
  expect(screen.getByLabelText(/标题/)).toBeInTheDocument();
  expect(screen.getByLabelText(/上线状态/)).toBeInTheDocument();
  await user.click(screen.getByLabelText(/主要内容/));

  expect(screen.queryByText("将访问共性公文的流量指向湘潭pod4")).not.toBeInTheDocument();
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("\"cardFieldIds\""));
  }, { timeout: 1400 });

  await user.click(screen.getByLabelText(/标题/));
  expect(screen.queryByRole("button", { name: /共性公文迁移到湘潭/ })).not.toBeInTheDocument();
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
    title: "共性公文迁移到湘潭",
    status: "status-pending",
    type: ["type-dual-center", "type-gateway"],
    description: "将访问共性公文的流量指向湘潭pod4",
    progress: "20",
    launchTime: "2026-04-13T09:00",
    priority: "priority-high",
    attachment: "-",
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
  await user.click(screen.getByRole("button", { name: /共性公文迁移到湘潭/ }));
  await user.clear(screen.getByLabelText("看板标题"));
  await user.type(screen.getByLabelText("看板标题"), "新的看板任务");
  await user.click(screen.getByRole("button", { name: "编辑字段 上线时间" }));
  await user.selectOptions(screen.getByLabelText("上线时间时间格式"), "yyyy年m月d日");
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
    url: "blob:需求说明.pdf",
    filename: "需求说明.pdf",
    size: 4,
    resourceRef: "yuque-resource://bucket/files/a.pdf?kind=file",
  }));
  const onDownloadFile = vi.fn(async () => undefined);
  renderEditor({ onSave, onUploadFile, onDownloadFile });

  await user.click(screen.getByRole("button", { name: /共性公文迁移到湘潭/ }));
  await user.upload(screen.getByLabelText("上传记录附件"), new File(["demo"], "需求说明.pdf", { type: "application/pdf" }));

  await waitFor(() => {
    expect(onUploadFile).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("需求说明.pdf"));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "下载附件 需求说明.pdf" }));
  expect(onDownloadFile).toHaveBeenCalledWith({
    url: "blob:需求说明.pdf",
    filename: "需求说明.pdf",
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

  await user.click(screen.getByRole("button", { name: /共性公文迁移到湘潭/ }));
  expect(screen.getByRole("complementary", { name: "记录详情" })).toBeInTheDocument();

  await user.click(document.querySelector(".multitable-record-detail-backdrop")!);
  expect(screen.queryByRole("complementary", { name: "记录详情" })).not.toBeInTheDocument();
});

test("看板详情正文可以全屏编辑并保存", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => undefined);
  renderEditor({ onSave });

  await user.click(screen.getByRole("button", { name: /共性公文迁移到湘潭/ }));
  await user.click(screen.getByRole("button", { name: "全屏编辑正文" }));

  expect(screen.getByRole("dialog", { name: "正文全屏编辑" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("全屏记录正文内容"), "全屏正文内容");

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("project.dbtable.json", expect.stringContaining("全屏正文内容"));
  }, { timeout: 1400 });

  await user.click(screen.getByRole("button", { name: "关闭全屏正文编辑" }));
  expect(screen.queryByRole("dialog", { name: "正文全屏编辑" })).not.toBeInTheDocument();
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
  const table = createDefaultMultidimensionalTableDocument();
  const record = createEmptyMultidimensionalTableRecord(table.fields, {
    title: "共性公文迁移到湘潭",
    status: "status-pending",
    type: ["type-dual-center", "type-gateway"],
    description: "将访问共性公文的流量指向湘潭pod4",
    estimate: "3",
    progress: "20",
    launchTime: "2026-04-13T09:00",
    url: "https://example.com",
    attachment: "-",
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
