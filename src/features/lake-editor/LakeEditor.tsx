import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { SaveStatus, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import type { LakeEditorInstance } from "./editorTypes";
import { createLakeEditor, destroyLakeEditor, hasLakeEditorRuntime } from "./lakeEditorAdapter";
import { createEditorFileUpload, createEditorImageUpload } from "./uploadAdapter";
import { useLakeAutosave } from "./useLakeAutosave";

interface LakeEditorProps {
  document: WorkspaceDocument | null;
  content: string;
  manualSaveRequest: number;
  onSave: (relativePath: string, content: string) => Promise<void>;
  onUploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onOpenFileUrl: (url: string) => Promise<void>;
  onSaveStatusChange: (status: SaveStatus) => void;
}

export function LakeEditor({
  document,
  content,
  manualSaveRequest,
  onSave,
  onUploadImage,
  onUploadFile,
  onOpenFileUrl,
  onSaveStatusChange,
}: LakeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LakeEditorInstance | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const readContent = useCallback(() => {
    return editorRef.current?.getDocument("text/lake") ?? content;
  }, [content]);

  const saveContent = useCallback(
    async (nextContent: string) => {
      if (!document) {
        return;
      }
      await onSave(document.path, nextContent);
    },
    [document, onSave],
  );

  const { status, setStatus, scheduleSave, saveNow } = useLakeAutosave({
    enabled: Boolean(document),
    readContent,
    saveContent,
  });

  useEffect(() => {
    onSaveStatusChange(status);
  }, [onSaveStatusChange, status]);

  useLayoutEffect(() => {
    if (!document || !containerRef.current) {
      destroyLakeEditor(editorRef.current);
      editorRef.current = null;
      setLoadError(null);
      return;
    }

    if (!hasLakeEditorRuntime()) {
      setLoadError("语雀编辑器资源未加载，请检查本地 vendor 文件");
      return;
    }

    setLoadError(null);
    destroyLakeEditor(editorRef.current);
    let editor: LakeEditorInstance;
    try {
      editor = createLakeEditor(containerRef.current, {
        onContentChange: () => {
          scheduleSave();
        },
        uploadImage: (request) => createEditorImageUpload(request, onUploadImage),
        uploadFile: (file) => createEditorFileUpload(file, onUploadFile),
        openFileUrl: onOpenFileUrl,
      });
      editorRef.current = editor;
      editor.setDocument("text/lake", content);
      setStatus({ state: "clean" });
    } catch (error) {
      editorRef.current = null;
      setLoadError(toMessage(error));
      return;
    }

    return () => {
      destroyLakeEditor(editor);
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [content, document, onOpenFileUrl, onUploadFile, onUploadImage, scheduleSave, setStatus]);

  useEffect(() => {
    if (manualSaveRequest > 0) {
      void saveNow();
    }
  }, [manualSaveRequest, saveNow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  if (!document) {
    return (
      <div className="empty-editor-state">
        <h1>选择或新建 Lake 文档</h1>
        <p>当前知识库准备好后，可以直接在这里使用语雀编辑器写作。</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="empty-editor-state error-state">
        <h1>编辑器加载失败</h1>
        <p>{loadError}</p>
      </div>
    );
  }

  return <div ref={containerRef} className="lake-editor-root ne-doc-major-editor" />;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
