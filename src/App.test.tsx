import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "./App";

vi.mock("./app/AppController", () => ({
  AppController: () => <div data-testid="app-controller" />,
}));

test("渲染应用控制器", () => {
  render(<App />);

  expect(screen.getByTestId("app-controller")).toBeInTheDocument();
});
