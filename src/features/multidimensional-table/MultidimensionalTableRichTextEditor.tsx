import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { FileDownloadInput, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type { LakeEditorInstance } from "../lake-editor/editorTypes";
import { createLakeEditor, destroyLakeEditor, hasLakeEditorRuntime } from "../lake-editor/lakeEditorAdapter";
import {
  dehydrateLakeResources,
  hydrateLakeResources,
  parseResourceReference,
  resourceReferenceFromUpload,
  type ResourcePreview,
} from "../lake-editor/resourceReference";
import { createEditorFileUpload, createEditorImageUpload } from "../lake-editor/uploadAdapter";

interface MultidimensionalTableRichTextEditorProps {
  value: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onUploadImage?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview?: (resourceRef: string) => Promise<string>;
}

export function MultidimensionalTableRichTextEditor({
  value,
  ariaLabel = "记录正文内容",
  onChange,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
}: MultidimensionalTableRichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<LakeEditorInstance | null>(null);
  const previewsRef = useRef<ResourcePreview[]>([]);
  const lastValueRef = useRef<string | null>(null);
  const settingDocumentRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const uploadImageRef = useRef(onUploadImage);
  const uploadFileRef = useRef(onUploadFile);
  const downloadFileRef = useRef(onDownloadFile);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    uploadImageRef.current = onUploadImage;
    uploadFileRef.current = onUploadFile;
    downloadFileRef.current = onDownloadFile;
  }, [onChange, onDownloadFile, onUploadFile, onUploadImage]);

  const rememberPreview = useCallback((resourceRef: string, previewUrl: string) => {
    previewsRef.current = [
      ...previewsRef.current.filter((preview) => preview.resourceRef !== resourceRef && preview.previewUrl !== previewUrl),
      { resourceRef, previewUrl },
    ];
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
    return previewsRef.current.find((preview) => preview.previewUrl === url)?.resourceRef;
  }, []);

  useLayoutEffect(() => {
    if (!containerRef.current || !hasLakeEditorRuntime()) {
      setLoadError("语雀编辑器资源未加载，已切换到基础文本编辑");
      return;
    }

    setLoadError(null);
    let editor: LakeEditorInstance;
    try {
      editor = createLakeEditor(containerRef.current, {
        onContentChange: () => {
          if (settingDocumentRef.current) {
            return;
          }
          const nextValue = dehydrateLakeResources(editor.getDocument("text/lake"), previewsRef.current);
          lastValueRef.current = nextValue;
          onChangeRef.current(nextValue);
        },
        uploadImage: async (request) => registerUploadPreview(await createEditorImageUpload(request, uploadImageRef.current ?? rejectUpload)),
        uploadFile: async (file) => registerUploadPreview(await createEditorFileUpload(file, uploadFileRef.current ?? rejectUpload)),
        downloadFile: (file) => {
          void downloadFileRef.current?.({ url: file.src, filename: file.name, resourceRef: resolveResourceRef(file.src) });
        },
      });
      editorRef.current = editor;
    } catch (error) {
      editorRef.current = null;
      setLoadError(error instanceof Error ? error.message : String(error));
      return;
    }

    return () => {
      destroyLakeEditor(editor);
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [registerUploadPreview, resolveResourceRef]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastValueRef.current) {
      return;
    }

    let cancelled = false;
    previewsRef.current = [];
    const hydrateContent = onPrepareResourcePreview
      ? hydrateLakeResources(value, async (resourceRef) => {
        const previewUrl = await onPrepareResourcePreview(resourceRef);
        rememberPreview(resourceRef, previewUrl);
        return previewUrl;
      })
      : Promise.resolve(value);

    void hydrateContent.then((hydratedContent) => {
      if (cancelled || editorRef.current !== editor) {
        return;
      }
      settingDocumentRef.current = true;
      editor.setDocument("text/lake", hydratedContent);
      settingDocumentRef.current = false;
      lastValueRef.current = value;
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onPrepareResourcePreview, rememberPreview, value]);

  if (loadError) {
    return (
      <textarea
        className="multitable-record-body-fallback"
        aria-label={ariaLabel}
        placeholder="点击输入正文内容"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return <div ref={containerRef} className="multitable-record-body-editor lake-editor-root ne-doc-major-editor" aria-label={ariaLabel} />;
}

async function rejectUpload(): Promise<UploadImageOutput> {
  throw new Error("请先配置 OSS 上传信息");
}
