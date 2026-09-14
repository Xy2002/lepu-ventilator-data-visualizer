import type { ImportedFileRef } from "../types";
import { HEADER_BYTES } from "../parser/edfParser";
import { openDatabase, requestResult, transactionDone } from "./idb";

const DB_NAME = "ventilator-web-visualizer-import-cache";
const DB_VERSION = 2;
const META_STORE = "meta";
const CONTENT_STORE = "contents";
const STATE_STORE = "state";

// 元数据(path/name/size/lastModified/512B 头部)与文件内容分库存储:
// 恢复路径只读 meta(getAll 为毫秒级),内容按需经 read() 从 contents 读取,
// 不再把整个数据集的字节往返 JS 堆。头部随 meta 落库,使索引重建
// (PARSER_VERSION 变更后的回退路径)只读头部即可,不必搬运完整内容。
//
// contents 的键带 cache generation 前缀,meta 记录携带自己的 contentKey:
// 重新导入同路径文件时,刷新若落在"内容已清写、meta 未发布"之间,
// 键的 generation 不匹配,残缺缓存视同未缓存,不会出现旧 meta 配新字节。
//
// 为什么 contents 存 ArrayBuffer 而不是 File 对象:IDB 对 File/Blob 值只保存
// 源文件引用(实测 put 秒回、内容不在写入时复制),源盘/SD 卡移除后读回即报
// NotFoundError——缓存必须脱离源文件可用,因此内容以字节复制落库。
interface CachedFileMeta {
  path: string;
  name: string;
  size: number;
  lastModified: number;
  headerRaw: ArrayBuffer;
  contentKey: string;
}

interface CachedFileContent {
  path: string;
  data: ArrayBuffer;
}

function openImportDatabase() {
  // v1 的 files store 把全部文件内容存在单条记录里;升级即删除,
  // 由 meta+contents 分库接管(旧缓存不可增量迁移,需重新导入一次)
  return openDatabase(
    DB_NAME,
    DB_VERSION,
    META_STORE,
    "path",
    [
      { name: CONTENT_STORE, keyPath: "path" },
      { name: STATE_STORE, keyPath: "id" },
    ],
    ["files"]
  );
}

// 内容库连接常驻页面生命周期,供恢复后的 read() 按需取用。
// 旧标签页持有连接会阻塞未来 DB_VERSION 的升级事务,版本变化时立即让路
let contentsDatabasePromise: Promise<IDBDatabase> | null = null;

function getContentsDatabase() {
  contentsDatabasePromise ??= openImportDatabase()
    .then((database) => {
      database.onversionchange = () => {
        contentsDatabasePromise = null;
        database.close();
      };
      return database;
    })
    .catch((err) => {
      // 打开失败(瞬时不可用等)不得把被拒绝的 promise 留在单例里:
      // 否则本页后续所有惰性读取都会立即复用该失败,重试/重导入也无法恢复
      contentsDatabasePromise = null;
      throw err;
    });
  return contentsDatabasePromise;
}

/** 测试辅助:关闭常驻 contents 连接,便于测试中删除/重建同名数据库 */
export function disposeContentsConnectionForTests(): Promise<void> {
  const promise = contentsDatabasePromise;
  contentsDatabasePromise = null;
  return promise?.then((database) => database.close()) ?? Promise.resolve();
}

async function readFileContent(contentKey: string): Promise<ArrayBuffer> {
  const database = await getContentsDatabase();
  const transaction = database.transaction(CONTENT_STORE, "readonly");
  const record = await requestResult<CachedFileContent | undefined>(
    transaction.objectStore(CONTENT_STORE).get(contentKey)
  );
  await transactionDone(transaction);
  if (!record) {
    throw new Error(`缓存中缺少文件内容: ${contentKey}`);
  }
  return record.data;
}

function makeCachedRef(meta: CachedFileMeta): ImportedFileRef {
  const headerByteLength = meta.headerRaw.byteLength;
  return {
    name: meta.name,
    path: meta.path,
    size: meta.size,
    lastModified: meta.lastModified,
    read: async (start = 0, end?: number) => {
      // 覆盖头部的区间读直接命中 meta,索引重建不搬运完整内容
      if (end !== undefined && end <= headerByteLength) {
        return meta.headerRaw.slice(start, end);
      }
      const buffer = await readFileContent(meta.contentKey);
      return buffer.slice(start, end);
    },
  };
}

function newCacheGeneration() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 读取已发布的 cache generation。发布信息存于独立的 state store:
// 新导入作废 meta 后、下一次发布前,其他标签页仍可能持有旧代际引用,
// 此时代际不能随 meta 一起消失,否则内容清理会删掉它们正要读取的记录
async function readPublishedGeneration(
  database: IDBDatabase
): Promise<string | null> {
  const transaction = database.transaction(STATE_STORE, "readonly");
  const state = await requestResult<
    { id: "published"; generation: string } | undefined
  >(transaction.objectStore(STATE_STORE).get("published"));
  await transactionDone(transaction);
  return state?.generation ?? null;
}

interface EpochRecord {
  id: "epoch";
  value: number;
}

async function readEpoch(database: IDBDatabase): Promise<number> {
  const transaction = database.transaction(STATE_STORE, "readonly");
  const state = await requestResult<EpochRecord | undefined>(
    transaction.objectStore(STATE_STORE).get("epoch")
  );
  await transactionDone(transaction);
  return state?.value ?? 0;
}

// 读者锁:标签页对正在使用的代际持有共享锁,页面关闭/崩溃时自动释放;
// 内容清理通过 locks.query() 收集所有活跃读者代际并保留它们。
// 每个标签页同一时刻只持有一把:切换代际时先注册新锁、再释放旧锁
// (重叠窗口内 GC 两把都保留,不会出现无锁间隙)
const READER_LOCK_PREFIX = "ventilator-import-cache-reader:";

interface ActiveReaderLock {
  generation: string;
  release: () => void;
}
let activeReaderLock: ActiveReaderLock | null = null;

/** 释放本标签页的读者锁;传入期望代际时仅在该代际仍是当前持有时释放 */
export function releaseReaderGeneration(
  expectedGeneration?: string | null
): void {
  if (
    expectedGeneration !== undefined &&
    activeReaderLock?.generation !== expectedGeneration
  )
    return;
  activeReaderLock?.release();
  activeReaderLock = null;
}

async function pinReaderGeneration(generation: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) return;
  // 幂等:重复钉住同一代际不得"先放旧锁再拿新锁"——
  // 中间空窗会让并发清理删掉仍被本标签页使用的内容
  if (activeReaderLock?.generation === generation) return;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 等待锁真正获取(回调被调用)后才算持有:
  // 免等即放旧锁会让清理在 query() 里看不到新代际而误删其内容
  let markAcquired: (() => void) | undefined;
  let markFailed: (() => void) | undefined;
  let acquireFailed = false;
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });
  const failed = new Promise<void>((resolve) => {
    markFailed = resolve;
  });
  const previous = activeReaderLock;
  navigator.locks
    .request(`${READER_LOCK_PREFIX}${generation}`, { mode: "shared" }, () => {
      markAcquired?.();
      return released;
    })
    .then(() => {
      // 锁因释放而结束时清理本标签页的记录(而非被切换走)
      if (activeReaderLock?.generation === generation) activeReaderLock = null;
    })
    .catch(() => {
      // 请求被拒绝(文档失活等)时回调不会执行:
      // 记录失败并落地等待,由下方传播给调用方
      acquireFailed = true;
      if (activeReaderLock?.generation === generation) activeReaderLock = null;
      markAcquired?.();
      markFailed?.();
    });
  activeReaderLock = { generation, release: release! };
  await Promise.race([acquired, failed]);
  if (acquireFailed) {
    // 不释放 previous:保留对旧代际的钉住,失败由调用方决定回退方式
    throw new Error("读者锁不可用");
  }
  previous?.release();
}

export async function holdReaderGeneration(
  generation: string | null
): Promise<void> {
  if (
    !generation ||
    typeof navigator === "undefined" ||
    !navigator.locks?.request
  )
    return;
  if (activeReaderLock?.generation === generation) return;

  await pinReaderGeneration(generation);
}

async function activeReaderGenerations(): Promise<Set<string>> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) {
    return new Set();
  }
  const snapshot = await navigator.locks.query().catch(() => ({ held: [] }));
  const generations = new Set<string>();
  for (const lock of snapshot.held ?? []) {
    const match = lock.name
      ? /^ventilator-import-cache-reader:(.+)$/.exec(lock.name)
      : null;
    if (match) generations.add(match[1]);
  }
  return generations;
}

/** 测试辅助:释放本标签页的读者锁(生产代码请用 releaseReaderGeneration) */
export function resetReaderLockForTests(): void {
  releaseReaderGeneration();
}

// 清理内容记录:保留当前已发布代际与所有仍被活跃标签页引用的代际
// (读者锁不可用时空集合,退化为仅保留已发布代际),
// 其余更早的遗留代际(含写入中断的残骸)删除
async function deleteContentGenerationsExcept(
  database: IDBDatabase,
  keepGenerations: Set<string>
) {
  const transaction = database.transaction(CONTENT_STORE, "readwrite");
  const store = transaction.objectStore(CONTENT_STORE);
  const request = store.openKeyCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const key = String(cursor.key);
    const generation = key.slice(0, key.indexOf("/"));
    if (!keepGenerations.has(generation)) {
      store.delete(cursor.key);
    }
    cursor.continue();
  };
  await transactionDone(transaction);
}

// 跨标签页写锁:保存/作废全程互斥,防止一个标签页的代际清理删掉
// 另一个标签页仍在写入、尚未发布的代际(Web Locks 不可用时退化为单标签假设)
const CACHE_WRITE_LOCK = "ventilator-import-cache-write";

// 清理协调锁:串行化「GC 的读者查询+删除」与「加载的内容键校验」。
// 读者锁获取本身不需要它:恢复流程先获取读者锁、再在校验(持协调锁)中
// 复核内容仍在——B 的删除若发生在 A 获取锁之后,query 能看到 A 的锁;
// 若发生在校验之前,校验失败使恢复放弃。两条路径都不会留下悬空引用
const CACHE_GC_LOCK = "ventilator-import-cache-gc";

async function withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return task();
  return navigator.locks.request(name, task) as Promise<T>;
}

async function withCacheWriteLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock(CACHE_WRITE_LOCK, task);
}

async function withCacheGcLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock(CACHE_GC_LOCK, task);
}

async function readEpochStandalone(): Promise<number> {
  const database = await openImportDatabase();
  try {
    return await readEpoch(database);
  } finally {
    database.close();
  }
}

/** 当前作废纪元;导入在作废后立即捕获并传给保存作基线(见 saveImportedFiles) */
export async function readImportEpoch(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  return readEpochStandalone();
}

export async function saveImportedFiles(
  files: ImportedFileRef[],
  shouldAbort?: () => boolean,
  baselineEpoch?: number
): Promise<string | null> {
  // 纪元基线:调用方(导入流程)在作废后立即捕获并穿队列传入——
  // 保存回调可能经本地队列延迟到很久之后才执行,届时再捕获会把
  // 中间发生的其他标签页作废算进基线,被取代的旧数据集会"最后发布"。
  // 未传基线的调用方退回为进锁前捕获
  const startEpoch =
    baselineEpoch !== undefined ? baselineEpoch : await readEpochStandalone();

  return withCacheWriteLock(async () => {
    const database = await openImportDatabase();

    try {
      // 破坏性清理前复查纪元与中止状态:排队期间若已有更新的导入
      // 作废并发布(其交接尚未钉住新代际),清理会删掉新发布代际的内容、
      // 留下悬空 meta。此时直接放弃本次写入,清理交给持有新基线的一方
      if (shouldAbort?.()) return null;
      if ((await readEpoch(database)) !== startEpoch) return null;

      // 内容清理只保留活跃读者代际:无读者锁钉住的已发布代际一并删除,
      // 替换导入不再要求设备装得下两份完整数据集(见下方发布注释)。
      // 其他标签页持有的引用由读者锁保护,与发布代际无关。
      // 查询+删除在协调锁下进行,与加载校验互斥(见 CACHE_GC_LOCK 注释)
      await withCacheGcLock(async () => {
        const readers = await activeReaderGenerations();
        await deleteContentGenerationsExcept(database, readers);
      });

      const generation = newCacheGeneration();
      const BATCH_SIZE = 20;
      // published 标志统一覆盖所有未发布出口(被取代中止/纪元失配/异常):
      // 半成品代际的内容记录不回收会一直占用配额
      let published = false;
      try {
        // 内容先行写入,最后单事务写元数据发布:
        // 写入中途被刷新/关页打断时,meta 与 contents 不会混入半新半旧状态;
        // contentKey 的 generation 保证"同路径重导入"也不会张冠李戴。
        // shouldAbort 在每批之间与 meta 发布前复查:被更新导入取代的活跃写入
        // 必须让路,否则 UI 已显示新数据、刷新却会恢复旧数据集
        const metaRecords: CachedFileMeta[] = [];
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          if (shouldAbort?.()) return null;
          const batch = files.slice(i, i + BATCH_SIZE);
          const contents: CachedFileContent[] = [];
          for (const fileRef of batch) {
            const path = fileRef.path || fileRef.name;
            const data = await fileRef.read();
            contents.push({ path: `${generation}/${path}`, data });
            metaRecords.push({
              path,
              name: fileRef.name,
              size: fileRef.size,
              lastModified: fileRef.lastModified,
              headerRaw: data.slice(0, HEADER_BYTES),
              contentKey: `${generation}/${path}`,
            });
          }

          const transaction = database.transaction(CONTENT_STORE, "readwrite");
          const contentStore = transaction.objectStore(CONTENT_STORE);
          for (const content of contents) {
            contentStore.put(content);
          }
          await transactionDone(transaction);
        }

        if (shouldAbort?.()) return null;

        // 发布:meta、"已发布代际"与纪元复查同事务原子完成。
        // 事务与免锁作废由 IDB 串行化,任何顺序都一致:
        // 作废先提交 → 纪元已变,发布中止(meta 保持清空,缓存视同未缓存);
        // 发布先提交 → 缓存整体可见,随后的作废将其作废
        const metaTransaction = database.transaction(
          [META_STORE, STATE_STORE],
          "readwrite"
        );
        const metaStore = metaTransaction.objectStore(META_STORE);
        const stateStore = metaTransaction.objectStore(STATE_STORE);
        const publishEpoch = await new Promise<number>((resolve, reject) => {
          const request = stateStore.get("epoch");
          request.onsuccess = () =>
            resolve((request.result as EpochRecord | undefined)?.value ?? 0);
          request.onerror = () => reject(request.error);
        });
        if (publishEpoch !== startEpoch) return null;
        metaStore.clear();
        for (const meta of metaRecords) {
          metaStore.put(meta);
        }
        stateStore.put({ id: "published", generation });
        await transactionDone(metaTransaction);
        published = true;
        return generation;
      } finally {
        if (!published) {
          // 半成品代际回收:保留读者钉住的与当前发布的代际
          try {
            const publishedGeneration = await readPublishedGeneration(database);
            const keepGenerations = await activeReaderGenerations();
            if (publishedGeneration) keepGenerations.add(publishedGeneration);
            await deleteContentGenerationsExcept(database, keepGenerations);
          } catch {
            /* 回收失败只能等下一次写入的清理 */
          }
        }
      }
    } finally {
      database.close();
    }
  });
}

// 作废当前缓存:单事务清空 meta 并推进作废纪元,原子且与保存发布的任何
// 交错都一致——发布先提交则缓存整体可见后被作废;作废先提交则纪元已变,
// 在途保存的发布事务会复查失败而中止,不会把被取代的旧数据集重新发布。
// 因此不取全局写锁——另一标签页正在做长时间拷贝时,本地导入不必等它。
// 返回本事务设置的新纪元:导入以它绑定保存基线(必须用事务返回值,
// 事后再读一次会吸收排队期间其他标签页的作废)。已发布代际记录保留在
// state store,供旧标签页的内容读取继续使用,内容由下一次保存的清理回收
export async function invalidateImportedFiles(): Promise<number | null> {
  if (typeof indexedDB === "undefined") return null;

  const database = await openImportDatabase();
  try {
    const transaction = database.transaction(
      [META_STORE, STATE_STORE],
      "readwrite"
    );
    const stateStore = transaction.objectStore(STATE_STORE);
    transaction.objectStore(META_STORE).clear();
    const newEpoch = await new Promise<number>((resolve, reject) => {
      const request = stateStore.get("epoch");
      request.onsuccess = () => {
        const next =
          ((request.result as EpochRecord | undefined)?.value ?? 0) + 1;
        stateStore.put({ id: "epoch", value: next });
        resolve(next);
      };
      request.onerror = () => reject(request.error);
    });
    await transactionDone(transaction);
    return newEpoch;
  } finally {
    database.close();
  }
}

export interface ImportedFilesSnapshot {
  files: ImportedFileRef[];
  /** 恢复所处的导入代际:解析缓存以它绑定摘要与内容代际 */
  generation: string | null;
}

export async function loadImportedFiles(): Promise<ImportedFilesSnapshot> {
  if (typeof indexedDB === "undefined") {
    return { files: [], generation: null };
  }

  const database = await openImportDatabase();

  let snapshot: ImportedFilesSnapshot = { files: [], generation: null };

  try {
    // 校验在清理协调锁下进行:与 GC 的「读者查询+删除」互斥,
    // 防止校验通过后、读者锁获取生效前的删除留下悬空引用。
    // (恢复流程先获取读者锁再调用本函数;删除若发生在校验前,
    //  校验失败使恢复放弃,不会带着失效引用继续)
    await withCacheGcLock(async () => {
      const transaction = database.transaction(
        [META_STORE, CONTENT_STORE, STATE_STORE],
        "readonly"
      );
      const metas = await requestResult<CachedFileMeta[]>(
        transaction.objectStore(META_STORE).getAll()
      );
      // 只取键不取内容,用于校验缓存完整性(每条 meta 的 contentKey 都必须存在)
      const contentKeys = await requestResult<IDBValidKey[]>(
        transaction.objectStore(CONTENT_STORE).getAllKeys()
      );
      const published = await requestResult<
        { id: "published"; generation: string } | undefined
      >(transaction.objectStore(STATE_STORE).get("published"));
      await transactionDone(transaction);

      const generation = published?.generation ?? null;
      // meta 与 contents 不对应(写入被打断/代际不符)= 残缺缓存,视同未缓存
      const available = new Set(contentKeys);
      if (
        metas.length > 0 &&
        (generation === null ||
          !metas.every((meta) => available.has(meta.contentKey)))
      ) {
        snapshot = { files: [], generation };
        return;
      }

      // 校验通过且快照非空时,在同一协调锁内注册读者锁:
      // 若等调用方稍后再拿锁,GC 锁已释放,删除可以插进校验与获取之间,
      // 留下"已钉住但内容已删"的悬空快照。快照返回即已受保护。
      // 空快照(meta 被其他标签页作废)不钉住——恢复会空手返回,
      // 钉住只会让替换写入多保留一整份无人使用的数据。
      // 钉住失败时不暴露无保护的惰性引用:视同缓存缺失,恢复会放弃
      if (generation !== null && metas.length > 0) {
        try {
          await pinReaderGeneration(generation);
        } catch {
          snapshot = { files: [], generation };
          return;
        }
      }
      snapshot = { files: metas.map(makeCachedRef), generation };
    });
    return snapshot;
  } finally {
    database.close();
  }
}

/** 当前已发布的导入代际(无已发布缓存时为 null);解析缓存以它绑定代际 */
export async function readImportGeneration(): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;

  const database = await openImportDatabase();
  try {
    return await readPublishedGeneration(database);
  } finally {
    database.close();
  }
}

// 回收无人引用的内容代际:保留当前发布代际与活跃读者代际。
// 供调用方在切换读者锁之后调用——发布即被取代的代际立即回收,
// 而不是等下一次写入(否则稳态常驻两份完整数据集,配额小的设备放不下)
export async function reclaimUnreferencedContents(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  await withCacheWriteLock(async () => {
    const database = await openImportDatabase();
    try {
      // 查询+删除与加载校验共用协调锁(见 CACHE_GC_LOCK 注释)
      await withCacheGcLock(async () => {
        const publishedGeneration = await readPublishedGeneration(database);
        const keepGenerations = await activeReaderGenerations();
        if (publishedGeneration) keepGenerations.add(publishedGeneration);
        await deleteContentGenerationsExcept(database, keepGenerations);
      });
    } finally {
      database.close();
    }
  });
}
