import { useEffect, useState } from "react";
import { ChevronDown, Cloud, Download, Loader2, Save, Share2 } from "lucide-react";

import type { SaveStatus } from "../app/appState";
import type { DocumentExportFormat, ExportResourceStrategy } from "../features/lake-editor/lakeExport";
import type { WorkspaceDocument } from "../features/workspace/workspaceStore";
import { documentTitleFromPath } from "../features/workspace/workspaceStore";
import { IconButton } from "./IconButton";

interface TopBarProps {
  document: WorkspaceDocument | null;
  saveStatus: SaveStatus;
  onManualSave: () => void;
  onRenameDocument?: (title: string) => void | Promise<void>;
  onExportDocument?: (format: DocumentExportFormat, resourceStrategy: ExportResourceStrategy, signedUrlTtlSeconds: number) => void;
  onImportSpreadsheetExcel?: () => void;
  onExportSpreadsheetExcel?: () => void;
  defaultExportResourceStrategy?: ExportResourceStrategy;
  defaultSignedUrlTtlSeconds?: number;
  exportBusy?: boolean;
  spreadsheetExcelBusy?: boolean;
}

export function TopBar({
  document,
  saveStatus,
  onManualSave,
  onRenameDocument,
  onExportDocument,
  onImportSpreadsheetExcel,
  onExportSpreadsheetExcel,
  defaultExportResourceStrategy = "bundle",
  defaultSignedUrlTtlSeconds = 24 * 60 * 60,
  exportBusy = false,
  spreadsheetExcelBusy = false,
}: TopBarProps) {
  const title = document ? documentTitleFromPath(document.path) : "Lake 本地笔记";
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [resourceStrategy, setResourceStrategy] = useState<ExportResourceStrategy>(defaultExportResourceStrategy);
  const [ttlSeconds, setTtlSeconds] = useState(defaultSignedUrlTtlSeconds);
  const ttlOptions = Array.from(new Set([ttlSeconds, 3600, 24 * 3600, 7 * 24 * 3600])).sort((left, right) => left - right);

  useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(title);
    }
  }, [editingTitle, title]);
  useEffect(() => {
    setResourceStrategy(defaultExportResourceStrategy);
  }, [defaultExportResourceStrategy]);
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
        {document && editingTitle ? (
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
        <span className={`save-status save-status--${saveStatus.state}`}>
          <Cloud size={14} />
          {saveStatusLabel(saveStatus)}
        </span>
      </div>
      <div className="top-bar__actions">
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
        ) : (
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
