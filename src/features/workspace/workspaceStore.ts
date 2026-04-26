export interface WorkspaceDocument {
  id: string;
  path: string;
  name: string;
  parentPath: string;
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

export interface CreateDocumentPayload extends WorkspacePayload {
  createdDocument: WorkspaceDocument;
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
    const parent = ensureFolder(document.parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (nodes: DocumentTreeNode[]) => {
    nodes.sort((a, b) => {
      const rankA = orderRank.get(a.itemId);
      const rankB = orderRank.get(b.itemId);
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
  return nodes.flatMap((node) => [node.itemId, ...flattenTreeOrder(node.children)]);
}

export function documentTitleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.lake$/i, "");
}
