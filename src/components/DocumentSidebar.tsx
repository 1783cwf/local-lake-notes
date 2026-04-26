import { ChevronDown, ChevronRight, FileText, Folder, Plus } from "lucide-react";

import type { DocumentTreeNode, WorkspaceDocument } from "../features/workspace/workspaceStore";
import { buildDocumentTree } from "../features/workspace/workspaceStore";

interface DocumentSidebarProps {
  workspaceRoot: string | null;
  documents: WorkspaceDocument[];
  currentPath: string | null;
  onOpenDocument: (document: WorkspaceDocument) => void;
  onCreateDocument: () => void;
}

export function DocumentSidebar({
  workspaceRoot,
  documents,
  currentPath,
  onOpenDocument,
  onCreateDocument,
}: DocumentSidebarProps) {
  const tree = buildDocumentTree(documents);

  return (
    <aside className="document-sidebar">
      <div className="document-sidebar__header">
        <div>
          <p className="eyebrow">知识库</p>
          <h2>{workspaceRoot ? basename(workspaceRoot) : "未选择目录"}</h2>
        </div>
        <button type="button" className="new-document-button" onClick={onCreateDocument} aria-label="新建文档">
          <Plus size={18} />
        </button>
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
}: {
  node: DocumentTreeNode;
  currentPath: string | null;
  onOpenDocument: (document: WorkspaceDocument) => void;
}) {
  if (node.type === "folder") {
    return (
      <div className="tree-folder" role="group">
        <div className="tree-row tree-row--folder">
          {node.children.length > 0 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={15} />
          <span>{node.name}</span>
        </div>
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} currentPath={currentPath} onOpenDocument={onOpenDocument} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`tree-row tree-row--document ${currentPath === node.path ? "is-current" : ""}`}
      onClick={() => node.document && onOpenDocument(node.document)}
      role="treeitem"
    >
      <FileText size={15} />
      <span>{node.name}</span>
    </button>
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
