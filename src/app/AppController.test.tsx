import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppController } from "./AppController";

const setWorkspaceRoot = vi.fn();

vi.mock("../lib/tauri", () => ({
  chooseWorkspaceDirectory: vi.fn(async () => "/tmp/kb"),
  createLakeDocument: vi.fn(),
  getOssSettings: vi.fn(async () => null),
  getRecentWorkspace: vi.fn(async () => null),
  readLakeDocument: vi.fn(async () => "<p>hello</p>"),
  saveOssSettings: vi.fn(),
  setWorkspaceRoot: (...args: unknown[]) => setWorkspaceRoot(...args),
  uploadImage: vi.fn(),
  writeLakeDocument: vi.fn(),
}));

test("选择目录后展示 workspace 文档", async () => {
  const user = userEvent.setup();
  setWorkspaceRoot.mockResolvedValue({
    root: "/tmp/kb",
    documents: [
      {
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
      },
    ],
  });

  render(<AppController />);

  await user.click(screen.getByRole("button", { name: "选择目录" }));

  await waitFor(() => {
    expect(screen.getByText("kb")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /a/ })).toBeInTheDocument();
  });
});
