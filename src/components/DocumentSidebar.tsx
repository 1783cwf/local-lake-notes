import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDroppable,
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
  type SortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  forwardRef,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type {
  DocumentTreeNode,
  FlatDocumentTreeNode,
  WorkspaceDirectory,
  WorkspaceDocument,
  WorkspaceDropIntent,
  WorkspaceMoveResolution,
} from "../features/workspace/workspaceStore";
import {
  buildDocumentTree,
  flattenDocumentTree,
  resolveWorkspaceMove,
} from "../features/workspace/workspaceStore";

interface DocumentSidebarProps {
  workspaceRoot: string | null;
  directories: WorkspaceDirectory[];
  documents: WorkspaceDocument[];
  order: string[];
  currentPath: string | null;
  onOpenDocument: (document: WorkspaceDocument) => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateSpreadsheet: (parentPath: string) => void;
  onCreateMultidimensionalTable: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRenameWorkspace: () => void;
  onExportWorkspaceMarkdown: () => void;
  onRenameDocument: (document: WorkspaceDocument) => void;
  onDeleteDocument: (document: WorkspaceDocument) => void;
  onRenameDirectory: (directory: WorkspaceDirectory) => void;
  onDeleteDirectory: (directory: WorkspaceDirectory) => void;
  onMoveNode: (sourceId: string, intent: WorkspaceDropIntent) => void;
  collapsed?: boolean;
}

const rootDropId = "__workspace-root-end__";

const pointerFirstCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};
export const staticTreeSortingStrategy: SortingStrategy = () => null;

type SidebarContextMenu =
  | { kind: "root"; x: number; y: number; parentPath: string }
  | { kind: "folder"; x: number; y: number; node: FlatDocumentTreeNode & { directory: WorkspaceDirectory } }
  | { kind: "document"; x: number; y: number; node: FlatDocumentTreeNode & { document: WorkspaceDocument } };

export function DocumentSidebar({
  workspaceRoot,
  directories,
  documents,
  order,
  currentPath,
  onOpenDocument,
  onCreateDocument,
  onCreateSpreadsheet,
  onCreateMultidimensionalTable,
  onCreateDirectory,
  onRenameWorkspace,
  onExportWorkspaceMarkdown,
  onRenameDocument,
  onDeleteDocument,
  onRenameDirectory,
  onDeleteDirectory,
  onMoveNode,
  collapsed = false,
}: DocumentSidebarProps) {
  const tree = useMemo(() => buildDocumentTree(documents, directories, order), [directories, documents, order]);
  const flatNodes = useMemo(() => flattenDocumentTree(tree), [tree]);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = useMemo(() => normalizeSearchQuery(searchQuery), [searchQuery]);
  const searchTree = useMemo(
    () => (normalizedSearchQuery ? filterDocumentTreeByName(tree, normalizedSearchQuery) : tree),
    [normalizedSearchQuery, tree],
  );
  const visibleNodes = useMemo(
    () => (normalizedSearchQuery ? flattenDocumentTree(searchTree) : flattenVisibleDocumentTree(tree, collapsedFolderIds)),
    [collapsedFolderIds, normalizedSearchQuery, searchTree, tree],
  );
  const itemIds = useMemo(() => visibleNodes.map((node) => node.itemId), [visibleNodes]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropState, setDropState] = useState<{
    intent: WorkspaceDropIntent;
    resolution: WorkspaceMoveResolution;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<SidebarContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const activeNode = activeId ? flatNodes.find((node) => node.itemId === activeId) ?? null : null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const updateDropIntent = (event: DragMoveEvent | DragOverEvent) => {
    const sourceId = String(event.active.id);
    const intent = resolvePointerIntent(flatNodes, String(event.over?.id ?? ""), pointerY(event));
    const resolution = intent ? resolveWorkspaceMove(tree, sourceId, intent) : null;
    setDropState(intent && resolution ? { intent, resolution } : null);
  };
  const toggleFolder = (itemId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };
  const expandFolder = (itemId: string) => {
    setCollapsedFolderIds((current) => {
      if (!current.has(itemId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };
  const onDragMove = (event: DragMoveEvent) => updateDropIntent(event);
  const onDragOver = (event: DragOverEvent) => updateDropIntent(event);
  const onDragEnd = (event: DragEndEvent) => {
    const sourceId = String(event.active.id);
    const intent = dropState?.intent ?? resolvePointerIntent(flatNodes, String(event.over?.id ?? ""), pointerY(event));
    const resolution = intent ? resolveWorkspaceMove(tree, sourceId, intent) : null;

    setActiveId(null);
    setDropState(null);

    if (intent && resolution?.ok && !resolution.noop) {
      if (intent.placement === "inside" && intent.targetId) {
        expandFolder(intent.targetId);
      }
      onMoveNode(sourceId, intent);
    }
  };
  const onDragCancel = () => {
    setActiveId(null);
    setDropState(null);
  };
  const openRootContextMenu = (event: ReactMouseEvent) => {
    if (!workspaceRoot || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    setContextMenu({ kind: "root", parentPath: "", ...contextMenuPosition(event) });
  };
  const openNodeContextMenu = (event: ReactMouseEvent, node: FlatDocumentTreeNode) => {
    if (!workspaceRoot) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (node.type === "folder" && node.directory) {
      setContextMenu({ kind: "folder", node: node as FlatDocumentTreeNode & { directory: WorkspaceDirectory }, ...contextMenuPosition(event) });
      return;
    }
    if (node.type === "document" && node.document) {
      setContextMenu({ kind: "document", node: node as FlatDocumentTreeNode & { document: WorkspaceDocument }, ...contextMenuPosition(event) });
    }
  };

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    };
    const closeContextMenuByEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.document.addEventListener("pointerdown", closeContextMenu);
    window.document.addEventListener("keydown", closeContextMenuByEscape);
    return () => {
      window.document.removeEventListener("pointerdown", closeContextMenu);
      window.document.removeEventListener("keydown", closeContextMenuByEscape);
    };
  }, [contextMenu]);

  return (
    <aside className={`document-sidebar${collapsed ? " is-collapsed" : ""}`} aria-hidden={collapsed || undefined}>
      <div className="document-sidebar__header">
        <div>
          <p className="eyebrow">知识库</p>
          <h2>{workspaceRoot ? basename(workspaceRoot) : "未选择目录"}</h2>
        </div>
        <div className="sidebar-actions">
          <button type="button" className="tiny-icon-button" onClick={onRenameWorkspace} aria-label="重命名知识库" disabled={!workspaceRoot}>
            <Pencil size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={onExportWorkspaceMarkdown} aria-label="导出知识库 ZIP" disabled={!workspaceRoot}>
            <Download size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateDirectory("")} aria-label="新建目录" disabled={!workspaceRoot}>
            <FolderPlus size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateDocument("")} aria-label="新建文档" disabled={!workspaceRoot}>
            <FilePlus size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateSpreadsheet("")} aria-label="新建表格" disabled={!workspaceRoot}>
            <FileSpreadsheet size={15} />
          </button>
          <button type="button" className="tiny-icon-button" onClick={() => onCreateMultidimensionalTable("")} aria-label="新建多维表格" disabled={!workspaceRoot}>
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      <div className="sidebar-section" onContextMenu={openRootContextMenu}>
        <div className="sidebar-section__title">目录</div>
        <label className={`sidebar-search${!workspaceRoot || documents.length === 0 ? " is-disabled" : ""}`}>
          <Search size={14} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索文档"
            aria-label="搜索文档"
            disabled={!workspaceRoot || documents.length === 0}
          />
          {searchQuery ? (
            <button type="button" aria-label="清空搜索" onClick={() => setSearchQuery("")}>
              <X size={14} />
            </button>
          ) : null}
        </label>
        {visibleNodes.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerFirstCollisionDetection}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <SortableContext items={itemIds} strategy={staticTreeSortingStrategy}>
              <div className="document-tree" role="tree">
                {visibleNodes.map((node) => (
                  <SortableTreeRow
                    key={node.itemId}
                    node={node}
                    expanded={Boolean(normalizedSearchQuery) || !collapsedFolderIds.has(node.itemId)}
                    activeId={activeId}
                    currentPath={currentPath}
                    dropState={dropState}
                    onToggleFolder={toggleFolder}
                    onOpenDocument={onOpenDocument}
                    onCreateDocument={onCreateDocument}
                    onCreateSpreadsheet={onCreateSpreadsheet}
                    onCreateMultidimensionalTable={onCreateMultidimensionalTable}
                    onCreateDirectory={onCreateDirectory}
                    onRenameDocument={onRenameDocument}
                    onDeleteDocument={onDeleteDocument}
                    onRenameDirectory={onRenameDirectory}
                    onDeleteDirectory={onDeleteDirectory}
                    onOpenContextMenu={openNodeContextMenu}
                  />
                ))}
                <RootDropZone active={Boolean(activeId)} dropState={dropState} />
              </div>
            </SortableContext>
            <DragOverlay>
              {activeNode ? <TreeRowOverlay node={activeNode} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="empty-sidebar-state">
            <p>{normalizedSearchQuery ? "没有匹配的文档" : workspaceRoot ? "还没有 Lake 文档" : "选择目录后显示文档"}</p>
          </div>
        )}
        {contextMenu ? (
          <SidebarContextMenuPanel
            ref={contextMenuRef}
            menu={contextMenu}
            onClose={() => setContextMenu(null)}
            onCreateDocument={onCreateDocument}
            onCreateSpreadsheet={onCreateSpreadsheet}
            onCreateMultidimensionalTable={onCreateMultidimensionalTable}
            onCreateDirectory={onCreateDirectory}
            onRenameDocument={onRenameDocument}
            onDeleteDocument={onDeleteDocument}
            onRenameDirectory={onRenameDirectory}
            onDeleteDirectory={onDeleteDirectory}
          />
        ) : null}
      </div>
    </aside>
  );
}

function SortableTreeRow({
  node,
  expanded,
  activeId,
  currentPath,
  dropState,
  onToggleFolder,
  onOpenDocument,
  onCreateDocument,
  onCreateSpreadsheet,
  onCreateMultidimensionalTable,
  onCreateDirectory,
  onRenameDocument,
  onDeleteDocument,
  onRenameDirectory,
  onDeleteDirectory,
  onOpenContextMenu,
}: {
  node: FlatDocumentTreeNode;
  expanded: boolean;
  activeId: string | null;
  currentPath: string | null;
  dropState: { intent: WorkspaceDropIntent; resolution: WorkspaceMoveResolution } | null;
  onToggleFolder: (itemId: string) => void;
  onOpenDocument: (document: WorkspaceDocument) => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateSpreadsheet: (parentPath: string) => void;
  onCreateMultidimensionalTable: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRenameDocument: (document: WorkspaceDocument) => void;
  onDeleteDocument: (document: WorkspaceDocument) => void;
  onRenameDirectory: (directory: WorkspaceDirectory) => void;
  onDeleteDirectory: (directory: WorkspaceDirectory) => void;
  onOpenContextMenu: (event: ReactMouseEvent, node: FlatDocumentTreeNode) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.itemId });
  const isDocument = node.type === "document";
  const isCurrent = isDocument && currentPath === node.path;
  const dropPlacement = dropState?.intent.targetId === node.itemId ? dropState.intent.placement : null;
  const illegalDrop = dropPlacement && !dropState?.resolution.ok;
  const className = [
    "tree-row",
    isDocument ? "tree-row--document" : "tree-row--folder",
    isCurrent ? "is-current" : "",
    isDragging ? "is-dragging" : "",
    activeId && activeId !== node.itemId ? "is-drag-active" : "",
    dropPlacement && dropState?.resolution.ok ? `is-drop-${dropPlacement}` : "",
    illegalDrop ? "is-drop-forbidden" : "",
  ].filter(Boolean).join(" ");
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${10 + node.depth * 18}px`,
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && node.document) {
      event.preventDefault();
      onOpenDocument(node.document);
    }
    if ((event.key === "Enter" || event.key === " ") && node.type === "folder" && node.hasChildren) {
      event.preventDefault();
      onToggleFolder(node.itemId);
    }
  };
  const onRowClick = () => {
    if (node.document) {
      onOpenDocument(node.document);
      return;
    }
    if (node.type === "folder" && node.hasChildren) {
      onToggleFolder(node.itemId);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      data-tree-item-id={node.itemId}
      data-testid={`tree-row-${node.itemId}`}
      onClick={onRowClick}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={node.hasChildren ? expanded : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => onOpenContextMenu(event, node)}
    >
      <button
        type="button"
        className="tree-drag-handle"
        aria-label={`拖拽${node.name}`}
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical size={13} />
      </button>
      {node.type === "folder" ? (
        <>
          <TreeToggleButton
            expanded={expanded}
            disabled={!node.hasChildren}
            label={node.hasChildren ? `${expanded ? "收起" : "展开"}目录 ${node.name}` : `空目录 ${node.name}`}
            onToggle={() => onToggleFolder(node.itemId)}
          />
          <Folder size={15} />
          <span>{node.name}</span>
          {node.directory ? (
            <RowActions>
              <RowButton label="新建子目录" onClick={() => onCreateDirectory(node.path)} icon={<FolderPlus size={14} />} />
              <RowButton label="新建文档" onClick={() => onCreateDocument(node.path)} icon={<FilePlus size={14} />} />
              <RowButton label="新建表格" onClick={() => onCreateSpreadsheet(node.path)} icon={<FileSpreadsheet size={14} />} />
              <RowButton label="新建多维表格" onClick={() => onCreateMultidimensionalTable(node.path)} icon={<LayoutGrid size={14} />} />
              <RowButton label="重命名目录" onClick={() => onRenameDirectory(node.directory!)} icon={<Pencil size={14} />} />
              <RowButton label="删除目录" onClick={() => onDeleteDirectory(node.directory!)} icon={<Trash2 size={14} />} />
            </RowActions>
          ) : null}
        </>
      ) : (
        <>
          {node.hasChildren ? (
            <TreeToggleButton
              expanded={expanded}
              label={`${expanded ? "收起" : "展开"}子文档 ${node.name}`}
              onToggle={() => onToggleFolder(node.itemId)}
            />
          ) : null}
          {documentIcon(node.document)}
          <span>{node.name}</span>
          {node.document ? (
            <RowActions>
              <RowButton label="重命名文档" onClick={() => onRenameDocument(node.document!)} icon={<Pencil size={14} />} />
              <RowButton label="删除文档" onClick={() => onDeleteDocument(node.document!)} icon={<Trash2 size={14} />} />
            </RowActions>
          ) : null}
        </>
      )}
    </div>
  );
}

function TreeToggleButton({
  expanded,
  disabled = false,
  label,
  onToggle,
}: {
  expanded: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tree-toggle-button"
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          onToggle();
        }
      }}
    >
      {!disabled && expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

function RootDropZone({
  active,
  dropState,
}: {
  active: boolean;
  dropState: { intent: WorkspaceDropIntent; resolution: WorkspaceMoveResolution } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: rootDropId });
  const className = [
    "tree-root-dropzone",
    active ? "is-active" : "",
    isOver && dropState?.intent.placement === "root-end" ? "is-over" : "",
  ].filter(Boolean).join(" ");

  return <div ref={setNodeRef} className={className} data-testid="tree-root-dropzone" />;
}

function TreeRowOverlay({ node }: { node: FlatDocumentTreeNode }) {
  return (
    <div className="tree-row tree-row--overlay">
      <GripVertical size={13} className="drag-handle" />
      {node.type === "folder" ? <Folder size={15} /> : documentIcon(node.document)}
      <span>{node.name}</span>
    </div>
  );
}

function documentIcon(document: WorkspaceDocument | undefined) {
  if (document?.kind === "spreadsheet") {
    return <FileSpreadsheet size={15} />;
  }
  if (document?.kind === "multidimensional-table") {
    return <LayoutGrid size={15} />;
  }
  return <FileText size={15} />;
}

function RowActions({ children }: { children: ReactNode }) {
  return <div className="tree-row__actions">{children}</div>;
}

const SidebarContextMenuPanel = forwardRef<HTMLDivElement, {
  menu: SidebarContextMenu;
  onClose: () => void;
  onCreateDocument: (parentPath: string) => void;
  onCreateSpreadsheet: (parentPath: string) => void;
  onCreateMultidimensionalTable: (parentPath: string) => void;
  onCreateDirectory: (parentPath: string) => void;
  onRenameDocument: (document: WorkspaceDocument) => void;
  onDeleteDocument: (document: WorkspaceDocument) => void;
  onRenameDirectory: (directory: WorkspaceDirectory) => void;
  onDeleteDirectory: (directory: WorkspaceDirectory) => void;
}>(({
  menu,
  onClose,
  onCreateDocument,
  onCreateSpreadsheet,
  onCreateMultidimensionalTable,
  onCreateDirectory,
  onRenameDocument,
  onDeleteDocument,
  onRenameDirectory,
  onDeleteDirectory,
}, ref) => {
  const parentPath = menu.kind === "root" ? menu.parentPath : menu.node.path;
  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="sidebar-context-menu"
      role="menu"
      aria-label="目录右键菜单"
      style={{ "--context-menu-x": `${menu.x}px`, "--context-menu-y": `${menu.y}px` } as CSSProperties}
      onContextMenu={(event) => event.preventDefault()}
    >
      {(menu.kind === "root" || menu.kind === "folder") ? (
        <>
          <ContextMenuButton label="新建目录" icon={<FolderPlus size={15} />} onClick={() => runAction(() => onCreateDirectory(parentPath))} />
          <ContextMenuButton label="新建文档" icon={<FilePlus size={15} />} onClick={() => runAction(() => onCreateDocument(parentPath))} />
          <ContextMenuButton label="新建表格" icon={<FileSpreadsheet size={15} />} onClick={() => runAction(() => onCreateSpreadsheet(parentPath))} />
          <ContextMenuButton label="新建多维表格" icon={<LayoutGrid size={15} />} onClick={() => runAction(() => onCreateMultidimensionalTable(parentPath))} />
        </>
      ) : null}
      {menu.kind === "folder" ? (
        <>
          <div className="sidebar-context-menu__separator" />
          <ContextMenuButton label="重命名目录" icon={<Pencil size={15} />} onClick={() => runAction(() => onRenameDirectory(menu.node.directory))} />
          <ContextMenuButton danger label="删除目录" icon={<Trash2 size={15} />} onClick={() => runAction(() => onDeleteDirectory(menu.node.directory))} />
        </>
      ) : null}
      {menu.kind === "document" ? (
        <>
          <ContextMenuButton label="重命名文档" icon={<Pencil size={15} />} onClick={() => runAction(() => onRenameDocument(menu.node.document))} />
          <ContextMenuButton danger label="删除文档" icon={<Trash2 size={15} />} onClick={() => runAction(() => onDeleteDocument(menu.node.document))} />
        </>
      ) : null}
    </div>
  );
});
SidebarContextMenuPanel.displayName = "SidebarContextMenuPanel";

function ContextMenuButton({
  label,
  icon,
  danger = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={danger ? "is-danger" : undefined} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function RowButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="tree-action-button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {icon}
    </button>
  );
}

function contextMenuPosition(event: ReactMouseEvent): { x: number; y: number } {
  return {
    x: Math.min(event.clientX, window.innerWidth - 188),
    y: Math.min(event.clientY, window.innerHeight - 244),
  };
}

export function resolvePointerIntent(
  flatNodes: FlatDocumentTreeNode[],
  overId: string,
  clientY: number | null,
): WorkspaceDropIntent | null {
  if (!overId) {
    return null;
  }
  if (overId === rootDropId) {
    return { placement: "root-end" };
  }

  const target = flatNodes.find((node) => node.itemId === overId);
  if (!target) {
    return null;
  }

  const targetElement = document.querySelector<HTMLElement>(`[data-tree-item-id="${escapeAttributeValue(overId)}"]`);
  const rect = targetElement?.getBoundingClientRect();
  if (!rect || clientY === null) {
    return { placement: "inside", targetId: overId };
  }

  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  // 上下边缘只保留较窄排序区，目标行大部分区域用于拖入子级。
  if (ratio < 0.18) {
    return { placement: "before", targetId: overId };
  }
  if (ratio > 0.82) {
    return { placement: "after", targetId: overId };
  }
  return { placement: "inside", targetId: overId };
}

function pointerY(event: DragMoveEvent | DragOverEvent | DragEndEvent): number | null {
  const activator = event.activatorEvent;
  if (activator && "clientY" in activator && typeof activator.clientY === "number") {
    return activator.clientY + event.delta.y;
  }
  return null;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function filterDocumentTreeByName(nodes: DocumentTreeNode[], query: string): DocumentTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "document") {
      return normalizeSearchQuery(node.name).includes(query) ? [{ ...node, children: [] }] : [];
    }

    const children = filterDocumentTreeByName(node.children, query);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

function flattenVisibleDocumentTree(
  nodes: ReturnType<typeof buildDocumentTree>,
  collapsedFolderIds: Set<string>,
): FlatDocumentTreeNode[] {
  const allNodes = flattenDocumentTree(nodes);
  return allNodes.filter((node) => !node.ancestorIds.some((ancestorId) => collapsedFolderIds.has(ancestorId)));
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
