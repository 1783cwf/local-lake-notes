import { render, screen } from "@testing-library/react";

import { OutlinePanel } from "../src/components/OutlinePanel";

test("视觉 smoke 保留右侧大纲区域", () => {
  render(<OutlinePanel items={[]} />);

  expect(screen.getByLabelText("大纲")).toBeInTheDocument();
});
