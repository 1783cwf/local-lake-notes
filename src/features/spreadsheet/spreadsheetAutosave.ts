import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveStatus } from "../../app/appState";

interface UseSpreadsheetAutosaveOptions {
  enabled: boolean;
  delayMs?: number;
  publishIntermediateStatus?: boolean;
  readContent: () => Promise<string>;
  saveContent: (content: string) => Promise<void>;
}

interface SaveContext {
  enabled: boolean;
  readContent: () => Promise<string>;
  saveContent: (content: string) => Promise<void>;
  version: number;
}

export function useSpreadsheetAutosave({
  enabled,
  delayMs = 900,
  publishIntermediateStatus = true,
  readContent,
  saveContent,
}: UseSpreadsheetAutosaveOptions) {
  const [status, setStatusState] = useState<SaveStatus>({ state: "clean" });
  const statusRef = useRef<SaveStatus>({ state: "clean" });
  const timerRef = useRef<number | undefined>();
  const saveRunRef = useRef(0);
  const saveContextRef = useRef<SaveContext>({
    enabled,
    readContent,
    saveContent,
    version: 0,
  });
  const currentContext = saveContextRef.current;
  if (currentContext.enabled !== enabled || currentContext.saveContent !== saveContent) {
    saveRunRef.current += 1;
    saveContextRef.current = {
      enabled,
      readContent,
      saveContent,
      version: currentContext.version + 1,
    };
  } else if (currentContext.readContent !== readContent) {
    saveContextRef.current = {
      ...currentContext,
      readContent,
    };
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const setStatus = useCallback((nextStatus: SaveStatus) => {
    if (isSameSaveStatus(statusRef.current, nextStatus)) {
      return;
    }
    statusRef.current = nextStatus;
    setStatusState((currentStatus) => {
      if (isSameSaveStatus(currentStatus, nextStatus)) {
        return currentStatus;
      }
      return nextStatus;
    });
  }, []);

  const setInternalStatus = useCallback((nextStatus: SaveStatus) => {
    if (publishIntermediateStatus || isStableSaveStatus(nextStatus)) {
      setStatus(nextStatus);
      return;
    }
    if (!isSameSaveStatus(statusRef.current, nextStatus)) {
      statusRef.current = nextStatus;
    }
  }, [publishIntermediateStatus, setStatus]);

  const runSave = useCallback(async (throwOnError: boolean) => {
    const context = saveContextRef.current;
    if (!context.enabled) {
      return;
    }

    clearTimer();
    const runId = saveRunRef.current + 1;
    saveRunRef.current = runId;
    setInternalStatus({ state: "saving" });

    try {
      const content = await context.readContent();
      await context.saveContent(content);
      if (saveRunRef.current === runId) {
        setStatus({ state: "saved", savedAt: new Date().toISOString() });
      }
    } catch (error) {
      if (saveRunRef.current === runId) {
        setStatus({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (throwOnError) {
        throw error;
      }
    }
  }, [clearTimer, setInternalStatus]);

  const saveNow = useCallback(() => runSave(false), [runSave]);
  const saveNowOrThrow = useCallback(() => runSave(true), [runSave]);

  const scheduleSave = useCallback(() => {
    const version = saveContextRef.current.version;
    if (!saveContextRef.current.enabled) {
      return;
    }

    // 表格编辑器对键盘焦点很敏感；连续 mutation 期间只在 ref 中记录 dirty，
    // 避免中间状态推动父组件重渲染，导致 Univer 正在编辑的单元格丢失输入焦点。
    if (statusRef.current.state !== "dirty") {
      setInternalStatus({ state: "dirty" });
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (saveContextRef.current.version !== version) {
        return;
      }
      void saveNow();
    }, delayMs);
  }, [clearTimer, delayMs, saveNow, setInternalStatus]);

  useEffect(() => {
    if (enabled) {
      return;
    }

    clearTimer();
    saveRunRef.current += 1;
    setStatus({ state: "clean" });
  }, [clearTimer, enabled]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    status,
    setStatus,
    scheduleSave,
    saveNow,
    saveNowOrThrow,
  };
}

function isSameSaveStatus(currentStatus: SaveStatus, nextStatus: SaveStatus): boolean {
  return (
    currentStatus.state === nextStatus.state &&
    currentStatus.message === nextStatus.message &&
    currentStatus.savedAt === nextStatus.savedAt
  );
}

function isStableSaveStatus(status: SaveStatus): boolean {
  return status.state === "clean" || status.state === "saved" || status.state === "error";
}
