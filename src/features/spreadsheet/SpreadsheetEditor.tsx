import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  LocaleType,
  LogLevel,
  Univer,
  CommandType,
  type IWorkbookData,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { defaultTheme } from "@univerjs/themes";
import { UniverSheetsCorePreset, type FWorkbook } from "@univerjs/preset-sheets-core";
import zhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import "@univerjs/preset-sheets-core/lib/index.css";

import type { SaveStatus } from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import { useSpreadsheetAutosave } from "./spreadsheetAutosave";
import { exportXlsxWorkbookData, importXlsxWorkbookData } from "./spreadsheetXlsxBridge";
import { parseSpreadsheetSnapshot, serializeSpreadsheetSnapshot } from "./spreadsheetSnapshot";

interface SpreadsheetEditorProps {
  document: WorkspaceDocument | null;
  content: string;
  manualSaveRequest: number;
  onSave: (relativePath: string, content: string) => Promise<void>;
  onSaveStatusChange: (status: SaveStatus) => void;
  onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
}

interface UniverRuntime {
  univer: Univer;
  workbook: FWorkbook;
  host: HTMLDivElement;
  disposeChangeListener: () => void;
  disposed: boolean;
}

interface PendingSpreadsheetPointer {
  canvas: HTMLCanvasElement;
  pointerId?: number;
  pointerType?: string;
  button: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
}

export interface SpreadsheetEditorHandle {
  importExcel: (file: File) => Promise<string>;
  exportExcel: () => Promise<File>;
}

export const SpreadsheetEditor = forwardRef<SpreadsheetEditorHandle, SpreadsheetEditorProps>(function SpreadsheetEditor({
  document,
  content,
  manualSaveRequest,
  onSave,
  onSaveStatusChange,
  onRegisterSaveNow,
}: SpreadsheetEditorProps, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<UniverRuntime | null>(null);
  const workbookDataRef = useRef<IWorkbookData | null>(null);
  const mountedDocumentPathRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const readCurrentContent = useCallback(async () => {
    const workbookData = runtimeRef.current?.workbook.save() ?? workbookDataRef.current;
    if (!workbookData) {
      return content;
    }
    return serializeSpreadsheetSnapshot(workbookData);
  }, [content]);

  const saveContent = useCallback(async (nextContent: string) => {
    if (!document) {
      return;
    }
    await onSave(document.path, nextContent);
  }, [document, onSave]);

  const {
    status,
    setStatus,
    scheduleSave,
    saveNow,
    saveNowOrThrow,
  } = useSpreadsheetAutosave({
    enabled: Boolean(document) && loadState === "ready",
    delayMs: 2_000,
    // Univer 输入由内部画布和隐藏编辑器共同维护焦点；后台保存只发布稳定状态，避免 dirty/saving UI 更新打断连续输入。
    publishIntermediateStatus: false,
    readContent: readCurrentContent,
    saveContent,
  });

  useImperativeHandle(ref, () => ({
    importExcel: async (file: File) => {
      const snapshot = await importXlsxWorkbookData(new Uint8Array(await file.arrayBuffer()), stripXlsxExtension(file.name));
      const nextContent = serializeSpreadsheetSnapshot(snapshot);
      await saveContent(nextContent);
      if (containerRef.current) {
        // 导入后立即用新快照重建 Univer，避免等待外层状态回流期间画布仍显示旧 workbook。
        cleanupRuntime(runtimeRef.current);
        runtimeRef.current = createUniverRuntime(containerRef.current, snapshot, scheduleSave);
        setLoadState("ready");
        setLoadError(null);
        setStatus({ state: "clean" });
      }
      workbookDataRef.current = snapshot;
      return nextContent;
    },
    exportExcel: async () => {
      const workbookData = runtimeRef.current?.workbook.save() ?? workbookDataRef.current;
      if (!workbookData) {
        throw new Error("Excel 导出失败：当前表格尚未加载完成");
      }
      return exportXlsxWorkbookData(workbookData);
    },
  }), [saveContent, scheduleSave, setStatus]);

  useEffect(() => {
    onSaveStatusChange(status);
  }, [onSaveStatusChange, status]);

  useEffect(() => {
    onRegisterSaveNow?.(document ? saveNowOrThrow : null);
    return () => onRegisterSaveNow?.(null);
  }, [document, onRegisterSaveNow, saveNowOrThrow]);

  useEffect(() => {
    if (manualSaveRequest > 0) {
      void saveNow();
    }
  }, [manualSaveRequest, saveNow]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    cleanupRuntime(runtimeRef.current);
    runtimeRef.current = null;
    workbookDataRef.current = null;
    mountedDocumentPathRef.current = document?.path ?? null;

    if (!document || !container) {
      setLoadState("idle");
      setLoadError(null);
      setStatus({ state: "clean" });
      return undefined;
    }

    setLoadState("loading");
    setLoadError(null);

    void (async () => {
      try {
        const data = parseSpreadsheetSnapshot(content, document.name);
        if (cancelled || mountedDocumentPathRef.current !== document.path) {
          return;
        }
        const runtime = createUniverRuntime(container, data, scheduleSave);
        runtimeRef.current = runtime;
        workbookDataRef.current = data;
        setLoadState("ready");
        setStatus({ state: "clean" });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : String(error));
        setStatus({ state: "error", message: "表格编辑器加载失败" });
      }
    })();

    return () => {
      cancelled = true;
      cleanupRuntime(runtimeRef.current);
      runtimeRef.current = null;
    };
  }, [content, document, scheduleSave, setStatus]);

  if (!document) {
    return (
      <div className="empty-editor-state">
        <h1>选择或新建表格</h1>
        <p>表格文件会以 Univer workbook snapshot JSON 保存在当前知识库目录。</p>
      </div>
    );
  }

  return (
    <div className="spreadsheet-editor-root">
      {loadState === "loading" ? (
        <div className="spreadsheet-editor-state" role="status">
          <Loader2 size={18} className="spin-icon" />
          <span>正在加载表格</span>
        </div>
      ) : null}
      {loadState === "error" ? (
        <div className="spreadsheet-editor-state spreadsheet-editor-state--error" role="alert">
          <strong>表格编辑器加载失败</strong>
          <span>{loadError}</span>
        </div>
      ) : null}
      <div ref={containerRef} className="spreadsheet-editor-container" data-testid="spreadsheet-editor-container" />
    </div>
  );
});

function createUniverRuntime(
  container: HTMLElement,
  workbookData: IWorkbookData,
  onChanged: () => void,
): UniverRuntime {
  const host = document.createElement("div");
  host.className = "spreadsheet-editor-host";
  // 每个 Univer 实例使用独立 host。旧实例延迟 dispose 时只会操作自己的 host，
  // 不会和新实例共用同一个 React root container，避免 NotFoundError。
  container.replaceChildren(host);
  const univer = new Univer({
    theme: defaultTheme,
    locale: LocaleType.ZH_CN,
    // Univer 只设置 locale 不会自动加载语言包；缺失语言包会让工具栏渲染阶段抛出 LocaleService 未初始化。
    locales: {
      [LocaleType.ZH_CN]: zhCN,
    },
    logLevel: LogLevel.ERROR,
  });
  const preset = UniverSheetsCorePreset({
    container: host,
    toolbar: true,
    formulaBar: true,
    footer: {
      sheetBar: true,
      statisticBar: true,
      menus: true,
      zoomSlider: true,
    },
    // Univer 的工具栏挂载在 UI header 区域；关闭 header 会导致顶部工具栏不渲染。
    header: true,
  });
  univer.registerPlugins(preset.plugins.map((plugin) => Array.isArray(plugin) ? plugin : [plugin]) as never);
  const univerAPI = FUniver.newAPI(univer);
  const workbook = univerAPI.createWorkbook(workbookData);
  const commandListener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
    // Univer 编辑单元格时会先触发 doc rich-text mutation，那只是输入框中间态；
    // 自动保存只跟随会进入 workbook snapshot 的 sheet mutation，避免输入过程被整本表格序列化打断。
    if (isPersistedSpreadsheetMutation(event)) {
      onChanged();
    }
  });
  const disposePointerReleaseGuard = installSpreadsheetPointerReleaseGuard(container);

  return {
    univer,
    workbook,
    host,
    disposed: false,
    disposeChangeListener: () => {
      commandListener.dispose();
      disposePointerReleaseGuard();
    },
  };
}

function isPersistedSpreadsheetMutation(event: { id?: string; type?: CommandType }): boolean {
  if (event.type !== CommandType.MUTATION || typeof event.id !== "string") {
    return false;
  }
  if (!event.id.startsWith("sheet.mutation.")) {
    return false;
  }
  return !NON_PERSISTED_SPREADSHEET_MUTATIONS.has(event.id);
}

const NON_PERSISTED_SPREADSHEET_MUTATIONS = new Set([
  "sheet.mutation.empty",
  "sheet.mutation.mark-dirty-filter-change",
  "sheet.mutation.data-validation-formula-mark-dirty",
]);

function installSpreadsheetPointerReleaseGuard(container: HTMLElement): () => void {
  let pendingPointer: PendingSpreadsheetPointer | null = null;
  let lastCanvas: HTMLCanvasElement | null = null;
  let idleMoveReleaseSent = false;
  let hasActivePointerSequence = false;

  const rememberPointerDown = (event: PointerEvent) => {
    if (!isSpreadsheetPointerButtonTracked(event.button)) {
      return;
    }
    idleMoveReleaseSent = false;
    hasActivePointerSequence = true;
    const canvas = findCanvasFromEvent(event, container);
    if (!canvas) {
      return;
    }
    lastCanvas = canvas;
    pendingPointer = createPendingPointer(event, canvas);
  };

  const rememberMouseDown = (event: MouseEvent) => {
    if (!isSpreadsheetPointerButtonTracked(event.button)) {
      return;
    }
    idleMoveReleaseSent = false;
    hasActivePointerSequence = true;
    if (pendingPointer) {
      return;
    }
    const canvas = findCanvasFromEvent(event, container);
    if (!canvas) {
      return;
    }
    lastCanvas = canvas;
    pendingPointer = createPendingPointer(event, canvas);
  };

  const clearIfCanvasHandledRelease = (event: PointerEvent | MouseEvent) => {
    if (event.target === pendingPointer?.canvas) {
      pendingPointer = null;
      hasActivePointerSequence = false;
    }
  };

  const releaseIfLost = (event: PointerEvent | MouseEvent) => {
    if (!pendingPointer || event.target === pendingPointer.canvas) {
      return;
    }
    dispatchSyntheticCanvasRelease(pendingPointer, event);
    pendingPointer = null;
    idleMoveReleaseSent = true;
    hasActivePointerSequence = false;
  };

  const releaseIfMoveWithoutButton = (event: PointerEvent | MouseEvent) => {
    if (event.buttons !== 0) {
      return;
    }
    if (pendingPointer) {
      // Univer 的选区拖拽只在 scene pointerup 后解绑；在移动事件的捕获阶段补齐释放，避免本次 hover 继续扩选。
      dispatchSyntheticCanvasRelease(pendingPointer, event);
      pendingPointer = null;
      idleMoveReleaseSent = true;
      hasActivePointerSequence = false;
      return;
    }
    if (!hasActivePointerSequence || idleMoveReleaseSent || !isEventInsideContainer(event, container)) {
      return;
    }
    const canvas = findCanvasForSyntheticRelease(event, container, lastCanvas);
    if (!canvas) {
      return;
    }
    // 兜底处理已残留的 Univer 拖拽态；只在一次空闲移动中补发一次，避免普通 hover 不断制造释放事件。
    dispatchSyntheticCanvasRelease(createPendingPointer(event, canvas, 0), event);
    idleMoveReleaseSent = true;
    hasActivePointerSequence = false;
  };

  const releaseOnWindowBlur = () => {
    if (!pendingPointer) {
      return;
    }
    dispatchSyntheticCanvasRelease(pendingPointer);
    pendingPointer = null;
    idleMoveReleaseSent = true;
    hasActivePointerSequence = false;
  };

  const releaseOnContextMenu = (event: MouseEvent) => {
    if (!isEventInsideContainer(event, container)) {
      return;
    }
    if (!pendingPointer && !hasActivePointerSequence) {
      return;
    }
    const canvas = pendingPointer?.canvas ?? findCanvasForSyntheticRelease(event, container, lastCanvas);
    if (!canvas) {
      return;
    }
    // 右键菜单可能截断 Univer 画布收到的 pointerup/mouseup；菜单打开前补齐释放，避免选区拖拽态残留成整屏高亮。
    dispatchSyntheticCanvasRelease(pendingPointer ?? createPendingPointer(event, canvas, 2), event);
    pendingPointer = null;
    idleMoveReleaseSent = true;
    hasActivePointerSequence = false;
  };

  container.addEventListener("pointerdown", rememberPointerDown, true);
  container.addEventListener("mousedown", rememberMouseDown, true);
  container.addEventListener("contextmenu", releaseOnContextMenu, true);
  container.addEventListener("pointerup", clearIfCanvasHandledRelease);
  container.addEventListener("mouseup", clearIfCanvasHandledRelease);
  container.addEventListener("pointercancel", releaseIfLost, true);
  document.addEventListener("pointermove", releaseIfMoveWithoutButton, true);
  document.addEventListener("mousemove", releaseIfMoveWithoutButton, true);
  document.addEventListener("pointerup", releaseIfLost, true);
  document.addEventListener("mouseup", releaseIfLost, true);
  document.addEventListener("pointercancel", releaseIfLost, true);
  window.addEventListener("blur", releaseOnWindowBlur);

  return () => {
    container.removeEventListener("pointerdown", rememberPointerDown, true);
    container.removeEventListener("mousedown", rememberMouseDown, true);
    container.removeEventListener("contextmenu", releaseOnContextMenu, true);
    container.removeEventListener("pointerup", clearIfCanvasHandledRelease);
    container.removeEventListener("mouseup", clearIfCanvasHandledRelease);
    container.removeEventListener("pointercancel", releaseIfLost, true);
    document.removeEventListener("pointermove", releaseIfMoveWithoutButton, true);
    document.removeEventListener("mousemove", releaseIfMoveWithoutButton, true);
    document.removeEventListener("pointerup", releaseIfLost, true);
    document.removeEventListener("mouseup", releaseIfLost, true);
    document.removeEventListener("pointercancel", releaseIfLost, true);
    window.removeEventListener("blur", releaseOnWindowBlur);
  };
}

function isSpreadsheetPointerButtonTracked(button: number): boolean {
  return button === 0 || button === 2;
}

function createPendingPointer(
  event: PointerEvent | MouseEvent,
  canvas: HTMLCanvasElement,
  button = event.button,
): PendingSpreadsheetPointer {
  return {
    canvas,
    pointerId: event instanceof PointerEvent ? event.pointerId : undefined,
    pointerType: event instanceof PointerEvent ? event.pointerType : undefined,
    button,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
  };
}

function dispatchSyntheticCanvasRelease(
  pendingPointer: PendingSpreadsheetPointer,
  sourceEvent?: PointerEvent | MouseEvent,
): void {
  const releaseEvent = sourceEvent ? createPendingPointer(sourceEvent, pendingPointer.canvas, pendingPointer.button) : pendingPointer;
  const releaseButton = pendingPointer.button >= 0 ? pendingPointer.button : 0;
  if (typeof PointerEvent === "function") {
    pendingPointer.canvas.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: releaseEvent.pointerId ?? pendingPointer.pointerId ?? 1,
      pointerType: releaseEvent.pointerType ?? pendingPointer.pointerType ?? "mouse",
      button: releaseButton,
      buttons: 0,
      clientX: releaseEvent.clientX,
      clientY: releaseEvent.clientY,
      screenX: releaseEvent.screenX,
      screenY: releaseEvent.screenY,
    }));
  }
  pendingPointer.canvas.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: releaseButton,
    buttons: 0,
    clientX: releaseEvent.clientX,
    clientY: releaseEvent.clientY,
    screenX: releaseEvent.screenX,
    screenY: releaseEvent.screenY,
  }));
}

function findCanvasFromEvent(event: PointerEvent | MouseEvent, container: HTMLElement): HTMLCanvasElement | null {
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
  const canvas = eventPath.find((target): target is HTMLCanvasElement => target instanceof HTMLCanvasElement)
    ?? (event.target instanceof HTMLCanvasElement ? event.target : null);
  return canvas && container.contains(canvas) ? canvas : null;
}

function findCanvasForSyntheticRelease(
  event: PointerEvent | MouseEvent,
  container: HTMLElement,
  lastCanvas: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const eventCanvas = findCanvasFromEvent(event, container);
  if (eventCanvas) {
    return eventCanvas;
  }
  if (lastCanvas && container.contains(lastCanvas)) {
    return lastCanvas;
  }
  return container.querySelector("canvas");
}

function isEventInsideContainer(event: PointerEvent | MouseEvent, container: HTMLElement): boolean {
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
  return eventPath.includes(container) || (event.target instanceof Node && container.contains(event.target));
}

function cleanupRuntime(runtime: UniverRuntime | null) {
  if (!runtime || runtime.disposed) {
    return;
  }
  runtime.disposed = true;
  runtime.disposeChangeListener();
  // Univer 内部也会同步卸载自己的 React root。React 18 开发模式会在同一轮
  // passive effect 中双调用清理函数；这里延后到当前提交完成后再 dispose，
  // 避免 “synchronously unmount a root while React was already rendering” 和后续白屏。
  window.setTimeout(() => {
    try {
      runtime.univer.dispose();
    } catch (error) {
      if (!isIgnorableUniverDisposeError(error)) {
        console.warn("表格编辑器清理运行时失败", error);
      }
    } finally {
      runtime.host.remove();
    }
  }, 0);
}

function isIgnorableUniverDisposeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function stripXlsxExtension(fileName: string): string {
  return fileName.replace(/\.xlsx$/i, "") || "导入表格";
}
