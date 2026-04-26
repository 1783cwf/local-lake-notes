export interface LakeEditorInstance {
  setDocument(type: string, content: string): void;
  getDocument(type: string): string;
  on(eventName: string, handler: (...args: unknown[]) => void): void;
  off?: (eventName: string, handler: (...args: unknown[]) => void) => void;
  destroy?: () => void;
  destory?: () => void;
}

export interface LakeEditorRuntime {
  createOpenEditor(
    element: HTMLElement,
    options: Record<string, unknown>,
  ): LakeEditorInstance;
}

declare global {
  interface Window {
    Doc?: LakeEditorRuntime;
  }
}
