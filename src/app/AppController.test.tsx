import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppController } from "./AppController";

const setWorkspaceRoot = vi.fn();

vi.mock("../lib/tauri", () => ({
  chooseWorkspaceDirectory: vi.fn(async () => "/tmp/kb"),
  createLakeDirectory: vi.fn(),
  createLakeDocument: vi.fn(),
  deleteLakeDirectory: vi.fn(),
  deleteLakeDocument: vi.fn(),
  getOssSettings: vi.fn(async () => null),
  getRecentWorkspace: vi.fn(async () => null),
  openExternalUrl: vi.fn(),
  readLakeDocument: vi.fn(async () => "<p>hello</p>"),
  renameLakeDirectory: vi.fn(),
  renameLakeDocument: vi.fn(),
  renameWorkspace: vi.fn(),
  saveOssSettings: vi.fn(),
  saveWorkspaceOrder: vi.fn(),
  setWorkspaceRoot: (...args: unknown[]) => setWorkspaceRoot(...args),
  uploadFile: vi.fn(),
  uploadImage: vi.fn(),
  writeLakeDocument: vi.fn(),
}));

test("选择目录后展示 workspace 文档", async () => {
  const user = userEvent.setup();
  setWorkspaceRoot.mockResolvedValue({
    root: "/tmp/kb",
    directories: [],
    documents: [
      {
        id: "a.lake",
        path: "a.lake",
        name: "a",
        parentPath: "",
        size: 1,
      },
    ],
    order: [],
  });

  render(<AppController />);

  await user.click(screen.getByRole("button", { name: "选择目录" }));

  await waitFor(() => {
    expect(screen.getByText("kb")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /a/ })).toBeInTheDocument();
  });
});
