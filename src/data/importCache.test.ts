import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ImportedFileRef } from "../types";
import { importedFileRefFromFile } from "./importedFile";
import {
  disposeContentsConnectionForTests,
  loadImportedFiles,
  saveImportedFiles,
} from "./importCache";
import { openDatabase } from "./idb";

const DB_NAME = "ventilator-web-visualizer-import-cache";
const DB_VERSION = 2;

function makeRef(
  name: string,
  bytes: Uint8Array<ArrayBuffer>
): ImportedFileRef {
  return importedFileRefFromFile(
    new File([bytes], name),
    `DATAFILE/20260429/${name}`
  );
}

describe("importCache", () => {
  it("round-trips file metadata and content through IndexedDB", async () => {
    const payload = new Uint8Array(1024);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    const files = [
      makeRef("20260429_flow.edf", payload),
      makeRef("20260429_hi.edf", new Uint8Array([1, 2, 3])),
    ];

    await saveImportedFiles(files);
    const restored = await loadImportedFiles();

    expect(restored).toHaveLength(2);
    expect(restored[0].name).toBe("20260429_flow.edf");
    expect(restored[0].path).toBe("DATAFILE/20260429/20260429_flow.edf");
    expect(restored[0].size).toBe(1024);

    const buffer = await restored[0].read();
    expect(new Uint8Array(buffer)).toEqual(payload);

    // 索引阶段只读 512B 头部:区间读取返回精确切片
    const header = await restored[0].read(0, 512);
    expect(header.byteLength).toBe(512);
    expect(new Uint8Array(header)).toEqual(payload.slice(0, 512));

    const tail = await restored[0].read(1000);
    expect(tail.byteLength).toBe(24);
  });

  it("replaces the previous import instead of appending", async () => {
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);
    await saveImportedFiles([makeRef("b.edf", new Uint8Array([2]))]);

    const restored = await loadImportedFiles();
    expect(restored.map((ref) => ref.name)).toEqual(["b.edf"]);
  });

  it("publishes nothing when a superseded write aborts", async () => {
    // 活跃写入被新导入取代:内容批与 meta 发布都必须中止,
    // 否则 UI 已显示新导入、刷新却会恢复旧数据集。
    // (真实流程中旧缓存由导入开始时的 invalidateImportedFiles 清除;
    //  此处直接从空库开始,验证中止的写入自身不发布任何 meta)
    await disposeContentsConnectionForTests();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
    });

    await saveImportedFiles(
      [makeRef("a.edf", new Uint8Array([1, 2, 3]))],
      () => true
    );

    await expect(loadImportedFiles()).resolves.toEqual([]);
  });

  it("treats a torn cache (meta without contents) as absent", async () => {
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);
    const restored = await loadImportedFiles();
    expect(restored).toHaveLength(1);

    // 模拟写入被打断:meta 有记录但内容缺失
    const database = await openDatabase(
      DB_NAME,
      DB_VERSION,
      "contents",
      "path"
    );
    const transaction = database.transaction("contents", "readwrite");
    transaction.objectStore("contents").clear();
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    await expect(loadImportedFiles()).resolves.toEqual([]);
  });

  it("rejects a cache whose generation does not match its contents", async () => {
    // 同路径重导入后内容已换成新 generation、meta 仍是旧 generation:
    // 这是刷新落在"内容已清写、meta 未发布"之间的状态,必须视同未缓存
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);

    const database = await openDatabase(DB_NAME, DB_VERSION, "meta", "path", [
      { name: "contents", keyPath: "path" },
    ]);
    const tx = database.transaction(["meta", "contents"], "readwrite");
    const metas = await new Promise<Array<{ path: string }>>((res, rej) => {
      const req = tx.objectStore("meta").getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    tx.objectStore("contents").clear();
    for (const meta of metas) {
      tx.objectStore("contents").put({
        path: `generation-2/${meta.path}`,
        data: new ArrayBuffer(8),
      });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    database.close();

    await expect(loadImportedFiles()).resolves.toEqual([]);
  });

  it("serves header reads from metadata without hydrating contents", async () => {
    const payload = new Uint8Array(1024);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored).toHaveLength(1);

    // 清空 contents:头部区间读仍可用,完整读取才报缺内容
    await disposeContentsConnectionForTests();
    const database = await openDatabase(
      DB_NAME,
      DB_VERSION,
      "contents",
      "path"
    );
    const transaction = database.transaction("contents", "readwrite");
    transaction.objectStore("contents").clear();
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    const header = await restored[0].read(0, 512);
    expect(header.byteLength).toBe(512);
    expect(new Uint8Array(header)).toEqual(payload.slice(0, 512));
    await expect(restored[0].read()).rejects.toThrow("缓存中缺少文件内容");
  });

  it("drops the legacy v1 files store when upgrading", async () => {
    // 前面的用例已把同名库升到 v2;清掉重来以模拟真实的 v1 升级路径
    await disposeContentsConnectionForTests();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
    });

    // 模拟旧版(v1)缓存:单 files store 内嵌全部文件内容
    const legacy = await openDatabase(DB_NAME, 1, "files", "path");
    const legacyTx = legacy.transaction("files", "readwrite");
    legacyTx.objectStore("files").put({
      path: "legacy.edf",
      name: "legacy.edf",
      type: "",
      lastModified: 0,
      data: new ArrayBuffer(8),
    });
    await new Promise((resolve, reject) => {
      legacyTx.oncomplete = resolve;
      legacyTx.onerror = () => reject(legacyTx.error);
    });
    legacy.close();

    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);

    const database = await openDatabase(DB_NAME, DB_VERSION, "meta", "path", [
      { name: "contents", keyPath: "path" },
    ]);
    // objectStoreNames 按 IDB 规范以字母序返回
    expect([...database.objectStoreNames]).toEqual(["contents", "meta"]);
    database.close();
  });
});
