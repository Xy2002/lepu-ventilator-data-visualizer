import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportPanel } from "./ImportPanel";
import type { ImportedFileRef } from "../types";

describe("ImportPanel", () => {
  it("passes selected files to the importer", async () => {
    const onImport = vi.fn();
    render(<ImportPanel onImport={onImport} disabled={false} />);
    const file = new File([new Uint8Array([1, 2, 3])], "20260429_flow.edf");

    await userEvent.upload(screen.getByLabelText("选择 EDF 文件"), file);

    const [ref] = onImport.mock.calls[0][0] as ImportedFileRef[];
    expect(ref.name).toBe("20260429_flow.edf");
    expect(ref.path).toBe("20260429_flow.edf");
    expect(ref.size).toBe(3);
    expect(ref.lastModified).toBe(file.lastModified);
    // 内容读取走惰性 read(),不再持有 File 句柄字段
    expect(new Uint8Array(await ref.read())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
