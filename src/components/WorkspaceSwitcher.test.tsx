import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const workspaces = [
  { root: "/Users/me/work", name: "work", lastOpenedAt: "2026-05-08T10:00:00Z" },
  { root: "/Users/me/common", name: "通用知识库", lastOpenedAt: "2026-05-08T09:00:00Z" },
];

function renderSwitcher(overrides: Partial<React.ComponentProps<typeof WorkspaceSwitcher>> = {}) {
  const props: React.ComponentProps<typeof WorkspaceSwitcher> = {
    activeWorkspaceRoot: "/Users/me/work",
    knownWorkspaces: workspaces,
    onChooseWorkspace: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onSwitchWorkspace: vi.fn(),
    onForgetWorkspace: vi.fn(),
    ...overrides,
  };

  render(<WorkspaceSwitcher {...props} />);
  return props;
}

test("打开后展示已知知识库和管理入口", async () => {
  const user = userEvent.setup();
  renderSwitcher();

  await user.click(screen.getByRole("button", { name: "知识库" }));

  const menu = screen.getByRole("menu", { name: "知识库" });
  expect(within(menu).getByText("work")).toBeInTheDocument();
  expect(within(menu).getByText("通用知识库")).toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: "添加已有知识库" })).toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: "新建知识库" })).toBeInTheDocument();
});

test("选择非当前知识库时触发切换并收起弹层", async () => {
  const user = userEvent.setup();
  const props = renderSwitcher();

  await user.click(screen.getByRole("button", { name: "知识库" }));
  await user.click(screen.getByRole("menuitem", { name: /通用知识库/ }));

  expect(props.onSwitchWorkspace).toHaveBeenCalledWith("/Users/me/common");
  expect(screen.queryByRole("menu", { name: "知识库" })).not.toBeInTheDocument();
});

test("当前知识库保持选中态且不会重复切换", async () => {
  const user = userEvent.setup();
  const props = renderSwitcher();

  await user.click(screen.getByRole("button", { name: "知识库" }));

  expect(screen.getByRole("menuitem", { name: /work/ })).toBeDisabled();
  await user.click(screen.getByRole("menuitem", { name: /work/ }));

  expect(props.onSwitchWorkspace).not.toHaveBeenCalled();
});

test("添加已有和新建知识库使用各自回调", async () => {
  const user = userEvent.setup();
  const props = renderSwitcher();

  await user.click(screen.getByRole("button", { name: "知识库" }));
  await user.click(screen.getByRole("menuitem", { name: "添加已有知识库" }));
  expect(props.onChooseWorkspace).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "知识库" }));
  await user.click(screen.getByRole("menuitem", { name: "新建知识库" }));
  expect(props.onCreateWorkspace).toHaveBeenCalledTimes(1);
});

test("移除知识库只从列表遗忘，不触发切换", async () => {
  const user = userEvent.setup();
  const props = renderSwitcher();

  await user.click(screen.getByRole("button", { name: "知识库" }));
  await user.click(screen.getByRole("button", { name: "从列表移除 通用知识库" }));

  expect(props.onForgetWorkspace).toHaveBeenCalledWith("/Users/me/common");
  expect(props.onSwitchWorkspace).not.toHaveBeenCalled();
});

test("没有已知知识库时展示空状态", async () => {
  const user = userEvent.setup();
  renderSwitcher({ activeWorkspaceRoot: null, knownWorkspaces: [] });

  await user.click(screen.getByRole("button", { name: "知识库" }));

  expect(screen.getByText("还没有知识库")).toBeInTheDocument();
});
