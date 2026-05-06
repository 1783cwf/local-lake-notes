import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
  CommandType,
  type IWorkbookData,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { defaultTheme } from "@univerjs/themes";
import { UniverSheetsCorePreset, type FWorkbook } from "@univerjs/preset-sheets-core";
import "@univerjs/preset-sheets-core/lib/index.css";

import type { SaveStatus } from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import { useSpreadsheetAutosave } from "./spreadsheetAutosave";
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
  disposeChangeListener: () => void;
}

export function SpreadsheetEditor({
  document,
  content,
  manualSaveRequest,
  onSave,
  onSaveStatusChange,
  onRegisterSaveNow,
}: SpreadsheetEditorProps) {
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
    readContent: readCurrentContent,
    saveContent,
  });

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
}

function createUniverRuntime(
  container: HTMLElement,
  workbookData: IWorkbookData,
  onChanged: () => void,
): UniverRuntime {
  container.replaceChildren();
  const univer = new Univer({
    theme: defaultTheme,
    locale: LocaleType.ZH_CN,
    logLevel: LogLevel.ERROR,
  });
  const preset = UniverSheetsCorePreset({
    container,
    toolbar: true,
    formulaBar: true,
    footer: {
      sheetBar: true,
      statisticBar: true,
      menus: true,
      zoomSlider: true,
    },
    header: false,
  });
  univer.registerPlugins(preset.plugins.map((plugin) => Array.isArray(plugin) ? plugin : [plugin]) as never);
  const univerAPI = FUniver.newAPI(univer);
  const workbook = univerAPI.createWorkbook(workbookData);
  const commandListener = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
    // Univer 初始化阶段也会触发命令，只有写入快照的数据变更才需要标记为待保存。
    if (event.type === CommandType.MUTATION) {
      onChanged();
    }
  });
  const domListener = () => onChanged();
  container.addEventListener("input", domListener);
  container.addEventListener("paste", domListener);
  container.addEventListener("cut", domListener);

  return {
    univer,
    workbook,
    disposeChangeListener: () => {
      commandListener.dispose();
      container.removeEventListener("input", domListener);
      container.removeEventListener("paste", domListener);
      container.removeEventListener("cut", domListener);
    },
  };
}

function cleanupRuntime(runtime: UniverRuntime | null) {
  if (!runtime) {
    return;
  }
  runtime.disposeChangeListener();
  runtime.univer.dispose();
}
