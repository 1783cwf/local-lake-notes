import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MultidimensionalTableValueInput } from "./MultidimensionalTableValueInput";
import type { MultidimensionalTableField } from "./multidimensionalTableDocument";

test("日期格式只显示日历选择", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <MultidimensionalTableValueInput
      field={timeField("yyyy/mm/dd")}
      value="2026/05/07"
      onChange={onChange}
      ariaLabel="日期"
    />,
  );

  await user.click(screen.getByLabelText("打开日期选择器"));

  expect(screen.getByRole("dialog", { name: "日期选择器" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择日期 2026-05-07" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByLabelText("小时")).not.toBeInTheDocument();
});

test("日期时间格式同时显示日历和时分选择", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <MultidimensionalTableValueInput
      field={timeField("yyyy-mm-dd hh:mm")}
      value="2026-05-07 12:30"
      onChange={onChange}
      ariaLabel="上线时间"
    />,
  );

  await user.click(screen.getByLabelText("打开上线时间选择器"));

  expect(screen.getByRole("dialog", { name: "上线时间选择器" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择日期 2026-05-07" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "选择小时 12" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "选择分钟 30" })).toHaveAttribute("aria-pressed", "true");
});

test("纯时间格式只显示时分选择并写回 HH:mm", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(
    <MultidimensionalTableValueInput
      field={timeField("hh:mm")}
      value="17:45"
      onChange={onChange}
      ariaLabel="提醒时间"
    />,
  );

  await user.click(screen.getByLabelText("打开提醒时间选择器"));

  expect(screen.getByRole("dialog", { name: "提醒时间选择器" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/选择日期/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "选择小时 9" }));
  await user.click(screen.getByRole("button", { name: "选择分钟 5" }));
  await user.click(screen.getByRole("button", { name: "确定" }));

  expect(onChange).toHaveBeenLastCalledWith("09:05");
});

function timeField(timeFormat: MultidimensionalTableField["timeFormat"]): MultidimensionalTableField {
  return {
    id: "date",
    name: "日期",
    type: "time",
    timeFormat,
  };
}
