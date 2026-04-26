import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import type { DragEvent, ReactNode } from "react";

import type {
  DocumentTreeNode,
  WorkspaceDirectory,
  WorkspaceDocument,
} from "../features/workspace/workspaceStore";
import { buildDocumentTree } from "../features/workspace/workspaceStore";

interface DocumentSidebarProps {
  workspaceRoot: string | null;
  directories: WorkspaceDirectory[];
  documents: WorkspaceDocument[];
  order: string[];
  currentPath: string | null;
  onOpenDocument: (document: WorkspaceDocument) => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRenameWorkspace: () => void;
  onRenameDocument: (document: WorkspaceDocument) => void;
  onDeleteDocument: (document: WorkspaceDocument) => void;
  onRenameDirectory: (directory: WorkspaceDirectory) => void;
  onDeleteDirectory: (directory: WorkspaceDirectory) => void;
  onMoveNode: (sourceId: string, targetId: string, parentPath: string) => void;
}

export function DocumentSidebar({
  workspaceRoot,
  directories,
  documents,
  order,
  currentPath,
  onOpenDocument,
  onCreateDocument,
  onCreateDirectory,
  onRenameWorkspace,
  onRenameDocument,
  onDeleteDocument,
  onRenameDirectory,
  onDeleteDirectory,
  onMoveNode,
}: DocumentSidebarProps) {
  const tree = buildDocumentTree(documents, directories, order);

  return (
    <aside className="document-sidebar">
      <div className="document-sidebar__header">
        <div>
          <p className="eyebrow">知识库</p>
          <h2>{workspaceRoot ? basename(workspaceRoot) : "未选择目录"}</h2>
        </div>
        <div className="sidebar-actions">
          <button type="button" className="tiny-icon-button" onClick={onRenameWorkspace} aria-label="重命名知识库" disabled={!workspaceRoot}>
            <Pencil size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateDirectory("")} aria-label="新建目录" disabled={!workspaceRoot}>
            <FolderPlus size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateDocument("")} aria-label="新建文档" disabled={!workspaceRoot}>
            <FilePlus size={15} />
          </button>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section__title">目录</div>
        {tree.length > 0 ? (
          <div className="document-tree" role="tree">
            {tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                currentPath={currentPath}
                onOpenDocument={onOpenDocument}
                onCreateDocument={onCreateDocument}
                onCreateDirectory={onCreateDirectory}
                onRenameDocument={onRenameDocument}
                onDeleteDocument={onDeleteDocument}
                onRenameDirectory={onRenameDirectory}
                onDeleteDirectory={onDeleteDirectory}
                onMoveNode={onMoveNode}
              />
            ))}
          </div>
        ) : (
          <div className="empty-sidebar-state">
            <p>{workspaceRoot ? "还没有 Lake 文档" : "选择目录后显示文档"}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function TreeNode({
  node,
  currentPath,
  onOpenDocument,
  onCreateDocument,
  onCreateDirectory,
  onRenameDocument,
  onDeleteDocument,
  onRenameDirectory,
  onDeleteDirectory,
  onMoveNode,
}: {
  node: DocumentTreeNode;
  currentPath: string | null;
  onOpenDocument: (document: WorkspaceDocument) => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRenameDocument: (document: WorkspaceDocument) => void;
  onDeleteDocument: (document: WorkspaceDocument) => void;
  onRenameDirectory: (directory: WorkspaceDirectory) => void;
  onDeleteDirectory: (directory: WorkspaceDirectory) => void;
  onMoveNode: (sourceId: string, targetId: string, parentPath: string) => void;
}) {
  const onDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${node.itemId}\n${node.parentPath}`);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const [sourceId, sourceParentPath] = event.dataTransfer.getData("text/plain").split("\n");
    if (sourceId && sourceId !== node.itemId && sourceParentPath === node.parentPath) {
      onMoveNode(sourceId, node.itemId, node.parentPath);
    }
  };

  if (node.type === "folder") {
    return (
      <div className="tree-folder" role="group">
        <div className="tree-row tree-row--folder" draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}>
          <GripVertical size={13} className="drag-handle" />
          {node.children.length > 0 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={15} />
          <span>{node.name}</span>
          {node.directory ? (
            <RowActions>
              <RowButton label="新建子目录" onClick={() => onCreateDirectory(node.path)} icon={<FolderPlus size={14} />} />
              <RowButton label="新建文档" onClick={() => onCreateDocument(node.path)} icon={<FilePlus size={14} />} />
              <RowButton label="重命名目录" onClick={() => onRenameDirectory(node.directory!)} icon={<Pencil size={14} />} />
              <RowButton label="删除目录" onClick={() => onDeleteDirectory(node.directory!)} icon={<Trash2 size={14} />} />
            </RowActions>
          ) : null}
        </div>
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              currentPath={currentPath}
              onOpenDocument={onOpenDocument}
              onCreateDocument={onCreateDocument}
              onCreateDirectory={onCreateDirectory}
              onRenameDocument={onRenameDocument}
              onDeleteDocument={onDeleteDocument}
              onRenameDirectory={onRenameDirectory}
              onDeleteDirectory={onDeleteDirectory}
              onMoveNode={onMoveNode}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tree-row tree-row--document ${currentPath === node.path ? "is-current" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => node.document && onOpenDocument(node.document)}
      role="treeitem"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && node.document) {
          event.preventDefault();
          onOpenDocument(node.document);
        }
      }}
    >
      <GripVertical size={13} className="drag-handle" />
      <FileText size={15} />
      <span>{node.name}</span>
      {node.document ? (
        <RowActions>
          <RowButton label="重命名文档" onClick={() => onRenameDocument(node.document!)} icon={<Pencil size={14} />} />
          <RowButton label="删除文档" onClick={() => onDeleteDocument(node.document!)} icon={<Trash2 size={14} />} />
        </RowActions>
      ) : null}
    </div>
  );
}

function RowActions({ children }: { children: ReactNode }) {
  return <span className="tree-row__actions">{children}</span>;
}

function RowButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="tree-action-button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      }}
    >
      {icon}
    </span>
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
