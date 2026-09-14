import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportedFileRef } from "../types";
import { importedFileRefFromFile } from "./importedFile";
import {
  disposeContentsConnectionForTests,
  holdReaderGeneration,
  invalidateImportedFiles,
  loadImportedFiles,
  readImportEpoch,
  reclaimUnreferencedContents,
  releaseReaderGeneration,
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

interface FakeLocks {
  request: (
    name: string,
    optionsOrTask: unknown,
    maybeCallback?: () => Promise<unknown>
  ) => Promise<unknown>;
  query: () => Promise<{
    held: Array<{ name: string; mode: string }>;
    pending: never[];
  }>;
}

/** 模拟 Web Locks:写锁立即执行任务,读者锁记录持有并在释放时移除 */
function readerLockFake(held: Map<string, Promise<unknown>>): FakeLocks {
  return {
    request: (name, optionsOrTask, maybeCallback) => {
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
}

function installReaderLockFake(held: Map<string, Promise<unknown>>) {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: readerLockFake(held),
  });
}

function removeLockFake() {
  delete (navigator as unknown as { locks?: unknown }).locks;
}

describe("importCache", () => {
  afterEach(() => {
    // loadImportedFiles 会自动钉住快照代际,防止跨用例泄漏读者锁
    releaseReaderGeneration();
  });

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

  it("keeps reader-pinned contents while caching a new import", async () => {
    // 其他标签页通过读者锁钉住旧代际的引用并按需读取:
    // 新导入开始时不得清掉被钉住代际的内容
    const payload = new Uint8Array(600);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

    const held = new Map<string, Promise<unknown>>();
    installReaderLockFake(held);

    try {
      await holdReaderGeneration(restored.generation);

      // 新导入(不同文件)的写入在发布前被取代:钉住代际内容必须仍然可读
      await saveImportedFiles(
        [makeRef("b.edf", new Uint8Array([9]))],
        () => true
      );

      expect(new Uint8Array(await restored.files[0].read())).toEqual(payload);
      // 被取代的写入未发布:缓存仍是原代际的单文件数据集
      await expect(loadImportedFiles()).resolves.toMatchObject({
        files: [expect.objectContaining({ name: "a.edf" })],
      });
    } finally {
      releaseReaderGeneration();
      removeLockFake();
    }
  });

  it("keeps published contents readable even after meta invalidation", async () => {
    // App 作废 meta 后,本标签页仍钉住快照代际的读者锁:
    // 后续写入的清理必须保留读者钉住的代际,它们正要惰性读取
    const payload = new Uint8Array(600);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    await saveImportedFiles([makeRef("a.edf", payload)]);
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);

    const held = new Map<string, Promise<unknown>>();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: readerLockFake(held),
    });

    try {
      await holdReaderGeneration(restored.generation);
      expect(held.size).toBe(1);

      await invalidateImportedFiles();
      // 作废后快照为空:自动钉住对已持有的同一代际幂等,不得释放重建
      await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
      expect(held.size).toBe(1);

      await saveImportedFiles(
        [makeRef("b.edf", new Uint8Array([9]))],
        () => true
      );
      expect(new Uint8Array(await restored.files[0].read())).toEqual(payload);
    } finally {
      releaseReaderGeneration();
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("discards the unreferenced published generation before copying", async () => {
    // 无读者锁钉住的已发布代际在替换写入前即可删除:
    // 否则替换导入要求设备装得下两份完整数据集,配额小的设备写入必败。
    // 代价是拷贝期间刷新会看到"缓存缺失"(meta 有、内容无 → 视同未缓存)
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
    const restoredA = await loadImportedFiles();

    // 真实流程:导入安装源引用数据集时会释放旧代际的读者锁
    releaseReaderGeneration();

    const generation = await saveImportedFiles([
      makeRef("b.edf", new Uint8Array([9])),
    ]);
    expect(generation).toEqual(expect.any(String));
    await expect(restoredA.files[0].read()).rejects.toThrow(
      "缓存中缺少文件内容"
    );

    // 新代际发布且旧代际已回收
    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);
    expect(restored.files[0].name).toBe("b.edf");
  });

  it("does not pin a generation for an empty snapshot", async () => {
    // meta 被其他标签页作废后,快照为空但发布记录仍在:
    // 恢复会空手返回,此时钉住旧代际只会让替换写入多保留一整份数据
    const held = new Map<string, Promise<unknown>>();
    installReaderLockFake(held);

    try {
      await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
      await invalidateImportedFiles();

      await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
      expect(held.size).toBe(0);
    } finally {
      removeLockFake();
    }
  });

  it("reclaims partial contents when a copy fails mid-way", async () => {
    // 第 1 批提交后源读取失败(如数据源拔除):
    // 未发布的半成品代际必须立即回收,不能一直占用配额
    const files = Array.from({ length: 21 }, (_, i) =>
      makeRef(`f${i}.edf`, new Uint8Array([i]))
    );
    files[20] = {
      name: "f20.edf",
      path: "DATAFILE/20260429/f20.edf",
      size: 3,
      lastModified: 0,
      read: () => Promise.reject(new Error("media removed")),
    };

    await expect(saveImportedFiles(files)).rejects.toThrow("media removed");

    const database = await openDatabase(
      DB_NAME,
      DB_VERSION,
      "contents",
      "path"
    );
    const count = await new Promise<number>((resolve, reject) => {
      const tx = database.transaction("contents", "readonly");
      const req = tx.objectStore("contents").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    database.close();
    expect(count).toBe(0);
  });

  it("reclaims partial contents when superseded after a committed batch", async () => {
    // 被(可能随后关闭的)其他标签页取代而中止的写入,
    // 已提交批次的内容记录同样要回收
    let calls = 0;
    const files = Array.from({ length: 21 }, (_, i) =>
      makeRef(`f${i}.edf`, new Uint8Array([i]))
    );

    await saveImportedFiles(files, () => {
      calls += 1;
      return calls > 1; // 第 1 批提交后、第 2 批开始前被取代
    });

    const database = await openDatabase(
      DB_NAME,
      DB_VERSION,
      "contents",
      "path"
    );
    const count = await new Promise<number>((resolve, reject) => {
      const tx = database.transaction("contents", "readonly");
      const req = tx.objectStore("contents").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    database.close();
    expect(count).toBe(0);
  });

  it("settles pin acquisition when the lock request rejects", async () => {
    // locks.request 被拒绝(文档失活等)时回调不会执行:
    // acquired 必须落地,否则 loadImportedFiles 会永久挂起并卡住 GC 协调锁
    const rejectingLocks = {
      request: (
        name: string,
        optionsOrTask: unknown,
        maybeCallback?: () => Promise<unknown>
      ) => {
        const task =
          typeof optionsOrTask === "function"
            ? (optionsOrTask as () => Promise<unknown>)
            : maybeCallback;
        if (name.startsWith("ventilator-import-cache-reader:")) {
          return Promise.reject(new Error("document inactive"));
        }
        return task ? task() : Promise.resolve();
      },
      query: async () => ({ held: [], pending: [] }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: rejectingLocks,
    });

    try {
      await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);

      // 恢复路径(持 GC 协调锁中)钉住失败也必须正常返回
      const restored = await loadImportedFiles();
      expect(restored.files).toHaveLength(1);
      await expect(
        holdReaderGeneration(restored.generation)
      ).resolves.toBeUndefined();
    } finally {
      removeLockFake();
    }
  });

  it("aborts a save whose baseline epoch predates an invalidation", async () => {
    // 基线纪元在作废时绑定:保存回调迟到执行时,
    // 中间发生的其他标签页作废必须使发布中止,而不是被算进基线
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
    const baseline = await readImportEpoch();

    await invalidateImportedFiles(); // 另一标签页的作废推进纪元

    await expect(
      saveImportedFiles(
        [makeRef("b.edf", new Uint8Array([9]))],
        undefined,
        baseline
      )
    ).resolves.toBeNull();
    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
  });

  it("does not run the destructive cleanup for a stale queued save", async () => {
    // 旧基线的排队写入进锁后,若更新的导入已发布而其交接尚未钉住:
    // 清理前必须先复查纪元并放弃,否则会删掉新发布代际的内容,
    // 留下 meta 指向已删内容、显然成功的缓存无法恢复
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);
    const staleBaseline = await readImportEpoch();

    await invalidateImportedFiles(); // 标签页 B 的新导入作废(纪元推进)
    await saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]); // B 发布 G_B

    // 标签页 A 的旧写入进锁:须在清理前放弃,B 的内容必须完好
    await expect(
      saveImportedFiles(
        [makeRef("c.edf", new Uint8Array([8]))],
        undefined,
        staleBaseline
      )
    ).resolves.toBeNull();

    const restored = await loadImportedFiles();
    expect(restored.files).toHaveLength(1);
    expect(new Uint8Array(await restored.files[0].read())).toEqual(
      new Uint8Array([9])
    );
  });

  it("invalidates without waiting for another tab's write lock", async () => {
    // 另一标签页的长时间拷贝持有全局写锁时,
    // 本地导入的作废(单事务清 meta)不应被阻塞
    // 种子缓存先完成(此时还未装 fake)
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);

    let releaseWriteLock: (() => void) | undefined;
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
        if (name === "ventilator-import-cache-write") {
          return new Promise((resolve) => {
            releaseWriteLock = () => resolve(task());
          });
        }
        return task();
      },
      query: async () => ({ held: [], pending: [] }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      const invalidated = invalidateImportedFiles();
      const loser = Promise.race([
        invalidated.then(() => "invalidated"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 200)),
      ]);
      await expect(loser).resolves.toBe("invalidated");

      releaseWriteLock?.();
      await invalidated;
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("aborts a queued writer superseded by an invalidation while it waited", async () => {
    // 纪元必须在排队等写锁之前捕获:排在长拷贝后面的写入,
    // 若等待期间发生免锁作废(更新的导入),进锁后的发布必须中止,
    // 否则排队更久的新导入刷新时会恢复出旧数据集
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);

    let writeRunning = false;
    const writeQueue: Array<() => void> = [];
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
        if (name === "ventilator-import-cache-write") {
          return new Promise((resolve, reject) => {
            const run = () =>
              Promise.resolve()
                .then(task)
                .then(resolve, reject)
                .finally(() => {
                  writeRunning = false;
                  const next = writeQueue.shift();
                  if (next) next();
                });
            if (writeRunning) {
              writeQueue.push(run);
            } else {
              writeRunning = true;
              run();
            }
          });
        }
        return task();
      },
      query: async () => ({ held: [], pending: [] }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      // 占住写锁,模拟另一标签页的长拷贝(可控制释放)
      let releaseOccupier: (() => void) | undefined;
      const occupierDone = new Promise<void>((resolve) => {
        releaseOccupier = resolve;
      });
      void navigator.locks!.request(
        "ventilator-import-cache-write",
        () => occupierDone
      );

      // A 的保存:进锁前捕获纪元,随后排队
      const saving = saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]);
      await new Promise((r) => setTimeout(r, 20));

      await invalidateImportedFiles(); // B 的作废:纪元推进

      releaseOccupier?.(); // 长拷贝结束,A 进锁
      await expect(saving).resolves.toBeNull(); // 发布因纪元中止
      await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
    } finally {
      removeLockFake();
    }
  });

  it("serializes cache validation with an in-flight content cleanup", async () => {
    // GC 持协调锁期间,加载校验必须排队等它完成:
    // 否则校验可能在删除前通过、随后内容被删,恢复带着悬空引用继续
    await saveImportedFiles([makeRef("a.edf", new Uint8Array([1, 2, 3]))]);

    let gcTaskStarted = false;
    // 模拟 Web Locks 的排队授予:第一个 gc 任务挂起直到 openGcGate,
    // 完成后按序授予队列中的后续请求(模拟真实锁语义)
    const gcQueue: Array<() => void> = [];
    let gated = false;
    let gcRunning = false;
    let openGcGate = () => {};
    let gcGate = new Promise<void>((r) => {
      openGcGate = r;
    });
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
        if (name === "ventilator-import-cache-gc") {
          gcTaskStarted = true;
          return new Promise((resolve, reject) => {
            const runTask = () =>
              Promise.resolve()
                .then(task)
                .then(resolve, reject)
                .finally(() => {
                  gcRunning = false;
                  const next = gcQueue.shift();
                  if (next) next();
                });
            if (gcRunning) {
              gcQueue.push(runTask);
              return;
            }
            gcRunning = true;
            if (!gated) {
              gated = true;
              gcQueue.unshift(() => gcGate.then(runTask));
            } else {
              gcQueue.push(runTask);
            }
            const start = gcQueue.shift();
            if (start) start();
          });
        }
        return task();
      },
      query: async () => ({ held: [], pending: [] }),
    };
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: fakeLocks,
    });

    try {
      await invalidateImportedFiles(); // epoch+meta 清空;a.edf 不再被引用

      const reclaiming = reclaimUnreferencedContents();
      await vi.waitFor(() => expect(gcTaskStarted).toBe(true));

      const loading = loadImportedFiles();
      let settled = false;
      void loading.then(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(settled).toBe(false); // 仍被协调锁挡住

      openGcGate();
      await reclaiming;
      // 排队等到删除完成后才校验:看到的是删除后的空缓存
      await expect(loading).resolves.toMatchObject({ files: [] });
    } finally {
      openGcGate();
      removeLockFake();
    }
  });

  it("aborts an in-flight writer superseded by a concurrent invalidation", async () => {
    // 标签页 A 拷贝中、标签页 B 免锁作废:A 的发布事务必须因纪元推进而中止,
    // 否则 A 会把被取代的旧数据集重新发布,B 刷新时恢复出错误数据
    let resolveRead: (() => void) | undefined;
    const payload = new Uint8Array(600);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    const slowRef: ImportedFileRef = {
      name: "a.edf",
      path: "DATAFILE/20260429/a.edf",
      size: payload.byteLength,
      lastModified: 0,
      read: () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveRead = () => resolve(payload.slice().buffer as ArrayBuffer);
        }),
    };

    const saving = saveImportedFiles([slowRef]);
    await vi.waitFor(() => expect(resolveRead).toBeDefined());
    await invalidateImportedFiles();

    resolveRead?.();
    await expect(saving).resolves.toBeNull();
    await expect(loadImportedFiles()).resolves.toMatchObject({ files: [] });
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
      await holdReaderGeneration(restored.generation);
      expect(
        held.has(`ventilator-import-cache-reader:${restored.generation}`)
      ).toBe(true);

      // G2 发布、G3 写入被取代(进锁后即中止,不执行任何清理)——
      // 被读者锁钉住的 G1 与未引用的 G2 都完好
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
      releaseReaderGeneration();
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it("releases only the expected generation when asked", async () => {
    // 过时的恢复放弃时只释放自己钉住的代际:
    // 若当前锁已被交接换成新代际,不能误放导致展示中的引用失去保护
    const held = new Map<string, Promise<unknown>>();
    installReaderLockFake(held);

    try {
      await saveImportedFiles([makeRef("a.edf", new Uint8Array([1]))]);
      const restoredA = await loadImportedFiles();
      await holdReaderGeneration(restoredA.generation);

      await saveImportedFiles([makeRef("b.edf", new Uint8Array([9]))]);
      const restoredB = await loadImportedFiles();
      await holdReaderGeneration(restoredB.generation);

      // 旧代际的迟到放弃:期望代际不匹配,当前锁(G2)不受影响
      releaseReaderGeneration(restoredA.generation);
      expect(
        held.has(`ventilator-import-cache-reader:${restoredB.generation}`)
      ).toBe(true);

      // 期望代际匹配才释放(释放经微任务生效)
      releaseReaderGeneration(restoredB.generation);
      await new Promise((r) => setTimeout(r, 0));
      expect(
        held.has(`ventilator-import-cache-reader:${restoredB.generation}`)
      ).toBe(false);
    } finally {
      releaseReaderGeneration();
      removeLockFake();
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
      releaseReaderGeneration();
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
