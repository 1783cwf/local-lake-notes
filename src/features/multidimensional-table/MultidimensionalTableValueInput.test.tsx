import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  MultidimensionalTableValueInput,
  updateMultidimensionalRecordFieldHeight,
} from "./MultidimensionalTableValueInput";
import {
  createDefaultMultidimensionalTableDocument,
  createEmptyMultidimensionalTableRecord,
  type MultidimensionalTableField,
} from "./multidimensionalTableDocument";

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
      ariaLabel="测试时间"
    />,
  );

  await user.click(screen.getByLabelText("打开测试时间选择器"));

  expect(screen.getByRole("dialog", { name: "测试时间选择器" })).toBeInTheDocument();
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

test("长文本输入会恢复已保存高度", () => {
  render(
    <MultidimensionalTableValueInput
      field={{ id: "description", name: "主要内容", type: "longText" }}
      value="测试内容"
      onChange={vi.fn()}
      ariaLabel="主要内容"
      longTextHeight={280}
    />,
  );

  expect(screen.getByLabelText("主要内容")).toHaveStyle({ height: "280px" });
});

test("长文本高度按记录字段写入布局元数据", () => {
  const document = createDefaultMultidimensionalTableDocument();
  const longTextDocument = {
    ...document,
    fields: document.fields.map((field) => field.id === "description"
      ? { ...field, type: "longText" as const }
      : field),
  };
  const firstRecord = createEmptyMultidimensionalTableRecord(longTextDocument.fields, { title: "记录1" });
  const secondRecord = createEmptyMultidimensionalTableRecord(longTextDocument.fields, { title: "记录2" });
  const updated = updateMultidimensionalRecordFieldHeight({
    ...longTextDocument,
    records: [firstRecord, secondRecord],
  }, secondRecord.id, "description", 333.6);

  expect(updated.records[0].fieldLayouts).toBeUndefined();
  expect(updated.records[1].fieldLayouts?.description?.height).toBe(334);
});

function timeField(timeFormat: MultidimensionalTableField["timeFormat"]): MultidimensionalTableField {
  return {
    id: "date",
    name: "日期",
    type: "time",
    timeFormat,
  };
}
