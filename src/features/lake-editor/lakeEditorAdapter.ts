import type { UploadImageOutput } from "../../app/appState";
import type { LakeEditorInstance } from "./editorTypes";

export interface CreateLakeEditorOptions {
  uploadImage: (request: unknown) => Promise<UploadImageOutput>;
  onContentChange: () => void;
}

export function hasLakeEditorRuntime(): boolean {
  return Boolean(window.Doc?.createOpenEditor);
}

export function createLakeEditor(
  element: HTMLElement,
  options: CreateLakeEditorOptions,
): LakeEditorInstance {
  if (!window.Doc?.createOpenEditor) {
    throw new Error("语雀编辑器资源未加载");
  }

  const editor = window.Doc.createOpenEditor(element, {
    input: {},
    defaultFontsize: 19,
    toc: {
      enable: true,
      normalView: true,
    },
    image: {
      createUploadPromise: options.uploadImage,
      isCaptureImageURL(url: string) {
        return !url.startsWith("http://") && !url.startsWith("https://");
      },
    },
  });

  editor.on("contentchange", options.onContentChange);
  return editor;
}

export function destroyLakeEditor(editor: LakeEditorInstance | null): void {
  if (!editor) {
    return;
  }

  if (typeof editor.destroy === "function") {
    editor.destroy();
    return;
  }

  if (typeof editor.destory === "function") {
    editor.destory();
  }
}
