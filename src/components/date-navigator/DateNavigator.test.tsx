import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatasetIndex } from "../../types";
import { makeDatasetIndex } from "../../test/fixtures";
import { DateNavigator } from "./DateNavigator";

const index = makeDatasetIndex(["2026-04-27", "2026-04-28", "2026-04-29"], {
  "2026-04-27": { missingFiles: ["flow"] },
});

function renderNavigator(
  selectedDate = "2026-04-28",
  dataset: DatasetIndex = index,
  onSelectDate = vi.fn()
) {
  const utils = render(
    <DateNavigator
      dataset={dataset}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
    />
  );
  return { ...utils, onSelectDate };
}

describe("DateNavigator", () => {
  afterEach(() => {
    cleanup();
  });

  it("navigates as soon as a valid date is typed, with no separate jump button", async () => {
    const { onSelectDate } = renderNavigator();

    await userEvent.clear(screen.getByLabelText("跳转日期"));
    await userEvent.type(screen.getByLabelText("跳转日期"), "2026-04-29");

    expect(onSelectDate).toHaveBeenCalledWith("2026-04-29");
    expect(screen.queryByRole("button", { name: "跳转" })).toBeNull();
  });

  it("syncs the jump input when the selection changes elsewhere", async () => {
    const { rerender } = renderNavigator("2026-04-28");

    rerender(
      <DateNavigator
        dataset={index}
        selectedDate="2026-04-27"
        onSelectDate={vi.fn()}
      />
    );

    expect(screen.getByLabelText("跳转日期")).toHaveValue("2026-04-27");
  });

  it("suggests the nearest available date instead of failing silently", async () => {
    const gapped = makeDatasetIndex(["2026-04-27", "2026-05-02"]);
    const { onSelectDate } = renderNavigator("2026-05-02", gapped);

    await userEvent.clear(screen.getByLabelText("跳转日期"));
    await userEvent.type(screen.getByLabelText("跳转日期"), "2026-04-29");

    expect(onSelectDate).not.toHaveBeenCalled();
    expect(screen.getByText(/没有数据/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "2026-04-27" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-04-27");
  });

  it("shows the position inside the navigation scope and steps day by day", async () => {
    const { onSelectDate } = renderNavigator();

    expect(screen.getByText("第 2 / 3 天")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "← 上一天" }));
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-04-27");
  });

  it("restricts stepping to the filtered scope", async () => {
    const { onSelectDate } = renderNavigator();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "只看缺失文件日期" })
    );

    expect(screen.getByText(/不在筛选范围内/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一天 →" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "跳到范围内最近日期" })
    );
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-04-27");

    await userEvent.click(screen.getByRole("button", { name: "← 上一天" }));
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-04-27");
  });

  it("steps with arrow keys but ignores them inside inputs", () => {
    const { onSelectDate } = renderNavigator();
    const cell = screen.getByTitle("2026-04-28 — 数据完整 · AI+HI 0 次");

    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-04-29");

    fireEvent.keyDown(cell, { key: "ArrowLeft" });
    expect(onSelectDate).toHaveBeenLastCalledWith("2026-04-27");

    fireEvent.keyDown(screen.getByLabelText("跳转日期"), { key: "ArrowRight" });
    expect(onSelectDate).toHaveBeenCalledTimes(2);
  });

  it("does not hijack arrow keys combined with browser modifiers", () => {
    const { onSelectDate } = renderNavigator();
    const cell = screen.getByTitle("2026-04-28 — 数据完整 · AI+HI 0 次");

    fireEvent.keyDown(cell, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(cell, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(cell, { key: "ArrowLeft", ctrlKey: true });

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("disables the in-scope jump when the filter matches nothing", async () => {
    renderNavigator();

    await userEvent.type(
      screen.getByRole("spinbutton", { name: "最短使用时长(小时)" }),
      "999"
    );

    expect(screen.getByText(/不在筛选范围内/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "跳到范围内最近日期" })
    ).toBeDisabled();
  });

  it("labels heat cells for accessibility and marks the selected one", () => {
    renderNavigator();

    expect(
      screen.getByTitle("2026-04-28 — 数据完整 · AI+HI 0 次")
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTitle("2026-04-27 — 缺失 1 个文件 · AI+HI 0 次")
    ).toHaveAttribute("aria-label", "2026-04-27 — 缺失 1 个文件 · AI+HI 0 次");
  });
});
