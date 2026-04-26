import { useEffect, useState } from "react";
import { Cloud, Save, Share2 } from "lucide-react";

import type { SaveStatus } from "../app/appState";
import type { WorkspaceDocument } from "../features/workspace/workspaceStore";
import { documentTitleFromPath } from "../features/workspace/workspaceStore";
import { IconButton } from "./IconButton";

interface TopBarProps {
  document: WorkspaceDocument | null;
  saveStatus: SaveStatus;
  onManualSave: () => void;
  onRenameDocument?: (title: string) => void | Promise<void>;
}

export function TopBar({ document, saveStatus, onManualSave, onRenameDocument }: TopBarProps) {
  const title = document ? documentTitleFromPath(document.path) : "Lake 本地笔记";
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  useEffect(() => {
    if (!editingTitle) {
      setDraftTitle(title);
    }
  }, [editingTitle, title]);

  const submitTitle = () => {
    const nextTitle = draftTitle.trim();
    setEditingTitle(false);
    if (document && nextTitle && nextTitle !== title) {
      void onRenameDocument?.(nextTitle);
    }
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
        <IconButton label="分享" disabled>
          <Share2 size={18} />
        </IconButton>
      </div>
    </header>
  );
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
