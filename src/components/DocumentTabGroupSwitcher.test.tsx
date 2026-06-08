import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DocumentTabGroupSwitcher } from "./DocumentTabGroupSwitcher";

test("标签组菜单可以保存当前锁定标签组", async () => {
  const user = userEvent.setup();
  const onSaveCurrentGroup = vi.fn();

  render(
    <DocumentTabGroupSwitcher
      groups={[]}
      lockedTabCount={2}
      onSaveCurrentGroup={onSaveCurrentGroup}
      onOpenGroup={vi.fn()}
      onDeleteGroup={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "标签组" }));
  await user.type(screen.getByLabelText("标签组名称"), "工作集");
  await user.click(screen.getByRole("menuitem", { name: /保存/ }));

  expect(onSaveCurrentGroup).toHaveBeenCalledWith("工作集");
});

test("标签组菜单可以打开和删除已有标签组", async () => {
  const user = userEvent.setup();
  const onOpenGroup = vi.fn();
  const onDeleteGroup = vi.fn();

  render(
    <DocumentTabGroupSwitcher
      groups={[{
        id: "group-1",
        name: "日报",
        items: [
          { workspaceRoot: "/tmp/work", path: "a.lake" },
          { workspaceRoot: "/tmp/common", path: "b.lake", mode: "read" },
        ],
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
      }]}
      lockedTabCount={0}
      onSaveCurrentGroup={vi.fn()}
      onOpenGroup={onOpenGroup}
      onDeleteGroup={onDeleteGroup}
    />,
  );

  await user.click(screen.getByRole("button", { name: "标签组" }));
  const menu = screen.getByRole("menu", { name: "标签组" });
  await user.click(within(menu).getByRole("menuitem", { name: /日报/ }));
  expect(onOpenGroup).toHaveBeenCalledWith("group-1");

  await user.click(screen.getByRole("button", { name: "标签组" }));
  await user.click(screen.getByRole("button", { name: "删除标签组 日报" }));
  expect(onDeleteGroup).toHaveBeenCalledWith("group-1");
});
