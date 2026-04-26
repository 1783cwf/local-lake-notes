import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveStatus } from "../../app/appState";

interface UseLakeAutosaveOptions {
  enabled: boolean;
  delayMs?: number;
  readContent: () => string;
  saveContent: (content: string) => Promise<void>;
}

interface SaveContext {
  enabled: boolean;
  readContent: () => string;
  saveContent: (content: string) => Promise<void>;
  version: number;
}

export function useLakeAutosave({
  enabled,
  delayMs = 900,
  readContent,
  saveContent,
}: UseLakeAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>({ state: "clean" });
  const timerRef = useRef<number | undefined>();
  const saveRunRef = useRef(0);
  const saveContextRef = useRef<SaveContext>({
    enabled,
    readContent,
    saveContent,
    version: 0,
  });
  const currentContext = saveContextRef.current;
  if (
    currentContext.enabled !== enabled ||
    currentContext.saveContent !== saveContent
  ) {
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

  const saveNow = useCallback(async () => {
    const context = saveContextRef.current;
    if (!context.enabled) {
      return;
    }

    clearTimer();
    const runId = saveRunRef.current + 1;
    saveRunRef.current = runId;
    setStatus({ state: "saving" });

    try {
      const content = context.readContent();
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
    }
  }, [clearTimer]);

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
  };
}
