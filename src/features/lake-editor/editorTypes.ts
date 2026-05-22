export interface LakeEditorInstance {
  setDocument(type: string, content: string): void;
  getDocument(type: string): string;
  getSelectionDocument?: (type: string) => string;
  getSelectedDocument?: (type: string) => string;
  getSelectionText?: () => string;
  getSelectedText?: () => string;
  replaceSelection?: (type: string, content: string) => void;
  replaceSelectionDocument?: (type: string, content: string) => void;
  replaceSelectedDocument?: (type: string, content: string) => void;
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
