import { fireEvent, render, screen } from "@testing-library/react";

import { DocumentSidebar } from "./DocumentSidebar";

test("展示目录树并高亮当前文档", () => {
  render(
    <DocumentSidebar
      workspaceRoot="/tmp/kb"
      currentPath="notes/a.lake"
      directories={[
        {
          id: "notes",
          path: "notes",
          name: "notes",
          parentPath: "",
        },
      ]}
      order={[]}
      onCreateDocument={vi.fn()}
      onCreateDirectory={vi.fn()}
      onRenameWorkspace={vi.fn()}
      onOpenDocument={vi.fn()}
      onRenameDocument={vi.fn()}
      onDeleteDocument={vi.fn()}
      onRenameDirectory={vi.fn()}
      onDeleteDirectory={vi.fn()}
      onMoveNode={vi.fn()}
      documents={[
        {
          id: "notes/a.lake",
          path: "notes/a.lake",
          name: "a",
          parentPath: "notes",
          size: 1,
        },
      ]}
    />,
  );

  expect(screen.getByText("kb")).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: /a/ })).toHaveClass("is-current");
});

test("按落点把拖拽节点插入目标后方", () => {
  const onMoveNode = vi.fn();

  render(
    <DocumentSidebar
      workspaceRoot="/tmp/kb"
      currentPath="a.lake"
      directories={[{ id: "notes", path: "notes", name: "notes", parentPath: "" }]}
      documents={[{ id: "a.lake", path: "a.lake", name: "a", parentPath: "", size: 1 }]}
      order={["document:a.lake", "folder:notes"]}
      onCreateDocument={vi.fn()}
      onCreateDirectory={vi.fn()}
      onRenameWorkspace={vi.fn()}
      onOpenDocument={vi.fn()}
      onRenameDocument={vi.fn()}
      onDeleteDocument={vi.fn()}
      onRenameDirectory={vi.fn()}
      onDeleteDirectory={vi.fn()}
      onMoveNode={onMoveNode}
    />,
  );

  const documentRow = screen.getByRole("treeitem", { name: /a/ });
  const folderRow = screen.getByText("notes").closest(".tree-row") as HTMLElement;
  const data = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "",
    dropEffect: "",
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };

  fireEvent.dragStart(documentRow, { dataTransfer });
  vi.spyOn(folderRow, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 138,
    height: 38,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: 100,
    toJSON: () => undefined,
  });
  const dropEvent = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, "clientY", { value: 132 });
  Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
  fireEvent(folderRow, dropEvent);

  expect(onMoveNode).toHaveBeenCalledWith("document:a.lake", "folder:notes", "", "after");
});
