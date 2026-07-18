import { act, render, screen, waitFor } from "@testing-library/react";
import { CommandType, LocaleType, Univer, type IWorkbookData } from "@univerjs/core";
import { IClipboardInterfaceService, UniverSheetsCorePreset, UniverUIPlugin } from "@univerjs/preset-sheets-core";

import { createEmptySpreadsheetWorkbookData } from "./spreadsheetDocument";
import { SpreadsheetClipboardService, SpreadsheetEditor } from "./SpreadsheetEditor";
import { serializeSpreadsheetSnapshot } from "./spreadsheetSnapshot";

const univerMocks = vi.hoisted(() => {
  const registerPlugin = vi.fn();
  const registerPlugins = vi.fn();
  const disposeUniver = vi.fn();
  const clipboardServiceIdentifier = Symbol("univer.clipboard-interface-service");
  class MockUniverUIPlugin {}
  const createUniver = vi.fn().mockImplementation(function () {
    return {
      registerPlugin,
      registerPlugins,
      dispose: disposeUniver,
    };
  });

  return { clipboardServiceIdentifier, createUniver, MockUniverUIPlugin, registerPlugin, registerPlugins, disposeUniver };
});
const createWorkbook = vi.fn();
let commandExecutedListener: ((event: { id: string; type: CommandType; params: unknown }) => void) | null = null;
const originalNavigatorClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

vi.mock("@univerjs/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@univerjs/core")>();
  return {
    ...actual,
    Univer: univerMocks.createUniver,
  };
});

vi.mock("@univerjs/core/facade", () => ({
  FUniver: {
    newAPI: vi.fn(() => ({
      Event: {
        CommandExecuted: "CommandExecuted",
      },
      addEvent: vi.fn((_eventName, listener) => {
        commandExecutedListener = listener;
        return { dispose: vi.fn() };
      }),
      createWorkbook,
    })),
  },
}));

vi.mock("@univerjs/preset-sheets-core", () => {
  return {
    IClipboardInterfaceService: univerMocks.clipboardServiceIdentifier,
    UniverUIPlugin: univerMocks.MockUniverUIPlugin,
    UniverSheetsCorePreset: vi.fn(() => ({
      plugins: [
        [univerMocks.MockUniverUIPlugin, {}],
      ],
    })),
  };
});

beforeEach(() => {
  univerMocks.createUniver.mockClear();
  univerMocks.registerPlugin.mockClear();
  univerMocks.registerPlugins.mockClear();
  univerMocks.disposeUniver.mockClear();
  vi.mocked(UniverSheetsCorePreset).mockClear();
  createWorkbook.mockClear();
  commandExecutedListener = null;
  createWorkbook.mockImplementation((workbookData: IWorkbookData) => ({
    save: vi.fn(() => workbookData),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalNavigatorClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalNavigatorClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("打开 spreadsheet 文档时初始化 Univer workbook", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("测试表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(createWorkbook).toHaveBeenCalledWith(expect.objectContaining({ name: "测试表格" }));
  });
  expect(screen.getByTestId("spreadsheet-editor-container")).toBeInTheDocument();
});

test("初始化 Univer 时加载中文语言包", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("中文表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  expect(vi.mocked(Univer)).toHaveBeenCalledWith(expect.objectContaining({
    locale: LocaleType.ZH_CN,
    locales: expect.objectContaining({
      [LocaleType.ZH_CN]: expect.any(Object),
    }),
  }));
});

test("初始化 Univer 时只注册开源表格 preset", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("Excel 表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  expect(univerMocks.registerPlugins).toHaveBeenCalled();
  expect(univerMocks.registerPlugin).not.toHaveBeenCalled();
});

test("初始化 Univer 时启用表格顶部工具栏区域", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("工具栏表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  expect(vi.mocked(UniverSheetsCorePreset)).toHaveBeenCalledWith(expect.objectContaining({
    header: true,
    toolbar: true,
    formulaBar: true,
  }));
});

test("初始化 Univer 时替换默认剪贴板服务避免 WebView 权限失败提示", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("剪贴板表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(univerMocks.registerPlugins).toHaveBeenCalled());
  const registeredPlugins = univerMocks.registerPlugins.mock.calls[0][0] as Array<[unknown, Record<string, unknown>]>;
  const uiPlugin = registeredPlugins.find(([plugin]) => plugin === UniverUIPlugin);
  expect(uiPlugin?.[1]).toEqual(expect.objectContaining({
    override: expect.arrayContaining([
      [IClipboardInterfaceService, expect.objectContaining({
        useClass: SpreadsheetClipboardService,
        lazy: true,
      })],
    ]),
  }));
});

test("表格剪贴板写入被 WebView 拒绝时回退到 execCommand 复制", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      writeText: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      readText: vi.fn(),
    },
  });
  Object.defineProperty(window, "ClipboardItem", {
    configurable: true,
    value: class {
      constructor(readonly items: Record<string, Blob>) {}
    },
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn(() => true),
  });

  await new SpreadsheetClipboardService().write("A\tB", "<table><tr><td>A</td><td>B</td></tr></table>");

  expect(navigator.clipboard.write).toHaveBeenCalled();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("A\tB");
  expect(document.execCommand).toHaveBeenCalledWith("copy");
});

test("收到数据变更命令后延迟保存 Univer workbook 快照", async () => {
  const onSave = vi.fn();
  const onSaveStatusChange = vi.fn();
  const workbookData = createEmptySpreadsheetWorkbookData("自动保存");
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(workbookData)}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={onSaveStatusChange}
    />,
  );

  await waitFor(() => expect(commandExecutedListener).toBeTruthy());
  onSaveStatusChange.mockClear();
  vi.useFakeTimers();
  await act(async () => {
    commandExecutedListener?.({ id: "sheet.mutation.set-range-values", type: CommandType.MUTATION, params: {} });
  });
  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "dirty" }));
  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "saving" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(onSave).toHaveBeenCalledWith("budget.json", expect.stringContaining("\"sheetOrder\""));
  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "dirty" }));
  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "saving" }));
  expect(onSaveStatusChange).toHaveBeenCalledWith(expect.objectContaining({ state: "saved" }));
});

test("单元格编辑中的 doc mutation 不触发表格自动保存", async () => {
  const onSave = vi.fn();
  const onSaveStatusChange = vi.fn();
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("输入中间态"))}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={onSaveStatusChange}
    />,
  );

  await waitFor(() => expect(commandExecutedListener).toBeTruthy());
  onSaveStatusChange.mockClear();
  vi.useFakeTimers();

  await act(async () => {
    commandExecutedListener?.({ id: "doc.mutation.rich-text-editing", type: CommandType.MUTATION, params: {} });
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "dirty" }));
  expect(onSave).not.toHaveBeenCalled();
});

test("表格原生输入事件不直接触发保存状态更新", async () => {
  const onSaveStatusChange = vi.fn();
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("键盘输入"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={onSaveStatusChange}
    />,
  );

  const container = await screen.findByTestId("spreadsheet-editor-container");
  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  onSaveStatusChange.mockClear();

  await act(async () => {
    // Univer 自己会把编辑结果转换为 mutation；这里避免在原生输入阶段同步推动 React 状态，防止打断单元格编辑焦点。
    container.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "dirty" }));
});

test("连续数据变更只在内部记录待保存状态", async () => {
  const onSaveStatusChange = vi.fn();
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("连续输入"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={onSaveStatusChange}
    />,
  );

  await waitFor(() => expect(commandExecutedListener).toBeTruthy());
  onSaveStatusChange.mockClear();

  await act(async () => {
    commandExecutedListener?.({ id: "sheet.mutation.set-range-values", type: CommandType.MUTATION, params: {} });
  });
  await act(async () => {
    commandExecutedListener?.({ id: "sheet.mutation.set-range-values", type: CommandType.MUTATION, params: {} });
  });

  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "dirty" }));
  expect(onSaveStatusChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: "saving" }));
});

test("手动保存时立即读取当前 workbook snapshot", async () => {
  const onSave = vi.fn();
  const { rerender } = render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("手动保存"))}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  rerender(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("手动保存"))}
      manualSaveRequest={1}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("budget.json", expect.stringContaining("\"sheetOrder\""));
  });
});

test("鼠标在表格外释放后再次移动不会延续上一次选区拖拽", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("释放补偿"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  const container = await screen.findByTestId("spreadsheet-editor-container");
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const pointerUpEvents: PointerEvent[] = [];
  canvas.addEventListener("pointerup", (event) => pointerUpEvents.push(event));

  canvas.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: 20,
    clientY: 20,
    pointerId: 8,
    pointerType: "mouse",
  }));
  document.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    button: 0,
    buttons: 0,
    clientX: 120,
    clientY: 120,
    pointerId: 8,
    pointerType: "mouse",
  }));

  expect(pointerUpEvents).toHaveLength(1);
  expect(pointerUpEvents[0]).toMatchObject({
    pointerId: 8,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
  });

  document.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    button: -1,
    buttons: 0,
    clientX: 160,
    clientY: 160,
    pointerId: 8,
    pointerType: "mouse",
  }));
  expect(pointerUpEvents).toHaveLength(1);
});

test("鼠标释放丢失后普通移动会补发左键释放终止残留选区", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("移动释放补偿"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  const container = await screen.findByTestId("spreadsheet-editor-container");
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const pointerUpEvents: PointerEvent[] = [];
  canvas.addEventListener("pointerup", (event) => pointerUpEvents.push(event));

  canvas.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: 24,
    clientY: 24,
    pointerId: 9,
    pointerType: "mouse",
  }));
  document.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    button: -1,
    buttons: 0,
    clientX: 180,
    clientY: 180,
    pointerId: 9,
    pointerType: "mouse",
  }));

  expect(pointerUpEvents).toHaveLength(1);
  expect(pointerUpEvents[0]).toMatchObject({
    pointerId: 9,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
  });
});

test("非 canvas 目标按下后表格内无按钮移动会补发一次释放", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("残留释放补偿"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  const container = await screen.findByTestId("spreadsheet-editor-container");
  const canvas = document.createElement("canvas");
  const overlay = document.createElement("div");
  container.appendChild(canvas);
  container.appendChild(overlay);
  const pointerUpEvents: PointerEvent[] = [];
  canvas.addEventListener("pointerup", (event) => pointerUpEvents.push(event));

  canvas.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    button: -1,
    buttons: 0,
    clientX: 200,
    clientY: 200,
    pointerId: 10,
    pointerType: "mouse",
  }));
  expect(pointerUpEvents).toHaveLength(0);

  overlay.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: 120,
    clientY: 120,
    pointerId: 10,
    pointerType: "mouse",
  }));
  canvas.dispatchEvent(new PointerEvent("pointermove", {
    bubbles: true,
    button: -1,
    buttons: 0,
    clientX: 220,
    clientY: 220,
    pointerId: 10,
    pointerType: "mouse",
  }));

  expect(pointerUpEvents).toHaveLength(1);
  expect(pointerUpEvents[0]).toMatchObject({
    pointerId: 10,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
  });
});

test("右键打开表格菜单前会补发释放终止残留选区拖拽", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("右键释放补偿"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  const container = await screen.findByTestId("spreadsheet-editor-container");
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const pointerUpEvents: PointerEvent[] = [];
  canvas.addEventListener("pointerup", (event) => pointerUpEvents.push(event));

  canvas.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 2,
    buttons: 2,
    clientX: 80,
    clientY: 180,
    pointerId: 11,
    pointerType: "mouse",
  }));
  canvas.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    button: 2,
    buttons: 0,
    clientX: 80,
    clientY: 180,
  }));

  expect(pointerUpEvents).toHaveLength(1);
  expect(pointerUpEvents[0]).toMatchObject({
    pointerId: 11,
    pointerType: "mouse",
    button: 2,
    buttons: 0,
  });
});

test("切换文档时销毁上一个 Univer 实例", async () => {
  const { rerender } = render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("第一个"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );
  await waitFor(() => expect(createWorkbook).toHaveBeenCalledTimes(1));

  rerender(
    <SpreadsheetEditor
      document={{ ...spreadsheetDocument, id: "next.json", path: "next.json", name: "next" }}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("第二个"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(univerMocks.disposeUniver).toHaveBeenCalled());
});

test("卸载表格时延后销毁 Univer，避免 React 渲染期间同步卸载内部 root", async () => {
  const { unmount } = render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content={serializeSpreadsheetSnapshot(createEmptySpreadsheetWorkbookData("延迟销毁"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );
  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());

  univerMocks.disposeUniver.mockClear();
  unmount();
  expect(univerMocks.disposeUniver).not.toHaveBeenCalled();

  await waitFor(() => expect(univerMocks.disposeUniver).toHaveBeenCalled());
});

test("Univer 快照解析失败时显示错误且不写入文件", async () => {
  const onSave = vi.fn();
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      content="{"
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await screen.findByText("表格编辑器加载失败");
  expect(onSave).not.toHaveBeenCalled();
});

const spreadsheetDocument = {
  id: "budget.json",
  path: "budget.json",
  name: "budget",
  parentPath: "",
  size: 1,
  kind: "spreadsheet" as const,
};
