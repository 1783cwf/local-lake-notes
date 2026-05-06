import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveStatus } from "../../app/appState";

interface UseSpreadsheetAutosaveOptions {
  enabled: boolean;
  delayMs?: number;
  readBytes: () => Promise<Uint8Array>;
  saveBytes: (bytes: Uint8Array) => Promise<void>;
}

interface SaveContext {
  enabled: boolean;
  readBytes: () => Promise<Uint8Array>;
  saveBytes: (bytes: Uint8Array) => Promise<void>;
  version: number;
}

export function useSpreadsheetAutosave({
  enabled,
  delayMs = 900,
  readBytes,
  saveBytes,
}: UseSpreadsheetAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>({ state: "clean" });
  const timerRef = useRef<number | undefined>();
  const saveRunRef = useRef(0);
  const saveContextRef = useRef<SaveContext>({
    enabled,
    readBytes,
    saveBytes,
    version: 0,
  });
  const currentContext = saveContextRef.current;
  if (currentContext.enabled !== enabled || currentContext.saveBytes !== saveBytes) {
    saveRunRef.current += 1;
    saveContextRef.current = {
      enabled,
      readBytes,
      saveBytes,
      version: currentContext.version + 1,
    };
  } else if (currentContext.readBytes !== readBytes) {
    saveContextRef.current = {
      ...currentContext,
      readBytes,
    };
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const runSave = useCallback(async (throwOnError: boolean) => {
    const context = saveContextRef.current;
    if (!context.enabled) {
      return;
    }

    clearTimer();
    const runId = saveRunRef.current + 1;
    saveRunRef.current = runId;
    setStatus({ state: "saving" });

    try {
      const bytes = await context.readBytes();
      await context.saveBytes(bytes);
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
  }, [clearTimer]);

  const saveNow = useCallback(() => runSave(false), [runSave]);
  const saveNowOrThrow = useCallback(() => runSave(true), [runSave]);

  const scheduleSave = useCallback(() => {
    const version = saveContextRef.current.version;
    if (!saveContextRef.current.enabled) {
      return;
    }

    setStatus({ state: "dirty" });
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (saveContextRef.current.version !== version) {
        return;
      }
      void saveNow();
    }, delayMs);
  }, [clearTimer, delayMs, saveNow]);

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
