import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject } from "react";
import { Bot, ChevronDown, Cloud, Download, Eye, FileSpreadsheet, FileText, Grid2X2, Loader2, Pencil, Pin, Save, Share2, Type, X } from "lucide-react";

import type {
  DocumentOpenMode,
  DocumentTypographySettings,
  GlobalTypographySettings,
  OpenDocumentTab,
  SaveStatus,
} from "../app/appState";
import type { DocumentExportFormat, ExportResourceStrategy } from "../features/lake-editor/lakeExport";
import {
  defaultTypographySettings,
  normalizeDefaultFontSize,
  normalizeFontFamily,
  resolveTypographySettings,
  supportedDefaultFontSizes,
} from "../features/settings/typographySettingsStore";
import type { WorkspaceDocument } from "../features/workspace/workspaceStore";
import { documentTitleFromPath } from "../features/workspace/workspaceStore";
import { IconButton } from "./IconButton";

export interface OpenDocumentTabView extends OpenDocumentTab {
  document: WorkspaceDocument;
}

const tabCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};
const staticTabSortingStrategy: SortingStrategy = () => null;

interface TopBarProps {
  document: WorkspaceDocument | null;
  openTabs?: OpenDocumentTabView[];
  activeTabId?: string | null;
  documentMode?: DocumentOpenMode;
  saveStatus: SaveStatus;
  onManualSave: () => void;
  onOpenAiAssistant?: () => void;
  onSetDocumentMode?: (mode: DocumentOpenMode) => void | Promise<void>;
  globalTypography?: GlobalTypographySettings;
  documentTypography?: DocumentTypographySettings;
  onSaveDocumentTypography?: (settings: DocumentTypographySettings) => void | Promise<void>;
  onActivateTab?: (tabId: string) => void | Promise<void>;
  onReorderTabs?: (orderedTabIds: string[]) => void;
  onToggleTabLocked?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void | Promise<void>;
  onCloseOtherTabs?: (tabId: string) => void | Promise<void>;
  onRenameDocument?: (title: string) => void | Promise<void>;
  onExportDocument?: (format: DocumentExportFormat, resourceStrategy: ExportResourceStrategy, signedUrlTtlSeconds: number) => void;
  onImportSpreadsheetExcel?: () => void;
  onExportSpreadsheetExcel?: () => void;
  defaultExportResourceStrategy?: ExportResourceStrategy;
  defaultSignedUrlTtlSeconds?: number;
  signedUrlExportEnabled?: boolean;
  exportBusy?: boolean;
  spreadsheetExcelBusy?: boolean;
}

export function TopBar({
  document,
  openTabs = [],
  activeTabId = null,
  documentMode = "edit",
  saveStatus,
  onManualSave,
  onOpenAiAssistant,
  onSetDocumentMode,
  globalTypography = defaultTypographySettings,
  documentTypography,
  onSaveDocumentTypography,
  onActivateTab,
  onReorderTabs,
  onToggleTabLocked,
  onCloseTab,
  onCloseOtherTabs,
  onRenameDocument,
  onExportDocument,
  onImportSpreadsheetExcel,
  onExportSpreadsheetExcel,
  defaultExportResourceStrategy = "bundle",
  defaultSignedUrlTtlSeconds = 24 * 60 * 60,
  signedUrlExportEnabled = true,
  exportBusy = false,
  spreadsheetExcelBusy = false,
}: TopBarProps) {
  const title = document ? documentTitleFromPath(document.path) : "Lake 本地笔记";
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [typographyMenuOpen, setTypographyMenuOpen] = useState(false);
  const [typographyFontFamilyDraft, setTypographyFontFamilyDraft] = useState("");
  const [typographyFontSizeDraft, setTypographyFontSizeDraft] = useState("");
  const [typographyError, setTypographyError] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tabId: string; placement: TabDropPlacement } | null>(null);
  const [resourceStrategy, setResourceStrategy] = useState<ExportResourceStrategy>(defaultExportResourceStrategy);
  const [ttlSeconds, setTtlSeconds] = useState(defaultSignedUrlTtlSeconds);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const ttlOptions = Array.from(new Set([ttlSeconds, 3600, 24 * 3600, 7 * 24 * 3600])).sort((left, right) => left - right);
  const menuTab = tabMenu ? openTabs.find((tab) => tab.id === tabMenu.tabId) : null;
  const hasClosableOtherTabs = menuTab
    ? openTabs.some((tab) => tab.id !== menuTab.id && !tab.locked)
    : false;
  const lakeReadMode = document?.kind === "lake" && documentMode === "read";
  const effectiveTypography = resolveTypographySettings(documentTypography, globalTypography);
  const tabIds = openTabs.map((tab) => tab.id);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(title);
    }
  }, [editingTitle, title]);
  useEffect(() => {
    setTabMenu(null);
  }, [activeTabId, openTabs]);
  useEffect(() => {
    const activeTabElement = activeTabRef.current;
    // 活动标签可能在横向滚动区外，切换后主动拉回可见区域，避免只露出半截标签。
    if (activeTabElement && typeof activeTabElement.scrollIntoView === "function") {
      activeTabElement.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeTabId, openTabs.length]);
  useEffect(() => {
    setResourceStrategy(defaultExportResourceStrategy);
  }, [defaultExportResourceStrategy]);
  useEffect(() => {
    if (!signedUrlExportEnabled && resourceStrategy === "signed-url") {
      setResourceStrategy("bundle");
    }
  }, [resourceStrategy, signedUrlExportEnabled]);
  useEffect(() => {
    setTtlSeconds(defaultSignedUrlTtlSeconds);
  }, [defaultSignedUrlTtlSeconds]);
  useEffect(() => {
    setTypographyFontFamilyDraft(documentTypography?.fontFamily ?? "");
    setTypographyFontSizeDraft(documentTypography?.defaultFontSize ? String(documentTypography.defaultFontSize) : "");
    setTypographyError(null);
  }, [document?.path, documentTypography?.defaultFontSize, documentTypography?.fontFamily]);

  const submitTitle = () => {
    const nextTitle = draftTitle.trim();
    setEditingTitle(false);
    if (document && nextTitle && nextTitle !== title) {
      void onRenameDocument?.(nextTitle);
    }
  };
  const exportDocument = (format: DocumentExportFormat) => {
    setExportMenuOpen(false);
    onExportDocument?.(format, resourceStrategy, ttlSeconds);
  };
  const submitDocumentTypography = (event: FormEvent) => {
    event.preventDefault();
    const nextFontFamily = typographyFontFamilyDraft.trim();
    const nextFontSize = typographyFontSizeDraft ? Number(typographyFontSizeDraft) : undefined;
    if (nextFontFamily && !normalizeFontFamily(nextFontFamily)) {
      setTypographyError("请填写有效字体");
      return;
    }
    if (nextFontSize && !normalizeDefaultFontSize(nextFontSize)) {
      setTypographyError("请选择支持的字号");
      return;
    }

    setTypographyMenuOpen(false);
    setTypographyError(null);
    void onSaveDocumentTypography?.({
      ...(nextFontFamily ? { fontFamily: nextFontFamily } : {}),
      ...(nextFontSize ? { defaultFontSize: nextFontSize } : {}),
    });
  };
  const finishTabDrag = () => {
    setDraggingTabId(null);
    setDropTarget(null);
  };
  const updateTabDropIntent = (event: DragMoveEvent | DragOverEvent) => {
    const sourceTabId = String(event.active.id);
    const targetTabId = String(event.over?.id ?? "");
    const placement = resolveTabDropPlacement(targetTabId, pointerX(event));
    setDropTarget(targetTabId && sourceTabId !== targetTabId && placement ? { tabId: targetTabId, placement } : null);
  };
  const onTabDragStart = (event: DragStartEvent) => {
    setDraggingTabId(String(event.active.id));
    setTabMenu(null);
  };
  const onTabDragMove = (event: DragMoveEvent) => updateTabDropIntent(event);
  const onTabDragOver = (event: DragOverEvent) => updateTabDropIntent(event);
  const onTabDragEnd = (event: DragEndEvent) => {
    const sourceTabId = String(event.active.id);
    const targetTabId = String(event.over?.id ?? "");
    const placement = dropTarget?.tabId === targetTabId ? dropTarget.placement : resolveTabDropPlacement(targetTabId, pointerX(event));
    finishTabDrag();
    if (!targetTabId || !placement) {
      return;
    }

    const orderedTabIds = reorderTabIds(tabIds, sourceTabId, targetTabId, placement);
    if (orderedTabIds.every((tabId, index) => tabId === openTabs[index]?.id)) {
      return;
    }
    onReorderTabs?.(orderedTabIds);
  };

  return (
    <header className="top-bar">
      <div className="top-bar__title">
        {openTabs.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={tabCollisionDetection}
            onDragStart={onTabDragStart}
            onDragMove={onTabDragMove}
            onDragOver={onTabDragOver}
            onDragEnd={onTabDragEnd}
            onDragCancel={finishTabDrag}
          >
            <SortableContext items={tabIds} strategy={staticTabSortingStrategy}>
              <div className="document-tabs" role="tablist" aria-label="打开的文档">
                {openTabs.map((tab) => (
                  <SortableDocumentTab
                    key={tab.id}
                    tab={tab}
                    selected={tab.id === activeTabId}
                    activeTabRef={activeTabRef}
                    editingTitle={editingTitle}
                    draftTitle={draftTitle}
                    dragging={draggingTabId === tab.id}
                    dropPlacement={dropTarget?.tabId === tab.id ? dropTarget.placement : null}
                    onActivateTab={onActivateTab}
                    onCloseTab={onCloseTab}
                    onSetDraftTitle={setDraftTitle}
                    onSubmitTitle={submitTitle}
                    onCancelTitleEdit={() => {
                      setDraftTitle(title);
                      setEditingTitle(false);
                    }}
                    onStartTitleEdit={() => setEditingTitle(true)}
                    onOpenContextMenu={(event) => {
                      event.preventDefault();
                      setTabMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : document && editingTitle ? (
          <input
            className="title-edit-input"
            aria-label="文档名称"
            value={draftTitle}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={submitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraftTitle(title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <h1
            title={document ? "双击重命名文档" : undefined}
            onDoubleClick={() => {
              if (document) {
                setEditingTitle(true);
              }
            }}
          >
            {title}
          </h1>
        )}
        {tabMenu && menuTab ? (
          <div
            className="document-tab-menu"
            role="menu"
            aria-label="文档标签菜单"
            style={{ left: tabMenu.x, top: tabMenu.y }}
            onMouseLeave={() => setTabMenu(null)}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleTabLocked?.(menuTab.id);
                setTabMenu(null);
              }}
            >
              {menuTab.locked ? "解除锁定" : "锁定标签"}
            </button>
            {!menuTab.locked ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void onCloseTab?.(menuTab.id);
                  setTabMenu(null);
                }}
              >
                关闭当前标签
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={!hasClosableOtherTabs}
              onClick={() => {
                void onCloseOtherTabs?.(menuTab.id);
                setTabMenu(null);
              }}
            >
              关闭其他标签
            </button>
          </div>
        ) : null}
        <span className={`save-status save-status--${saveStatus.state}`}>
          <Cloud size={14} />
          {saveStatusLabel(saveStatus)}
        </span>
      </div>
      <div className="top-bar__actions">
        {(document?.kind === "lake" && !lakeReadMode) || document?.kind === "multidimensional-table" || document?.kind === "spreadsheet" ? (
          <IconButton
            label={document.kind === "multidimensional-table" ? "AI 多维表格助手" : document.kind === "spreadsheet" ? "AI 表格助手" : "AI 文档助手"}
            onClick={() => onOpenAiAssistant?.()}
            disabled={!document}
          >
            <Bot size={18} />
          </IconButton>
        ) : null}
        {document?.kind === "lake" ? (
          <IconButton
            label={lakeReadMode ? "进入编辑模式" : "进入阅读模式"}
            active={lakeReadMode}
            onClick={() => void onSetDocumentMode?.(lakeReadMode ? "edit" : "read")}
            disabled={!document}
          >
            {lakeReadMode ? <Pencil size={18} /> : <Eye size={18} />}
          </IconButton>
        ) : null}
        {document?.kind === "lake" && !lakeReadMode ? (
          <div
            className="export-menu document-typography-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setTypographyMenuOpen(false);
              }
            }}
          >
            <button
              type="button"
              className="icon-button"
              aria-label="文档字体"
              aria-haspopup="dialog"
              aria-expanded={typographyMenuOpen}
              title="文档字体"
              onClick={() => {
                setExportMenuOpen(false);
                setTypographyMenuOpen((open) => !open);
              }}
            >
              <Type size={18} />
            </button>
            {typographyMenuOpen ? (
              <form
                className="export-menu__content document-typography-menu__content"
                role="dialog"
                aria-label="文档字体设置"
                onSubmit={submitDocumentTypography}
              >
                <label>
                  字体名称
                  <input
                    aria-label="字体名称"
                    value={typographyFontFamilyDraft}
                    placeholder={`继承：${effectiveTypography.fontFamily}`}
                    onChange={(event) => setTypographyFontFamilyDraft(event.target.value)}
                  />
                </label>
                <label>
                  文档字号
                  <select
                    aria-label="文档字号"
                    value={typographyFontSizeDraft}
                    onChange={(event) => setTypographyFontSizeDraft(event.target.value)}
                  >
                    <option value="">继承全局（{globalTypography.defaultFontSize}px）</option>
                    {supportedDefaultFontSizes.map((size) => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </label>
                <p className="document-typography-menu__hint">
                  当前显示：{effectiveTypography.defaultFontSize}px
                </p>
                {typographyError ? <p className="document-typography-menu__error">{typographyError}</p> : null}
                <div className="document-typography-menu__actions">
                  <button type="button" className="secondary-button" onClick={() => setTypographyMenuOpen(false)}>
                    取消
                  </button>
                  <button type="submit" className="primary-button" aria-label="保存文档字体">
                    保存
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
        <IconButton label="保存" onClick={onManualSave} disabled={!document || lakeReadMode}>
          <Save size={18} />
        </IconButton>
        {document?.kind === "spreadsheet" ? (
          <div className="export-menu">
            <button
              type="button"
              className="icon-button export-menu__trigger"
              aria-label="Excel 导入导出"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title={spreadsheetExcelBusy ? "正在处理 Excel" : "Excel 导入导出"}
              disabled={!document || spreadsheetExcelBusy}
              onClick={() => setExportMenuOpen((open) => !open)}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                  setExportMenuOpen(false);
                }
              }}
            >
              {spreadsheetExcelBusy ? <Loader2 size={18} className="spin-icon" /> : <Download size={18} />}
              <ChevronDown size={12} />
            </button>
            {exportMenuOpen ? (
              <div className="export-menu__content" role="menu">
                <button type="button" role="menuitem" onClick={() => {
                  setExportMenuOpen(false);
                  onImportSpreadsheetExcel?.();
                }}>
                  导入 Excel
                </button>
                <button type="button" role="menuitem" onClick={() => {
                  setExportMenuOpen(false);
                  onExportSpreadsheetExcel?.();
                }}>
                  导出 Excel
                </button>
              </div>
            ) : null}
          </div>
        ) : document?.kind === "multidimensional-table" ? null : (
          <div className="export-menu">
            <button
              type="button"
              className="icon-button export-menu__trigger"
              aria-label="导出文档"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title={exportBusy ? "正在导出" : "导出文档"}
              disabled={!document || exportBusy}
              onClick={() => setExportMenuOpen((open) => !open)}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                  setExportMenuOpen(false);
                }
              }}
            >
              {exportBusy ? <Loader2 size={18} className="spin-icon" /> : <Download size={18} />}
              <ChevronDown size={12} />
            </button>
            {exportMenuOpen ? (
              <div className="export-menu__content" role="menu">
                <div className="export-menu__section" role="presentation">
                  <label>
                    <input
                      type="radio"
                      name="export-resource-strategy"
                      checked={resourceStrategy === "bundle"}
                      onChange={() => setResourceStrategy("bundle")}
                    />
                    本地资源包
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="export-resource-strategy"
                      checked={resourceStrategy === "signed-url"}
                      onChange={() => setResourceStrategy("signed-url")}
                      disabled={!signedUrlExportEnabled}
                    />
                    短时签名链接
                  </label>
                  {resourceStrategy === "signed-url" ? (
                    <>
                      <select
                        aria-label="签名链接有效期"
                        value={ttlSeconds}
                        onChange={(event) => setTtlSeconds(Number(event.target.value))}
                      >
                        {ttlOptions.map((seconds) => (
                          <option key={seconds} value={seconds}>{formatTtlLabel(seconds)}</option>
                        ))}
                      </select>
                      <p className="export-menu__hint">
                        加密资源会上传临时明文副本后再生成限时链接。
                      </p>
                    </>
                  ) : null}
                </div>
                <button type="button" role="menuitem" onClick={() => exportDocument("markdown")}>
                  Markdown
                </button>
                <button type="button" role="menuitem" onClick={() => exportDocument("html")}>
                  HTML
                </button>
                <button type="button" role="menuitem" onClick={() => exportDocument("pdf")}>
                  PDF
                </button>
              </div>
            ) : null}
          </div>
        )}
        <IconButton label="分享" disabled>
          <Share2 size={18} />
        </IconButton>
      </div>
    </header>
  );
}

function documentKindIcon(document: WorkspaceDocument) {
  if (document.kind === "spreadsheet") {
    return <FileSpreadsheet size={18} className="document-tab__icon" aria-hidden="true" />;
  }
  if (document.kind === "multidimensional-table") {
    return <Grid2X2 size={18} className="document-tab__icon" aria-hidden="true" />;
  }
  return <FileText size={18} className="document-tab__icon" aria-hidden="true" />;
}

type TabDropPlacement = "before" | "after";

function SortableDocumentTab({
  tab,
  selected,
  activeTabRef,
  editingTitle,
  draftTitle,
  dragging,
  dropPlacement,
  onActivateTab,
  onCloseTab,
  onSetDraftTitle,
  onSubmitTitle,
  onCancelTitleEdit,
  onStartTitleEdit,
  onOpenContextMenu,
}: {
  tab: OpenDocumentTabView;
  selected: boolean;
  activeTabRef: MutableRefObject<HTMLDivElement | null>;
  editingTitle: boolean;
  draftTitle: string;
  dragging: boolean;
  dropPlacement: TabDropPlacement | null;
  onActivateTab?: (tabId: string) => void | Promise<void>;
  onCloseTab?: (tabId: string) => void | Promise<void>;
  onSetDraftTitle: (title: string) => void;
  onSubmitTitle: () => void;
  onCancelTitleEdit: () => void;
  onStartTitleEdit: () => void;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });
  const tabTitle = documentTitleFromPath(tab.document.path);
  const dropBefore = dropPlacement === "before";
  const dropAfter = dropPlacement === "after";
  const className = `document-tab${selected ? " is-active" : ""}${tab.locked ? " is-locked" : ""}${dragging || isDragging ? " is-dragging" : ""}${dropBefore ? " is-drop-before" : ""}${dropAfter ? " is-drop-after" : ""}`;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } satisfies CSSProperties;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (selected) {
          activeTabRef.current = node;
        }
      }}
      {...attributes}
      {...listeners}
      className={className}
      style={style}
      role="tab"
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${tabTitle}${tab.locked ? "，已锁定" : ""}`}
      data-document-tab-id={tab.id}
      onClick={() => {
        if (!selected) {
          void onActivateTab?.(tab.id);
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !selected) {
          event.preventDefault();
          void onActivateTab?.(tab.id);
        }
      }}
      onContextMenu={onOpenContextMenu}
    >
      {documentKindIcon(tab.document)}
      {selected && editingTitle ? (
        <input
          className="title-edit-input title-edit-input--tab"
          aria-label="文档名称"
          value={draftTitle}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onChange={(event) => onSetDraftTitle(event.target.value)}
          onBlur={onSubmitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              onCancelTitleEdit();
            }
          }}
        />
      ) : selected ? (
        <h1
          className="document-tab__title"
          title="双击重命名文档"
          onDoubleClick={(event) => {
            event.stopPropagation();
            onStartTitleEdit();
          }}
        >
          {tabTitle}
        </h1>
      ) : (
        <span className="document-tab__title" title={tabTitle}>
          {tabTitle}
        </span>
      )}
      {tab.locked ? (
        <Pin size={17} className="document-tab__pin" aria-label="已锁定" />
      ) : selected ? (
        <button
          type="button"
          className="document-tab__close"
          aria-label={`关闭 ${tabTitle}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void onCloseTab?.(tab.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              void onCloseTab?.(tab.id);
            }
          }}
        >
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function reorderTabIds(tabIds: string[], sourceTabId: string, targetTabId: string, placement: TabDropPlacement): string[] {
  if (sourceTabId === targetTabId) {
    return tabIds;
  }
  const sourceIndex = tabIds.indexOf(sourceTabId);
  const targetIndex = tabIds.indexOf(targetTabId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return tabIds;
  }

  const nextTabIds = tabIds.filter((tabId) => tabId !== sourceTabId);
  const targetIndexWithoutSource = nextTabIds.indexOf(targetTabId);
  const insertIndex = placement === "after" ? targetIndexWithoutSource + 1 : targetIndexWithoutSource;
  return [
    ...nextTabIds.slice(0, insertIndex),
    sourceTabId,
    ...nextTabIds.slice(insertIndex),
  ];
}

function resolveTabDropPlacement(targetTabId: string, clientX: number | null): TabDropPlacement | null {
  if (!targetTabId) {
    return null;
  }

  const targetElement = document.querySelector<HTMLElement>(`[data-document-tab-id="${escapeAttributeValue(targetTabId)}"]`);
  const rect = targetElement?.getBoundingClientRect();
  if (!rect || clientX === null) {
    return "before";
  }

  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  return ratio > 0.5 ? "after" : "before";
}

function pointerX(event: DragMoveEvent | DragOverEvent | DragEndEvent): number | null {
  const activator = event.activatorEvent;
  if (activator && "clientX" in activator && typeof activator.clientX === "number") {
    return activator.clientX + event.delta.x;
  }
  return null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function formatTtlLabel(seconds: number): string {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  if (seconds < 24 * 3600) {
    return `${Math.round(seconds / 3600)} 小时`;
  }
  return `${Math.round(seconds / (24 * 3600))} 天`;
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status.state) {
    case "dirty":
      return "有未保存修改";
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return status.message ?? "保存失败";
    case "clean":
    default:
      return "已加载";
  }
}
