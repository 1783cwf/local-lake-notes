import { render, screen } from "@testing-library/react";

import { DocumentSidebar } from "./DocumentSidebar";

test("展示目录树并高亮当前文档", () => {
  render(
    <DocumentSidebar
      workspaceRoot="/tmp/kb"
      currentPath="notes/a.lake"
      onCreateDocument={vi.fn()}
      onOpenDocument={vi.fn()}
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
