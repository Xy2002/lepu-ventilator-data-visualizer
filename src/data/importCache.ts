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
  contentsDatabasePromise ??= openImportDatabase().then((database) => {
    database.onversionchange = () => {
      contentsDatabasePromise = null;
      database.close();
    };
    return database;
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

/** 释放本标签页当前的读者锁(如恢复被取代后不再引用该代际) */
export function releaseReaderGeneration(): void {
  activeReaderLock?.release();
  activeReaderLock = null;
}

export function holdReaderGeneration(generation: string | null): void {
  if (
    !generation ||
    typeof navigator === "undefined" ||
    !navigator.locks?.request
  )
    return;
  if (activeReaderLock?.generation === generation) return;

  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = activeReaderLock;
  navigator.locks
    .request(
      `${READER_LOCK_PREFIX}${generation}`,
      { mode: "shared" },
      () => released
    )
    .then(() => {
      // 锁因释放而结束时清理本标签页的记录(而非被切换走)
      if (activeReaderLock?.generation === generation) activeReaderLock = null;
    })
    .catch(() => {
      /* 持锁失败仅影响旧代际保留策略,不影响功能 */
    });
  activeReaderLock = { generation, release: release! };
  previous?.release();
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

async function withCacheWriteLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return task();
  return navigator.locks.request(CACHE_WRITE_LOCK, task) as Promise<T>;
}

export async function saveImportedFiles(
  files: ImportedFileRef[],
  shouldAbort?: () => boolean
): Promise<string | null> {
  return withCacheWriteLock(async () => {
    const database = await openImportDatabase();

    try {
      // 保留已发布代际与所有活跃读者代际的内容(其他标签页可能正要惰性读取),
      // 只清理无人引用的遗留代际;新代际写入后由下一次保存清理本代际
      const publishedGeneration = await readPublishedGeneration(database);
      const keepGenerations = await activeReaderGenerations();
      if (publishedGeneration) keepGenerations.add(publishedGeneration);
      await deleteContentGenerationsExcept(database, keepGenerations);

      // 捕获作废纪元:其他标签页的免锁作废会使纪元推进,
      // 发布事务内复查不一致即中止(跨标签页版的 shouldAbort)
      const startEpoch = await readEpoch(database);
      const generation = newCacheGeneration();
      const BATCH_SIZE = 20;
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
      return generation;
    } finally {
      database.close();
    }
  });
}

// 作废当前缓存:单事务清空 meta 并推进作废纪元,原子且与保存发布的任何
// 交错都一致——发布先提交则缓存整体可见后被作废;作废先提交则纪元已变,
// 在途保存的发布事务会复查失败而中止,不会把被取代的旧数据集重新发布。
// 因此不取全局写锁——另一标签页正在做长时间拷贝时,本地导入不必等它。
// 已发布代际记录保留在 state store,供旧标签页的内容读取继续使用,
// 内容由下一次保存的清理回收
export async function invalidateImportedFiles(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const database = await openImportDatabase();
  try {
    const transaction = database.transaction(
      [META_STORE, STATE_STORE],
      "readwrite"
    );
    const stateStore = transaction.objectStore(STATE_STORE);
    transaction.objectStore(META_STORE).clear();
    const currentEpoch = await new Promise<number>((resolve, reject) => {
      const request = stateStore.get("epoch");
      request.onsuccess = () =>
        resolve((request.result as EpochRecord | undefined)?.value ?? 0);
      request.onerror = () => reject(request.error);
    });
    stateStore.put({ id: "epoch", value: currentEpoch + 1 });
    await transactionDone(transaction);
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

  try {
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
      return { files: [], generation };
    }

    return { files: metas.map(makeCachedRef), generation };
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
      const publishedGeneration = await readPublishedGeneration(database);
      const keepGenerations = await activeReaderGenerations();
      if (publishedGeneration) keepGenerations.add(publishedGeneration);
      await deleteContentGenerationsExcept(database, keepGenerations);
    } finally {
      database.close();
    }
  });
}
