import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type {
  DocumentOpenMode,
  DocumentTypographySettings,
  FileDownloadInput,
  GlobalTypographySettings,
  SaveStatus,
  TypographySettings,
  UploadImageInput,
  UploadImageOutput,
} from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import type { LakeEditorInstance } from "./editorTypes";
import type { LakeAiImportContentType } from "./lakeAiImport";
import type { LakeDocumentExportRequest } from "./lakeExport";
import { createLakeEditor, createLakeViewer, destroyLakeEditor, hasLakeEditorRuntime, hasLakeViewerRuntime } from "./lakeEditorAdapter";
import { prepareAiMarkdownForLakeImport } from "./lakeAiImport";
import {
  composeLakeDocumentWithTypography,
  splitLakeDocumentTypography,
} from "./lakeDocumentTypography";
import {
  lakeSelectionCapability,
  readLakeEditorSelection,
  replaceLakeEditorSelection,
  type LakeSelectionCapability,
} from "./lakeSelectionAdapter";
import { createEditorFileUpload, createEditorImageUpload } from "./uploadAdapter";
import {
  collectResourceReferences,
  createLakeResourcePlaceholder,
  dehydrateLakeResources,
  dehydrateResourceText,
  hydrateLakeResourcesWithPreviews,
  normalizeResourcePreviewConcurrency,
  parseResourceReference,
  resourceReferenceFromUpload,
  runResourcePreviewQueue,
  rewriteLakeResourceUrls,
  type ResourcePreview,
} from "./resourceReference";
import { defaultTypographySettings, resolveTypographySettings } from "../settings/typographySettingsStore";
import { useLakeAutosave } from "./useLakeAutosave";

interface LakeEditorProps {
  document: WorkspaceDocument | null;
  content: string;
  mode?: DocumentOpenMode;
  manualSaveRequest: number;
  exportRequest: LakeDocumentExportRequest | null;
  onSave: (relativePath: string, content: string) => Promise<void>;
  onExportContent: (request: LakeDocumentExportRequest, content: string) => Promise<void>;
  onUploadImage: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview: (resourceRef: string) => Promise<string>;
  resourcePreviewConcurrency?: number;
  globalTypography?: GlobalTypographySettings;
  documentTypography?: DocumentTypographySettings;
  onDocumentTypographyChange?: (settings: DocumentTypographySettings) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
  onRegisterReadContent?: (readContent: (() => string) | null) => void;
  onRegisterReadSelection?: (readSelection: (() => string | null) | null) => void;
  onRegisterReplaceSelection?: (replaceSelection: ((content: string) => boolean) | null) => void;
  onSelectionCapabilityChange?: (capability: LakeSelectionCapability) => void;
  aiPreviewContent?: string | null;
  aiPreviewContentType?: LakeAiImportContentType;
  aiPreviewRequestId?: number;
  onAiPreviewApplied?: () => void;
}

export function LakeEditor({
  document,
  content,
  mode = "edit",
  manualSaveRequest,
  exportRequest,
  onSave,
  onExportContent,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  resourcePreviewConcurrency,
  globalTypography = defaultTypographySettings,
  documentTypography,
  onDocumentTypographyChange,
  onSaveStatusChange,
  onRegisterSaveNow,
  onRegisterReadContent,
  onRegisterReadSelection,
  onRegisterReplaceSelection,
  onSelectionCapabilityChange,
  aiPreviewContent,
  aiPreviewContentType = "text/markdown",
  aiPreviewRequestId = 0,
  onAiPreviewApplied,
}: LakeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LakeEditorInstance | null>(null);
  const handledExportRequestRef = useRef(0);
  const resourcePreviewsRef = useRef<ResourcePreview[]>([]);
  const lastAssistantSelectionRef = useRef<string | null>(null);
  const documentPath = document?.path ?? null;
  const isReadMode = mode === "read";
  const parsedContent = useMemo(() => splitLakeDocumentTypography(content), [content]);
  const effectiveDocumentTypography = documentTypography ?? parsedContent.documentTypography;
  const parsedDocumentTypography = parsedContent.documentTypography;
  const effectiveTypography = useMemo<TypographySettings>(() => (
    resolveTypographySettings(effectiveDocumentTypography, globalTypography)
  ), [effectiveDocumentTypography, globalTypography]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onDocumentTypographyChange?.(parsedDocumentTypography);
  }, [onDocumentTypographyChange, parsedDocumentTypography]);

  const readLakeContent = useCallback(() => {
    const body = dehydrateLakeResources(editorRef.current?.getDocument("text/lake") ?? parsedContent.body, resourcePreviewsRef.current);
    return composeLakeDocumentWithTypography(body, effectiveDocumentTypography);
  }, [effectiveDocumentTypography, parsedContent.body]);

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
  const readAssistantContent = useCallback(() => {
    return dehydrateResourceText(editorRef.current?.getDocument("text/markdown") ?? readLakeContent(), resourcePreviewsRef.current);
  }, [readLakeContent]);
  const readAssistantSelection = useCallback(() => {
    const selection = readLakeEditorSelection(editorRef.current);
    if (selection) {
      const markdown = dehydrateResourceText(selection.markdown, resourcePreviewsRef.current);
      lastAssistantSelectionRef.current = markdown;
      return markdown;
    }
    return lastAssistantSelectionRef.current;
  }, []);
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
      if (!documentPath) {
        return;
      }
      await onSave(documentPath, nextContent);
    },
    [documentPath, onSave],
  );

  const { status, setStatus, scheduleSave, saveNow, saveNowOrThrow } = useLakeAutosave({
    enabled: Boolean(documentPath) && !isReadMode,
    readContent,
    saveContent,
  });

  useEffect(() => {
    onSaveStatusChange(status);
  }, [onSaveStatusChange, status]);

  useEffect(() => {
    onRegisterSaveNow?.(documentPath && !isReadMode ? saveNowOrThrow : null);
    return () => onRegisterSaveNow?.(null);
  }, [documentPath, isReadMode, onRegisterSaveNow, saveNowOrThrow]);

  useEffect(() => {
    onRegisterReadContent?.(documentPath && !isReadMode ? readAssistantContent : null);
    return () => onRegisterReadContent?.(null);
  }, [documentPath, isReadMode, onRegisterReadContent, readAssistantContent]);

  useEffect(() => {
    onRegisterReadSelection?.(documentPath && !isReadMode ? readAssistantSelection : null);
    return () => onRegisterReadSelection?.(null);
  }, [documentPath, isReadMode, onRegisterReadSelection, readAssistantSelection]);

  useEffect(() => {
    const replaceSelection = (markdown: string) => {
      const preparedContent = prepareAiMarkdownForLakeImport(markdown);
      const replaced = replaceLakeEditorSelection(editorRef.current, preparedContent.type, preparedContent.content);
      if (replaced) {
        lastAssistantSelectionRef.current = null;
        scheduleSave();
      }
      return replaced;
    };
    onRegisterReplaceSelection?.(documentPath && !isReadMode ? replaceSelection : null);
    return () => onRegisterReplaceSelection?.(null);
  }, [documentPath, isReadMode, onRegisterReplaceSelection, scheduleSave]);

  // Lake 实例只跟容器和文档路径绑定；内容刷新单独处理，避免 workspace 刷新时销毁编辑器导致右侧空白。
  useLayoutEffect(() => {
    if (!documentPath || !containerRef.current) {
      destroyLakeEditor(editorRef.current);
      editorRef.current = null;
      onSelectionCapabilityChange?.({ canReadSelection: false, canReplaceSelection: false });
      setLoadError(null);
      return;
    }

    const hasRuntime = isReadMode ? hasLakeViewerRuntime() : hasLakeEditorRuntime();
    if (!hasRuntime) {
      onSelectionCapabilityChange?.({ canReadSelection: false, canReplaceSelection: false });
      setLoadError(`${isReadMode ? "语雀阅读器" : "语雀编辑器"}资源未加载，请检查本地 vendor 文件`);
      return;
    }

    setLoadError(null);
    destroyLakeEditor(editorRef.current);
    let editor: LakeEditorInstance;
    try {
      const downloadFile = (file: { src: string; name: string }) => (
        onDownloadFile({ url: file.src, filename: file.name, resourceRef: resolveResourceRef(file.src) })
      );
      editor = isReadMode
        ? createLakeViewer(containerRef.current, {
          downloadFile,
          typography: effectiveTypography,
        })
        : createLakeEditor(containerRef.current, {
          onContentChange: () => {
            scheduleSave();
          },
          uploadImage: async (request) => registerUploadPreview(await createEditorImageUpload(request, onUploadImage)),
          uploadFile: async (file) => registerUploadPreview(await createEditorFileUpload(file, onUploadFile)),
          downloadFile,
          typography: effectiveTypography,
        });
      editorRef.current = editor;
      // 阅读模式只暴露 viewer，不提供替换选区能力，避免 AI 或快捷操作改写只读文档。
      onSelectionCapabilityChange?.(isReadMode ? { canReadSelection: false, canReplaceSelection: false } : lakeSelectionCapability(editor));
    } catch (error) {
      editorRef.current = null;
      onSelectionCapabilityChange?.({ canReadSelection: false, canReplaceSelection: false });
      setLoadError(toMessage(error));
      return;
    }

    return () => {
      destroyLakeEditor(editor);
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
      onSelectionCapabilityChange?.({ canReadSelection: false, canReplaceSelection: false });
    };
  }, [documentPath, effectiveTypography, isReadMode, onDownloadFile, onSelectionCapabilityChange, onUploadFile, onUploadImage, registerUploadPreview, resolveResourceRef, scheduleSave]);

  useEffect(() => {
    if (!documentPath || isReadMode) {
      lastAssistantSelectionRef.current = null;
      return;
    }
    const rememberCurrentSelection = () => {
      const selection = readLakeEditorSelection(editorRef.current);
      if (!selection) {
        return;
      }
      // AI 面板会抢走焦点，Lake 运行时可能随后清空选区；这里只缓存显式 API 返回的内容，不读取 DOM 选区。
      lastAssistantSelectionRef.current = dehydrateResourceText(selection.markdown, resourcePreviewsRef.current);
    };

    window.document.addEventListener("selectionchange", rememberCurrentSelection);
    containerRef.current?.addEventListener("mouseup", rememberCurrentSelection);
    containerRef.current?.addEventListener("keyup", rememberCurrentSelection);
    return () => {
      window.document.removeEventListener("selectionchange", rememberCurrentSelection);
      containerRef.current?.removeEventListener("mouseup", rememberCurrentSelection);
      containerRef.current?.removeEventListener("keyup", rememberCurrentSelection);
    };
  }, [documentPath, isReadMode]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!documentPath || !editor) {
      return;
    }

    let cancelled = false;
    resourcePreviewsRef.current = [];
    lastAssistantSelectionRef.current = null;
    setLoadError(null);
    const resourceRefs = isReadMode ? [] : Array.from(new Set(collectResourceReferences(parsedContent.body, { includeFileCards: true })));
    const placeholderPreviews = resourceRefs.map((resourceRef) => ({
      resourceRef,
      previewUrl: createLakeResourcePlaceholder(resourceRef),
    }));
    resourcePreviewsRef.current = placeholderPreviews;
    const placeholderContent = hydrateLakeResourcesWithPreviews(parsedContent.body, placeholderPreviews, { includeFileCards: true });
    editor.setDocument("text/lake", placeholderContent);
    setStatus({ state: "clean" });

    void runResourcePreviewQueue(
      resourceRefs,
      normalizeResourcePreviewConcurrency(resourcePreviewConcurrency),
      async (resourceRef) => {
        try {
          const previewUrl = await onPrepareResourcePreview(resourceRef);
          if (cancelled || editorRef.current !== editor) {
            return;
          }
          const previousPreview = resourcePreviewsRef.current.find((preview) => (
            preview.resourceRef === resourceRef
          ))?.previewUrl;
          rememberPreview(resourceRef, previewUrl);
          const currentContent = editor.getDocument("text/lake");
          const nextContent = previousPreview
            ? rewriteLakeResourceUrls(currentContent, (value) => (value === previousPreview ? previewUrl : value), { includeFileCards: true })
            : hydrateLakeResourcesWithPreviews(currentContent, resourcePreviewsRef.current, { includeFileCards: true });
          editor.setDocument("text/lake", nextContent);
        } catch {
          if (cancelled || editorRef.current !== editor) {
            return;
          }
          // 单张远端图片失败不能阻塞文档打开，保留占位图让用户知道该资源仍未加载。
          setStatus({ state: "clean" });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [documentPath, isReadMode, onPrepareResourcePreview, parsedContent.body, rememberPreview, resourcePreviewConcurrency, setStatus]);

  useEffect(() => {
    if (!isReadMode && manualSaveRequest > 0) {
      void saveNow();
    }
  }, [isReadMode, manualSaveRequest, saveNow]);

  useEffect(() => {
    if (isReadMode || !aiPreviewContent || aiPreviewRequestId <= 0 || !documentPath || !editorRef.current) {
      return;
    }
    editorRef.current.setDocument(aiPreviewContentType, aiPreviewContent);
    scheduleSave();
    onAiPreviewApplied?.();
  }, [aiPreviewContent, aiPreviewContentType, aiPreviewRequestId, documentPath, isReadMode, onAiPreviewApplied, scheduleSave]);

  useEffect(() => {
    if (
      !exportRequest
      || exportRequest.document.path !== documentPath
      || handledExportRequestRef.current === exportRequest.id
    ) {
      return;
    }

    handledExportRequestRef.current = exportRequest.id;
    void onExportContent(exportRequest, readExportContent(exportRequest));
  }, [documentPath, exportRequest, onExportContent, readExportContent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isReadMode && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isReadMode, saveNow]);

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

  return (
    <div
      ref={containerRef}
      className={`lake-editor-root ${isReadMode ? "is-read-mode" : "is-edit-mode"}`}
      style={{
        "--app-document-font-family": effectiveTypography.fontFamily,
        "--app-document-font-size": `${effectiveTypography.defaultFontSize}px`,
      } as CSSProperties}
    />
  );
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
