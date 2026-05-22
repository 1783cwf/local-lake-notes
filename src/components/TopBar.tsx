import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Cloud, Download, FileSpreadsheet, FileText, Grid2X2, Loader2, Pin, Save, Share2, X } from "lucide-react";

import type { OpenDocumentTab, SaveStatus } from "../app/appState";
import type { DocumentExportFormat, ExportResourceStrategy } from "../features/lake-editor/lakeExport";
import type { WorkspaceDocument } from "../features/workspace/workspaceStore";
import { documentTitleFromPath } from "../features/workspace/workspaceStore";
import { IconButton } from "./IconButton";

export interface OpenDocumentTabView extends OpenDocumentTab {
  document: WorkspaceDocument;
}

interface TopBarProps {
  document: WorkspaceDocument | null;
  openTabs?: OpenDocumentTabView[];
  activeTabId?: string | null;
  saveStatus: SaveStatus;
  onManualSave: () => void;
  onOpenAiAssistant?: () => void;
  onActivateTab?: (tabId: string) => void | Promise<void>;
  onToggleTabLocked?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void | Promise<void>;
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
  saveStatus,
  onManualSave,
  onOpenAiAssistant,
  onActivateTab,
  onToggleTabLocked,
  onCloseTab,
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
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [resourceStrategy, setResourceStrategy] = useState<ExportResourceStrategy>(defaultExportResourceStrategy);
  const [ttlSeconds, setTtlSeconds] = useState(defaultSignedUrlTtlSeconds);
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const ttlOptions = Array.from(new Set([ttlSeconds, 3600, 24 * 3600, 7 * 24 * 3600])).sort((left, right) => left - right);
  const menuTab = tabMenu ? openTabs.find((tab) => tab.id === tabMenu.tabId) : null;

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

  return (
    <header className="top-bar">
      <div className="top-bar__title">
        {openTabs.length > 0 ? (
          <div className="document-tabs" role="tablist" aria-label="打开的文档">
            {openTabs.map((tab) => {
              const selected = tab.id === activeTabId;
              const tabTitle = documentTitleFromPath(tab.document.path);

              return (
                <div
                  key={tab.id}
                  ref={selected ? activeTabRef : null}
                  className={`document-tab${selected ? " is-active" : ""}${tab.locked ? " is-locked" : ""}`}
                  role="tab"
                  tabIndex={0}
                  aria-selected={selected}
                  aria-label={`${tabTitle}${tab.locked ? "，已锁定" : ""}`}
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
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setTabMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                  }}
                >
                  {documentKindIcon(tab.document)}
                  {selected && editingTitle ? (
                    <input
                      className="title-edit-input title-edit-input--tab"
                      aria-label="文档名称"
                      value={draftTitle}
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      onClick={(event) => event.stopPropagation()}
                      onDoubleClick={(event) => event.stopPropagation()}
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
                  ) : selected ? (
                    <h1
                      className="document-tab__title"
                      title="双击重命名文档"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingTitle(true);
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
            })}
          </div>
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
                关闭标签
              </button>
            ) : null}
          </div>
        ) : null}
        <span className={`save-status save-status--${saveStatus.state}`}>
          <Cloud size={14} />
          {saveStatusLabel(saveStatus)}
        </span>
      </div>
      <div className="top-bar__actions">
        {document?.kind === "lake" || document?.kind === "multidimensional-table" || document?.kind === "spreadsheet" ? (
          <IconButton
            label={document.kind === "multidimensional-table" ? "AI 多维表格助手" : document.kind === "spreadsheet" ? "AI 表格助手" : "AI 文档助手"}
            onClick={() => onOpenAiAssistant?.()}
            disabled={!document}
          >
            <Bot size={18} />
          </IconButton>
        ) : null}
        <IconButton label="保存" onClick={onManualSave} disabled={!document}>
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
