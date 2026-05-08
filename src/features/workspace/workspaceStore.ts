export type WorkspaceDocumentKind = "lake" | "spreadsheet" | "multidimensional-table";

export interface WorkspaceDocument {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  kind: WorkspaceDocumentKind;
  modifiedAt?: string;
  size: number;
}

export interface WorkspaceDirectory {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  modifiedAt?: string;
}

export interface WorkspacePayload {
  root: string;
  directories: WorkspaceDirectory[];
  documents: WorkspaceDocument[];
  order: string[];
}

export interface KnownWorkspace {
  root: string;
  name: string;
  lastOpenedAt: string;
}

export interface CreateDocumentPayload extends WorkspacePayload {
  createdDocument: WorkspaceDocument;
}

export interface MoveWorkspaceItemInput {
  sourceId: string;
  targetParentPath: string;
  order: string[];
}

export interface DocumentTreeNode {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  type: "folder" | "document";
  itemId: string;
  children: DocumentTreeNode[];
  document?: WorkspaceDocument;
  directory?: WorkspaceDirectory;
}

export interface FlatDocumentTreeNode {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  type: "folder" | "document";
  itemId: string;
  depth: number;
  ancestorIds: string[];
  hasChildren: boolean;
  document?: WorkspaceDocument;
  directory?: WorkspaceDirectory;
}

export type WorkspaceDropPlacement = "before" | "after" | "inside" | "root-end";

export interface WorkspaceDropIntent {
  placement: WorkspaceDropPlacement;
  targetId?: string;
}

export type WorkspaceMoveResolution =
  | {
    ok: true;
    noop: boolean;
    sourceId: string;
    sourcePath: string;
    sourceType: "folder" | "document";
    sourceChildContainerPath?: string;
    targetParentPath: string;
    targetPath: string;
    targetChildContainerPath?: string;
    order: string[];
  }
  | {
    ok: false;
    noop: false;
    sourceId: string;
    reason: string;
  };

export function buildDocumentTree(
  documents: WorkspaceDocument[],
  directories: WorkspaceDirectory[] = [],
  order: string[] = [],
): DocumentTreeNode[] {
  const roots: DocumentTreeNode[] = [];
  const folders = new Map<string, DocumentTreeNode>();
  const explicitDirectories = new Map(directories.map((directory) => [directory.path, directory]));
  const orderRank = new Map(order.map((itemId, index) => [itemId, index]));

  const ensureFolder = (folderPath: string): DocumentTreeNode | null => {
    if (!folderPath) {
      return null;
    }

    const existing = folders.get(folderPath);
    if (existing) {
      return existing;
    }

    const segments = folderPath.split("/").filter(Boolean);
    const name = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    const directory = explicitDirectories.get(folderPath);
    const node: DocumentTreeNode = {
      id: `folder:${folderPath}`,
      name: directory?.name ?? name,
      path: folderPath,
      parentPath,
      type: "folder",
      itemId: `folder:${folderPath}`,
      children: [],
      directory,
    };

    folders.set(folderPath, node);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  for (const directory of directories) {
    ensureFolder(directory.path);
  }

  for (const document of documents) {
    const node: DocumentTreeNode = {
      id: `document:${document.path}`,
      name: document.name,
      path: document.path,
      parentPath: document.parentPath,
      type: "document",
      itemId: `document:${document.path}`,
      children: [],
      document,
    };
    const childContainerPath = documentChildContainerPath(document.path);
    const existingChildContainer = folders.get(childContainerPath);

    if (existingChildContainer?.type === "folder") {
      // 文档允许承载子级：把同名目录作为文档的子级容器隐藏到文档节点下。
      existingChildContainer.id = node.id;
      existingChildContainer.name = node.name;
      existingChildContainer.path = node.path;
      existingChildContainer.parentPath = node.parentPath;
      existingChildContainer.type = "document";
      existingChildContainer.itemId = node.itemId;
      existingChildContainer.document = document;
      continue;
    }

    const parent = ensureFolder(document.parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    if (!folders.has(childContainerPath)) {
      folders.set(childContainerPath, node);
    }
  }

  const sortTree = (nodes: DocumentTreeNode[]) => {
    nodes.sort((a, b) => {
      const rankA = orderRank.get(a.itemId) ?? documentChildContainerRank(a, orderRank);
      const rankB = orderRank.get(b.itemId) ?? documentChildContainerRank(b, orderRank);
      if (rankA !== undefined || rankB !== undefined) {
        return (rankA ?? Number.MAX_SAFE_INTEGER) - (rankB ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(roots);
  return roots;
}

export function flattenTreeOrder(nodes: DocumentTreeNode[]): string[] {
  return flattenDocumentTree(nodes).map((node) => node.itemId);
}

export function flattenDocumentTree(
  nodes: DocumentTreeNode[],
  depth = 0,
  ancestorIds: string[] = [],
): FlatDocumentTreeNode[] {
  return nodes.flatMap((node) => {
    const flatNode: FlatDocumentTreeNode = {
      id: node.id,
      name: node.name,
      path: node.path,
      parentPath: node.parentPath,
      type: node.type,
      itemId: node.itemId,
      depth,
      ancestorIds,
      hasChildren: node.children.length > 0,
      document: node.document,
      directory: node.directory,
    };

    return [
      flatNode,
      ...flattenDocumentTree(node.children, depth + 1, [...ancestorIds, node.itemId]),
    ];
  });
}

export function resolveWorkspaceMove(
  nodes: DocumentTreeNode[],
  sourceId: string,
  intent: WorkspaceDropIntent,
): WorkspaceMoveResolution {
  const flatNodes = flattenDocumentTree(nodes);
  const source = flatNodes.find((node) => node.itemId === sourceId);
  if (!source) {
    return invalidMove(sourceId, "移动源不存在");
  }

  const currentOrder = flatNodes.map((node) => node.itemId);
  if (intent.targetId === source.itemId && intent.placement !== "inside") {
    return {
      ok: true,
      noop: true,
      sourceId,
      sourcePath: source.path,
      sourceType: source.type,
      targetParentPath: source.parentPath,
      targetPath: source.path,
      order: currentOrder,
    };
  }

  const targetParentPath = resolveTargetParentPath(flatNodes, source, intent);
  if (!targetParentPath.ok) {
    return invalidMove(sourceId, targetParentPath.reason);
  }

  const sourceChildContainerPath = source.type === "document" ? documentChildContainerPath(source.path) : undefined;
  if (sourceBlocksTargetParentPath(source, targetParentPath.value, sourceChildContainerPath)) {
    return invalidMove(sourceId, "不能把项目移动到自身或子级内");
  }

  const movedIds = movedItemIds(flatNodes, source);
  const remainingOrder = currentOrder.filter((itemId) => !movedIds.has(itemId));
  const insertIndex = resolveInsertIndex(remainingOrder, movedIds, source, intent);
  if (!insertIndex.ok) {
    return invalidMove(sourceId, insertIndex.reason);
  }

  const nextOrder = [
    ...remainingOrder.slice(0, insertIndex.value),
    ...currentOrder.filter((itemId) => movedIds.has(itemId)),
    ...remainingOrder.slice(insertIndex.value),
  ];
  const targetPath = joinRelativePath(targetParentPath.value, pathBasename(source.path));
  const targetChildContainerPath = source.type === "document" ? documentChildContainerPath(targetPath) : undefined;

  return {
    ok: true,
    noop: source.path === targetPath && arraysEqual(currentOrder, nextOrder),
    sourceId,
    sourcePath: source.path,
    sourceType: source.type,
    sourceChildContainerPath,
    targetParentPath: targetParentPath.value,
    targetPath,
    targetChildContainerPath,
    order: nextOrder,
  };
}

export function applyWorkspaceMove(
  workspace: WorkspacePayload,
  move: WorkspaceMoveResolution,
): WorkspacePayload {
  if (!move.ok || move.noop) {
    return workspace;
  }

  const rewritePath = (path: string) => {
    if (
      move.sourceType === "document" &&
      move.sourceChildContainerPath &&
      move.targetChildContainerPath &&
      isSameOrChildPath(path, move.sourceChildContainerPath)
    ) {
      return replacePathPrefix(path, move.sourceChildContainerPath, move.targetChildContainerPath);
    }
    return replacePathPrefix(path, move.sourcePath, move.targetPath);
  };
  const rewriteParentPath = (parentPath: string) => {
    if (parentPath === move.sourcePath) {
      return move.targetPath;
    }
    return rewritePath(parentPath);
  };

  return {
    ...workspace,
    directories: workspace.directories.map((directory) => {
      if (!pathMovesWithResolution(directory.path, move)) {
        return directory;
      }

      const path = rewritePath(directory.path);
      return {
        ...directory,
        id: path,
        path,
        parentPath: directory.path === move.sourcePath || directory.path === move.sourceChildContainerPath
          ? move.targetParentPath
          : rewriteParentPath(directory.parentPath),
      };
    }),
    documents: workspace.documents.map((document) => {
      if (!pathMovesWithResolution(document.path, move)) {
        return document;
      }

      const path = rewritePath(document.path);
      return {
        ...document,
        id: path,
        path,
        parentPath: document.path === move.sourcePath ? move.targetParentPath : rewriteParentPath(document.parentPath),
      };
    }),
    order: move.order.map((itemId) => replaceMovedOrderedItemPath(itemId, move)),
  };
}

export function documentTitleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.dbtable\.json$/i, "").replace(/\.(lake|json)$/i, "");
}

function resolveTargetParentPath(
  flatNodes: FlatDocumentTreeNode[],
  source: FlatDocumentTreeNode,
  intent: WorkspaceDropIntent,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (intent.placement === "root-end") {
    return { ok: true, value: "" };
  }

  const target = intent.targetId ? flatNodes.find((node) => node.itemId === intent.targetId) : null;
  if (!target) {
    return { ok: false, reason: "拖拽目标不存在" };
  }

  if (target.itemId === source.itemId) {
    return intent.placement === "inside"
      ? { ok: false, reason: "不能把项目移动到自身内" }
      : { ok: true, value: source.parentPath };
  }

  if (intent.placement === "inside") {
    return {
      ok: true,
      value: target.type === "document" ? documentChildContainerPath(target.path) : target.path,
    };
  }

  return { ok: true, value: target.parentPath };
}

function resolveInsertIndex(
  remainingOrder: string[],
  movedIds: Set<string>,
  source: FlatDocumentTreeNode,
  intent: WorkspaceDropIntent,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (intent.placement === "root-end") {
    return { ok: true, value: remainingOrder.length };
  }

  const targetId = intent.targetId;
  if (!targetId) {
    return { ok: false, reason: "拖拽目标不存在" };
  }

  if (targetId === source.itemId) {
    const sourceIndex = remainingOrder.findIndex((itemId) => itemId === source.itemId);
    return { ok: true, value: sourceIndex >= 0 ? sourceIndex : 0 };
  }

  if (movedIds.has(targetId)) {
    return { ok: false, reason: "不能移动到自身子节点附近" };
  }

  const targetIndex = remainingOrder.indexOf(targetId);
  if (targetIndex < 0) {
    return { ok: false, reason: "拖拽目标不存在" };
  }

  if (intent.placement === "after" || intent.placement === "inside") {
    return { ok: true, value: targetIndex + 1 };
  }
  return { ok: true, value: targetIndex };
}

function movedItemIds(flatNodes: FlatDocumentTreeNode[], source: FlatDocumentTreeNode): Set<string> {
  return new Set(
    flatNodes
      .filter((node) => (
        node.itemId === source.itemId ||
        node.ancestorIds.includes(source.itemId) ||
        (source.type === "folder" && isSameOrChildPath(node.path, source.path))
      ))
      .map((node) => node.itemId),
  );
}

function invalidMove(sourceId: string, reason: string): WorkspaceMoveResolution {
  return { ok: false, noop: false, sourceId, reason };
}

function pathBasename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function documentChildContainerPath(path: string): string {
  return path
    .replace(/\.dbtable\.json$/i, "")
    .replace(/\.(lake|json)$/i, "");
}

function documentChildContainerRank(
  node: DocumentTreeNode,
  orderRank: Map<string, number>,
): number | undefined {
  if (!node.document) {
    return undefined;
  }
  return orderRank.get(`folder:${documentChildContainerPath(node.document.path)}`);
}

function joinRelativePath(parentPath: string, basename: string): string {
  return parentPath ? `${parentPath}/${basename}` : basename;
}

function sourceBlocksTargetParentPath(
  source: FlatDocumentTreeNode,
  targetParentPath: string,
  sourceChildContainerPath: string | undefined,
): boolean {
  const blockedPath = source.type === "folder" ? source.path : sourceChildContainerPath;
  return Boolean(blockedPath && (targetParentPath === blockedPath || isChildPath(targetParentPath, blockedPath)));
}

function replaceMovedOrderedItemPath(itemId: string, move: Extract<WorkspaceMoveResolution, { ok: true }>): string {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex < 0) {
    return itemId;
  }

  const kind = itemId.slice(0, separatorIndex);
  const path = itemId.slice(separatorIndex + 1);
  if (
    move.sourceType === "document" &&
    move.sourceChildContainerPath &&
    move.targetChildContainerPath &&
    isSameOrChildPath(path, move.sourceChildContainerPath)
  ) {
    return `${kind}:${replacePathPrefix(path, move.sourceChildContainerPath, move.targetChildContainerPath)}`;
  }
  return isSameOrChildPath(path, move.sourcePath) ? `${kind}:${replacePathPrefix(path, move.sourcePath, move.targetPath)}` : itemId;
}

function pathMovesWithResolution(path: string, move: Extract<WorkspaceMoveResolution, { ok: true }>): boolean {
  return isSameOrChildPath(path, move.sourcePath) ||
    Boolean(move.sourceChildContainerPath && isSameOrChildPath(path, move.sourceChildContainerPath));
}

function replacePathPrefix(path: string, fromPath: string, toPath: string): string {
  if (!path) {
    return "";
  }
  return isSameOrChildPath(path, fromPath) ? `${toPath}${path.slice(fromPath.length)}` : path;
}

function isSameOrChildPath(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

function isChildPath(path: string, basePath: string): boolean {
  return path.startsWith(`${basePath}/`);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
