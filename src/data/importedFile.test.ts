import { describe, expect, it } from "vitest";
import type { ImportedFileRef } from "../types";
import { importedFileRefFromFile } from "./importedFile";

function makeFile(bytes: Uint8Array<ArrayBuffer>): ImportedFileRef {
  return importedFileRefFromFile(new File([bytes], "a.edf"), "a.edf");
}

describe("importedFile", () => {
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;

  it("reads the whole file when no range is given", async () => {
    const buffer = await makeFile(bytes).read();
    expect(new Uint8Array(buffer)).toEqual(bytes);
  });

  it("reads to EOF when only start is given", async () => {
    const tail = await makeFile(bytes).read(1000);
    expect(tail.byteLength).toBe(24);
    expect(new Uint8Array(tail)).toEqual(bytes.slice(1000));
  });

  it("reads an exact [start, end) slice", async () => {
    const header = await makeFile(bytes).read(0, 512);
    expect(header.byteLength).toBe(512);
    expect(new Uint8Array(header)).toEqual(bytes.slice(0, 512));

    const middle = await makeFile(bytes).read(100, 200);
    expect(middle.byteLength).toBe(100);
    expect(new Uint8Array(middle)).toEqual(bytes.slice(100, 200));
  });
});
