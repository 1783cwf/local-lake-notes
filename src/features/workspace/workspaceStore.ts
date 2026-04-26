export interface WorkspaceDocument {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  modifiedAt?: string;
  size: number;
}

export interface WorkspacePayload {
  root: string;
  documents: WorkspaceDocument[];
}

export interface CreateDocumentPayload extends WorkspacePayload {
  createdDocument: WorkspaceDocument;
}

export interface DocumentTreeNode {
  id: string;
  name: string;
  path: string;
  type: "folder" | "document";
  children: DocumentTreeNode[];
  document?: WorkspaceDocument;
}

export function buildDocumentTree(documents: WorkspaceDocument[]): DocumentTreeNode[] {
  const roots: DocumentTreeNode[] = [];
  const folders = new Map<string, DocumentTreeNode>();

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
    const node: DocumentTreeNode = {
      id: `folder:${folderPath}`,
      name,
      path: folderPath,
      type: "folder",
      children: [],
    };

    folders.set(folderPath, node);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  for (const document of documents) {
    const node: DocumentTreeNode = {
      id: `document:${document.path}`,
      name: document.name,
      path: document.path,
      type: "document",
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

export function documentTitleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.lake$/i, "");
}
