import { act, render, screen, waitFor } from "@testing-library/react";
import { CommandType, type IWorkbookData } from "@univerjs/core";

import { createEmptySpreadsheetWorkbookData } from "./spreadsheetDocument";
import { workbookDataToXlsxBytes } from "./spreadsheetXlsxBridge";
import { SpreadsheetEditor } from "./SpreadsheetEditor";

const registerPlugins = vi.fn();
const disposeUniver = vi.fn();
const createWorkbook = vi.fn();
let commandExecutedListener: ((event: { id: string; type: CommandType; params: unknown }) => void) | null = null;

vi.mock("@univerjs/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@univerjs/core")>();
  return {
    ...actual,
    Univer: vi.fn().mockImplementation(function () {
      return {
        registerPlugins,
        dispose: disposeUniver,
      };
    }),
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

vi.mock("@univerjs/preset-sheets-core", () => ({
  UniverSheetsCorePreset: vi.fn(() => ({
    plugins: [],
  })),
}));

beforeEach(() => {
  registerPlugins.mockClear();
  disposeUniver.mockClear();
  createWorkbook.mockClear();
  commandExecutedListener = null;
  createWorkbook.mockImplementation((workbookData: IWorkbookData) => ({
    save: vi.fn(() => workbookData),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

test("打开 spreadsheet 文档时初始化 Univer workbook", async () => {
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={await workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData("测试表格"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(createWorkbook).toHaveBeenCalledWith(expect.objectContaining({ name: "budget" }));
  });
  expect(screen.getByTestId("spreadsheet-editor-container")).toBeInTheDocument();
});

test("收到数据变更命令后延迟保存 XLSX bytes", async () => {
  const onSave = vi.fn();
  const workbookData = createEmptySpreadsheetWorkbookData("自动保存");
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={await workbookDataToXlsxBytes(workbookData)}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(commandExecutedListener).toBeTruthy());
  await act(async () => {
    commandExecutedListener?.({ id: "sheet.mutation.set-range-values", type: CommandType.MUTATION, params: {} });
  });

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("budget.xlsx", expect.any(Uint8Array));
  }, { timeout: 2_000 });
});

test("手动保存时立即读取当前 workbook snapshot", async () => {
  const onSave = vi.fn();
  const { rerender } = render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={await workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData("手动保存"))}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(createWorkbook).toHaveBeenCalled());
  rerender(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={await workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData("手动保存"))}
      manualSaveRequest={1}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith("budget.xlsx", expect.any(Uint8Array));
  });
});

test("切换文档时销毁上一个 Univer 实例", async () => {
  const { rerender } = render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={await workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData("第一个"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );
  await waitFor(() => expect(createWorkbook).toHaveBeenCalledTimes(1));

  rerender(
    <SpreadsheetEditor
      document={{ ...spreadsheetDocument, id: "next.xlsx", path: "next.xlsx", name: "next" }}
      bytes={await workbookDataToXlsxBytes(createEmptySpreadsheetWorkbookData("第二个"))}
      manualSaveRequest={0}
      onSave={vi.fn()}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await waitFor(() => expect(disposeUniver).toHaveBeenCalled());
});

test("XLSX 转换失败时显示错误且不写入文件", async () => {
  const onSave = vi.fn();
  render(
    <SpreadsheetEditor
      document={spreadsheetDocument}
      bytes={new Uint8Array([1, 2, 3])}
      manualSaveRequest={0}
      onSave={onSave}
      onSaveStatusChange={vi.fn()}
    />,
  );

  await screen.findByText("表格编辑器加载失败");
  expect(onSave).not.toHaveBeenCalled();
});

const spreadsheetDocument = {
  id: "budget.xlsx",
  path: "budget.xlsx",
  name: "budget",
  parentPath: "",
  size: 1,
  kind: "spreadsheet" as const,
};
