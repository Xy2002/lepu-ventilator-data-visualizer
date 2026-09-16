import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "../../data/csv";
import { computePressureRange } from "../../data/dataset";
import { makeDatasetIndex } from "../../test/fixtures";
import { FilteredDayList } from "./FilteredDayList";

vi.mock("../../data/csv", () => ({
  downloadCsv: vi.fn(),
  exportDateSummariesCsv: vi.fn(() => "date,summary"),
}));
vi.mock("../../data/dataset", () => ({
  computePressureRange: vi.fn(),
}));

const mockedCompute = vi.mocked(computePressureRange);
const mockedDownload = vi.mocked(downloadCsv);

function renderList(onSelectDate = vi.fn()) {
  const dataset = makeDatasetIndex(["2026-04-27"]);
  render(
    <FilteredDayList
      dataset={dataset}
      filteredDays={dataset.days}
      missingOnly={false}
      selectedDate="2026-04-27"
      onSelectDate={onSelectDate}
    />
  );
  return onSelectDate;
}

describe("FilteredDayList", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the filtered day count in the header", () => {
    renderList();

    expect(screen.getByText("共 1 天")).toBeInTheDocument();
    expect(screen.queryByText(/显示最近/)).toBeNull();
  });

  it("shows an empty state when no days match the filter", () => {
    const dataset = makeDatasetIndex(["2026-04-27"]);
    render(
      <FilteredDayList
        dataset={dataset}
        filteredDays={[]}
        missingOnly={false}
        selectedDate="2026-04-27"
        onSelectDate={vi.fn()}
      />
    );

    expect(screen.getByText("没有符合筛选条件的日期")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "导出筛选日期摘要" })
    ).toBeDisabled();
    expect(screen.queryByText(/共 .* 天/)).toBeNull();
  });

  it("aborts the export when a day's pressure data cannot be read", async () => {
    renderList();
    mockedCompute.mockRejectedValueOnce(new Error("read failed"));

    await userEvent.click(
      screen.getByRole("button", { name: "导出筛选日期摘要" })
    );

    expect(await screen.findByText(/压力数据读取失败/)).toBeInTheDocument();
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it("exports the filtered days once pressure ranges are filled in", async () => {
    renderList();
    mockedCompute.mockResolvedValueOnce({ min: 4, max: 9 });

    await userEvent.click(
      screen.getByRole("button", { name: "导出筛选日期摘要" })
    );

    await waitFor(() => expect(mockedDownload).toHaveBeenCalledTimes(1));
    expect(mockedDownload).toHaveBeenCalledWith(
      "summaries-2026-04-27-to-2026-04-27.csv",
      "date,summary"
    );
    expect(screen.queryByText(/压力数据读取失败/)).toBeNull();
  });
});
