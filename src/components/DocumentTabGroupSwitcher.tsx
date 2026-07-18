import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, FolderOpen, Layers2, Trash2 } from "lucide-react";

import type { DocumentTabGroup } from "../app/appState";
import { IconButton } from "./IconButton";

interface DocumentTabGroupSwitcherProps {
  groups: DocumentTabGroup[];
  lockedTabCount: number;
  onSaveCurrentGroup: (name: string) => void;
  onOpenGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

export function DocumentTabGroupSwitcher({
  groups,
  lockedTabCount,
  onSaveCurrentGroup,
  onOpenGroup,
  onDeleteGroup,
}: DocumentTabGroupSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const saveGroup = () => {
    const name = draftName.trim();
    if (!name || lockedTabCount === 0) {
      return;
    }
    onSaveCurrentGroup(name);
    setDraftName("");
    setOpen(false);
  };

  return (
    <div className="tab-group-switcher" ref={panelRef}>
      <IconButton
        label="标签组"
        active={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Layers2 size={20} />
      </IconButton>

      {open ? (
        <div className="tab-group-switcher__panel" role="menu" aria-label="标签组">
          <div className="tab-group-switcher__header">
            <span>标签组</span>
            <small>{groups.length} 组</small>
          </div>
          <div className="tab-group-switcher__create">
            <input
              value={draftName}
              aria-label="标签组名称"
              placeholder={lockedTabCount > 0 ? "保存当前锁定标签" : "先锁定要保存的标签"}
              disabled={lockedTabCount === 0}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  saveGroup();
                }
              }}
            />
            <button type="button" role="menuitem" disabled={!draftName.trim() || lockedTabCount === 0} onClick={saveGroup}>
              <BookmarkPlus size={15} />
              保存
            </button>
          </div>
          <div className="tab-group-switcher__list">
            {groups.length > 0 ? groups.map((group) => (
              <div className="tab-group-switcher__item" key={group.id}>
                <button
                  type="button"
                  className="tab-group-switcher__open"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onOpenGroup(group.id);
                  }}
                >
                  <FolderOpen size={16} />
                  <span>
                    <b>{group.name}</b>
                    <small>{group.items.length} 个文档</small>
                  </span>
                </button>
                <button type="button" aria-label={`删除标签组 ${group.name}`} onClick={() => onDeleteGroup(group.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            )) : (
              <p className="tab-group-switcher__empty">还没有标签组</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
