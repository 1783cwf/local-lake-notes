import { act, renderHook } from "@testing-library/react";

import { useLakeAutosave } from "./useLakeAutosave";

test("contentchange 后 debounce 保存最新 Lake 内容", async () => {
  vi.useFakeTimers();
  const saveContent = vi.fn(async () => undefined);
  let content = "<p>1</p>";
  const { result } = renderHook(() =>
    useLakeAutosave({
      enabled: true,
      delayMs: 100,
      readContent: () => content,
      saveContent,
    }),
  );

  act(() => {
    result.current.scheduleSave();
    content = "<p>2</p>";
    result.current.scheduleSave();
  });

  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  expect(saveContent).toHaveBeenCalledTimes(1);
  expect(saveContent).toHaveBeenCalledWith("<p>2</p>");
  vi.useRealTimers();
});

test("手动保存失败时保留错误状态", async () => {
  const { result } = renderHook(() =>
    useLakeAutosave({
      enabled: true,
      readContent: () => "<p>err</p>",
      saveContent: async () => {
        throw new Error("写入失败");
      },
    }),
  );

  await act(async () => {
    await result.current.saveNow();
  });

  expect(result.current.status).toMatchObject({
    state: "error",
    message: "写入失败",
  });
});
