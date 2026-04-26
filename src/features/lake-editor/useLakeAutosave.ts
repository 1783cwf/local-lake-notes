import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveStatus } from "../../app/appState";

interface UseLakeAutosaveOptions {
  enabled: boolean;
  delayMs?: number;
  readContent: () => string;
  saveContent: (content: string) => Promise<void>;
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

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const saveNow = useCallback(async () => {
    if (!enabled) {
      return;
    }

    clearTimer();
    const runId = saveRunRef.current + 1;
    saveRunRef.current = runId;
    setStatus({ state: "saving" });

    try {
      const content = readContent();
      await saveContent(content);
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
  }, [clearTimer, enabled, readContent, saveContent]);

  const scheduleSave = useCallback(() => {
    if (!enabled) {
      return;
    }

    setStatus({ state: "dirty" });
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      void saveNow();
    }, delayMs);
  }, [clearTimer, delayMs, enabled, saveNow]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    status,
    setStatus,
    scheduleSave,
    saveNow,
  };
}
