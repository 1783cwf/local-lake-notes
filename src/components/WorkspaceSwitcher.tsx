import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, FolderOpen, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import type { KnownWorkspace } from "../features/workspace/workspaceStore";
import { IconButton } from "./IconButton";

interface WorkspaceSwitcherProps {
  activeWorkspaceRoot: string | null;
  knownWorkspaces: KnownWorkspace[];
  onChooseWorkspace: () => void;
  onCreateWorkspace: () => void;
  onSwitchWorkspace: (root: string) => void;
  onForgetWorkspace: (root: string) => void;
}

export function WorkspaceSwitcher({
  activeWorkspaceRoot,
  knownWorkspaces,
  onChooseWorkspace,
  onCreateWorkspace,
  onSwitchWorkspace,
  onForgetWorkspace,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
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

  const chooseWorkspace = () => {
    setOpen(false);
    onChooseWorkspace();
  };

  const createWorkspace = () => {
    setOpen(false);
    onCreateWorkspace();
  };

  const switchWorkspace = (root: string) => {
    setOpen(false);
    onSwitchWorkspace(root);
  };

  return (
    <div className="workspace-switcher" ref={panelRef}>
      <IconButton
        label="知识库"
        active={open || Boolean(activeWorkspaceRoot)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BookOpen size={20} />
      </IconButton>

      {open ? (
        <div className="workspace-switcher__panel" role="menu" aria-label="知识库">
          <div className="workspace-switcher__header">
            <span>知识库</span>
            <MoreHorizontal size={18} aria-hidden="true" />
          </div>

          <div className="workspace-switcher__list">
            {knownWorkspaces.length > 0 ? (
              knownWorkspaces.map((workspace) => {
                const active = workspace.root === activeWorkspaceRoot;
                return (
                  <div className={`workspace-switcher__item${active ? " is-active" : ""}`} key={workspace.root}>
                    <button
                      type="button"
                      className="workspace-switcher__select"
                      role="menuitem"
                      onClick={() => switchWorkspace(workspace.root)}
                      disabled={active}
                    >
                      <span className="workspace-switcher__icon" aria-hidden="true">
                        <BookOpen size={18} />
                      </span>
                      <span className="workspace-switcher__text">
                        <span className="workspace-switcher__name">{workspace.name}</span>
                        <span className="workspace-switcher__path">{workspace.root}</span>
                      </span>
                      {active ? <Check size={16} className="workspace-switcher__check" aria-hidden="true" /> : null}
                    </button>
                    <button
                      type="button"
                      className="workspace-switcher__forget"
                      aria-label={`从列表移除 ${workspace.name}`}
                      onClick={() => onForgetWorkspace(workspace.root)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="workspace-switcher__empty">还没有知识库</p>
            )}
          </div>

          <div className="workspace-switcher__actions">
            <button type="button" role="menuitem" onClick={chooseWorkspace}>
              <FolderOpen size={17} />
              <span>添加已有知识库</span>
            </button>
            <button type="button" role="menuitem" onClick={createWorkspace}>
              <Plus size={17} />
              <span>新建知识库</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
