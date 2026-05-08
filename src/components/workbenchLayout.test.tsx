import { render, screen } from "@testing-library/react";

import { AppRail } from "./AppRail";
import { TopBar } from "./TopBar";

test("工作台关键区域具备可访问入口", () => {
  render(
    <>
      <AppRail onChooseWorkspace={vi.fn()} onCreateDocument={vi.fn()} onOpenSettings={vi.fn()} />
      <TopBar document={null} saveStatus={{ state: "clean" }} onManualSave={vi.fn()} />
    </>,
  );

  expect(screen.getByRole("navigation", { name: "应用导航" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "知识库" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});
