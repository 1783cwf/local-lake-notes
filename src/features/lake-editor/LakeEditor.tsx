import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { FileDownloadInput, SaveStatus, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import type { LakeEditorInstance } from "./editorTypes";
import type { LakeDocumentExportRequest } from "./lakeExport";
import { createLakeEditor, destroyLakeEditor, hasLakeEditorRuntime } from "./lakeEditorAdapter";
import { createEditorFileUpload, createEditorImageUpload } from "./uploadAdapter";
import {
  dehydrateLakeResources,
  dehydrateResourceText,
  hydrateLakeResources,
  parseResourceReference,
  resourceReferenceFromUpload,
  type ResourcePreview,
} from "./resourceReference";
import { useLakeAutosave } from "./useLakeAutosave";

interface LakeEditorProps {
  document: WorkspaceDocument | null;
  content: string;
  manualSaveRequest: number;
  exportRequest: LakeDocumentExportRequest | null;
  onSave: (relativePath: string, content: string) => Promise<void>;
  onExportContent: (request: LakeDocumentExportRequest, content: string) => Promise<void>;
  onUploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview: (resourceRef: string) => Promise<string>;
  onSaveStatusChange: (status: SaveStatus) => void;
  onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
}

export function LakeEditor({
  document,
  content,
  manualSaveRequest,
  exportRequest,
  onSave,
  onExportContent,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  onSaveStatusChange,
  onRegisterSaveNow,
}: LakeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LakeEditorInstance | null>(null);
  const handledExportRequestRef = useRef(0);
  const resourcePreviewsRef = useRef<ResourcePreview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const readLakeContent = useCallback(() => {
    return dehydrateLakeResources(editorRef.current?.getDocument("text/lake") ?? content, resourcePreviewsRef.current);
  }, [content]);

  const rememberPreview = useCallback((resourceRef: string, previewUrl: string) => {
    resourcePreviewsRef.current = rememberPreviewInList(resourcePreviewsRef.current, resourceRef, previewUrl);
  }, []);

  const registerUploadPreview = useCallback((output: UploadImageOutput): UploadImageOutput => {
    const resourceRef = resourceReferenceFromUpload(output);
    const previewUrl = output.previewUrl ?? output.src ?? output.url;
    if (!resourceRef) {
      return output;
    }
    rememberPreview(resourceRef, previewUrl);
    return {
      ...output,
      url: previewUrl,
      src: previewUrl,
      resourceRef,
      previewUrl,
    };
  }, [rememberPreview]);

  const resolveResourceRef = useCallback((url: string): string | undefined => {
    if (parseResourceReference(url)) {
      return url;
    }
    return resourcePreviewsRef.current.find((preview) => preview.previewUrl === url)?.resourceRef;
  }, []);

  const readContent = useCallback(() => {
    return readLakeContent();
  }, [readLakeContent]);
  const readExportContent = useCallback((request: LakeDocumentExportRequest) => {
    if (request.format === "html" || request.format === "pdf") {
      return dehydrateLakeResources(editorRef.current?.getDocument("text/html") ?? content, resourcePreviewsRef.current);
    }
    if (request.format === "markdown") {
      return dehydrateResourceText(editorRef.current?.getDocument("text/markdown") ?? content, resourcePreviewsRef.current);
    }
    return readContent();
  }, [content, readContent]);

  const saveContent = useCallback(
    async (nextContent: string) => {
      if (!document) {
        return;
      }
      await onSave(document.path, nextContent);
    },
    [document, onSave],
  );

  const { status, setStatus, scheduleSave, saveNow, saveNowOrThrow } = useLakeAutosave({
    enabled: Boolean(document),
    readContent,
    saveContent,
  });

  useEffect(() => {
    onSaveStatusChange(status);
  }, [onSaveStatusChange, status]);

  useEffect(() => {
    onRegisterSaveNow?.(document ? saveNowOrThrow : null);
    return () => onRegisterSaveNow?.(null);
  }, [document, onRegisterSaveNow, saveNowOrThrow]);

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
    let cancelled = false;
    let editor: LakeEditorInstance;
    try {
      editor = createLakeEditor(containerRef.current, {
        onContentChange: () => {
          scheduleSave();
        },
        uploadImage: async (request) => registerUploadPreview(await createEditorImageUpload(request, onUploadImage)),
        uploadFile: async (file) => registerUploadPreview(await createEditorFileUpload(file, onUploadFile)),
        downloadFile: (file) => onDownloadFile({ url: file.src, filename: file.name, resourceRef: resolveResourceRef(file.src) }),
      });
      editorRef.current = editor;
      void hydrateLakeResources(content, async (resourceRef) => {
        const previewUrl = await onPrepareResourcePreview(resourceRef);
        rememberPreview(resourceRef, previewUrl);
        return previewUrl;
      }).then((hydratedContent) => {
        if (!cancelled) {
          editor.setDocument("text/lake", hydratedContent);
          setStatus({ state: "clean" });
        }
      }).catch((error) => {
        if (!cancelled) {
          setLoadError(toMessage(error));
        }
      });
      setStatus({ state: "clean" });
    } catch (error) {
      editorRef.current = null;
      setLoadError(toMessage(error));
      return;
    }

    return () => {
      cancelled = true;
      destroyLakeEditor(editor);
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [content, document, onDownloadFile, onPrepareResourcePreview, onUploadFile, onUploadImage, scheduleSave, setStatus]);

  useEffect(() => {
    if (manualSaveRequest > 0) {
      void saveNow();
    }
  }, [manualSaveRequest, saveNow]);

  useEffect(() => {
    if (!exportRequest || handledExportRequestRef.current === exportRequest.id) {
      return;
    }

    handledExportRequestRef.current = exportRequest.id;
    void onExportContent(exportRequest, readExportContent(exportRequest));
  }, [exportRequest, onExportContent, readExportContent]);

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

function rememberPreviewInList(previews: ResourcePreview[], resourceRef: string, previewUrl: string): ResourcePreview[] {
  return [...previews.filter((preview) => preview.resourceRef !== resourceRef && preview.previewUrl !== previewUrl), {
    resourceRef,
    previewUrl,
  }];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
