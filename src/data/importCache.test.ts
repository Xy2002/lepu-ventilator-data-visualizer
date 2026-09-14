import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ImportedFileRef } from "../types";
import { importedFileRefFromFile } from "./importedFile";
import {
  disposeContentsConnectionForTests,
  holdReaderGeneration,
  invalidateImportedFiles,
  loadImportedFiles,
  reclaimUnreferencedContents,
  resetReaderLockForTests,
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

    expect(restored.files).toHaveLength(2);
    expect(restored.generation).toEqual(expect.any(String));
    expect(restored.files[0].name).toBe("20260429_flow.edf");
    expect(restored.files[0].path).toBe("DATAFILE/20260429/20260429_flow.edf");
    expect(restored.files[0].size).toBe(1024);

    const buffer = await restored.files[0].read();
    expect(new Uint8Array(buffer)).toEqual(payload);

    // 索引阶段只读 512B 头部:区间读取返回精确切片
    const header = await restored.files[0].read(0, 512);
    expect(header.byteLength).toBe(512);
    expect(new Uint8Array(header)).toEqual(payload.slice(0, 512));

    const tail = await restored.files[0].read(1000);
    expect(tail.byteLength).toBe(24);
  });

  it("replaces the previous import instead of appending", async () => {
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);
    await saveImportedFiles([makeRef("b.edf", new Uint8Array([2]))]);

    const restored = await loadImportedFiles();
    expect(restored.files.map((ref) => ref.name)).toEqual(["b.edf"]);
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

    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
  });

  it("keeps the published generation's contents while caching a new import", async () => {
    // 其他标签页可能仍持有旧代际的引用并按需读取:
    // 新导入开始时不得清掉"已发布代际"的内容
    const payload = new Uint8Array(600);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

    // 新导入(不同文件)的写入在发布前被取代:旧代际内容必须仍然可读
    await saveImportedFiles(
      [makeRef("b.edf", new Uint8Array([9]))],
      () => true
    );

    expect(new Uint8Array(await restored.files[0].read())).toEqual(payload);
    // 被取代的写入未发布:缓存仍是原代际的单文件数据集
    await expect(loadImportedFiles()).resolves.toMatchObject({
      files: [expect.objectContaining({ name: "a.edf" })],
    });
  });

  it("keeps published contents readable even after meta invalidation", async () => {
    // App 作废 meta 后,其他标签页仍持有旧代际引用:
    // 发布代际存于 state store(不随 meta 一起消失),
    // 后续写入的清理不得删掉它们正要读取的内容
    const payload = new Uint8Array(600);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

    await invalidateImportedFiles();
    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });

    await saveImportedFiles(
      [makeRef("b.edf", new Uint8Array([9]))],
      () => true
    );
    expect(new Uint8Array(await restored.files[0].read())).toEqual(payload);
  });

  it("keeps generations held by active reader locks", async () => {
    // 旧标签页通过读者锁声明自己仍在使用某代际:
    // 新导入的清理必须保留它,即使它已不是"当前发布代际"
    const held = new Map<string, Promise<unknown>>();
    const fakeLocks = {
      // 兼容两种签名:写锁 request(name, task) / 读者锁 request(name, options, callback)
      request: (
        name: string,
        optionsOrTask: unknown,
        maybeCallback?: () => Promise<unknown>
      ) => {
        const task =
          typeof optionsOrTask === "function"
            ? (optionsOrTask as () => Promise<unknown>)
            : maybeCallback;
        if (!task) return Promise.resolve();
        const promise = task();
        if (name.startsWith("ventilator-import-cache-reader:")) {
          held.set(name, promise);
          promise.finally(() => held.delete(name)).catch(() => {});
        }
        return promise;
      },
      query: async () => ({
        held: [...held.keys()].map((name) => ({ name, mode: "shared" })),
        pending: [],
      }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      const payload = new Uint8Array(600);
      for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
      await saveImportedFiles([makeRef("a.edf", payload)]);
      const restored = await loadImportedFiles();
      holdReaderGeneration(restored.generation);
      expect(
        held.has(`ventilator-import-cache-reader:${restored.generation}`)
      ).toBe(true);

      // 两次后续写入:G2 发布、G3 写入被取代——G1 的读者锁让它幸存
      await saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]);
      await saveImportedFiles(
        [makeRef("c.edf", new Uint8Array([8]))],
        () => true
      );
      expect(new Uint8Array(await restored.files[0].read())).toEqual(payload);
      await expect(loadImportedFiles()).resolves.toMatchObject({
        files: [expect.objectContaining({ name: "b.edf" })],
      });
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("releases the previous reader generation when the tab switches", async () => {
    // 每个标签页同一时刻只持有一把读者锁:切换代际后旧锁释放,
    // 旧代际不再被 GC 无限保留(否则每次导入多留一份数据集)
    const held = new Map<string, Promise<unknown>>();
    const fakeLocks = {
      // 兼容两种签名:写锁 request(name, task) / 读者锁 request(name, options, callback)
      request: (
        name: string,
        optionsOrTask: unknown,
        maybeCallback?: () => Promise<unknown>
      ) => {
        const task =
          typeof optionsOrTask === "function"
            ? (optionsOrTask as () => Promise<unknown>)
            : maybeCallback;
        if (!task) return Promise.resolve();
        const promise = task();
        if (name.startsWith("ventilator-import-cache-reader:")) {
          held.set(name, promise);
          promise.finally(() => held.delete(name)).catch(() => {});
        }
        return promise;
      },
      query: async () => ({
        held: [...held.keys()].map((name) => ({ name, mode: "shared" })),
        pending: [],
      }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
      const restoredA = await loadImportedFiles();
      holdReaderGeneration(restoredA.generation);

      await saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]);
      const restoredB = await loadImportedFiles();
      holdReaderGeneration(restoredB.generation);
      await new Promise((r) => setTimeout(r, 0));
      expect([...held.keys()]).toEqual([
        `ventilator-import-cache-reader:${restoredB.generation}`,
      ]);

      // 旧代际失去读者:下一次写入的 GC 回收它;新代际仍受保护
      await saveImportedFiles([makeRef("c.edf", new Uint8Array([8]))]);
      await expect(restoredA.files[0].read()).rejects.toThrow(
        "缓存中缺少文件内容"
      );
      expect(new Uint8Array(await restoredB.files[0].read())).toEqual(
        new Uint8Array([9])
      );
    } finally {
      resetReaderLockForTests();
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("reclaims the superseded generation via reclaimUnreferencedContents", async () => {
    const held = new Map<string, Promise<unknown>>();
    const fakeLocks = {
      request: (
        name: string,
        optionsOrTask: unknown,
        maybeCallback?: () => Promise<unknown>
      ) => {
        const task =
          typeof optionsOrTask === "function"
            ? (optionsOrTask as () => Promise<unknown>)
            : maybeCallback;
        if (!task) return Promise.resolve();
        const promise = task();
        if (name.startsWith("ventilator-import-cache-reader:")) {
          held.set(name, promise);
          promise.finally(() => held.delete(name)).catch(() => {});
        }
        return promise;
      },
      query: async () => ({
        held: [...held.keys()].map((name) => ({ name, mode: "shared" })),
        pending: [],
      }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      // G1 缓存并切换读者锁到 G2(重导入场景):发布代际 + 活跃读者保留
      await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
      const restoredA = await loadImportedFiles();
      holdReaderGeneration(restoredA.generation);

      await saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]);
      const restoredB = await loadImportedFiles();
      holdReaderGeneration(restoredB.generation);
      await new Promise((r) => setTimeout(r, 0));

      // 无需等到下一次写入:发布后立即回收被取代的代际
      await reclaimUnreferencedContents();
      await expect(restoredA.files[0].read()).rejects.toThrow(
        "缓存中缺少文件内容"
      );
      expect(new Uint8Array(await restoredB.files[0].read())).toEqual(
        new Uint8Array([9])
      );
    } finally {
      resetReaderLockForTests();
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("treats a torn cache (meta without contents) as absent", async () => {
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

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

    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
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

    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
  });

  it("serves header reads from metadata without hydrating contents", async () => {
    const payload = new Uint8Array(1024);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

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

    const header = await restored.files[0].read(0, 512);
    expect(header.byteLength).toBe(512);
    expect(new Uint8Array(header)).toEqual(payload.slice(0, 512));
    await expect(restored.files[0].read()).rejects.toThrow(
      "缓存中缺少文件内容"
    );
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
    expect([...database.objectStoreNames]).toEqual([
      "contents",
      "meta",
      "state",
    ]);
    database.close();
  });
});
