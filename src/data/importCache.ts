import type { ImportedFileRef } from "../types";
import { openDatabase, requestResult, transactionDone } from "./idb";

const DB_NAME = "ventilator-web-visualizer-import-cache";
const DB_VERSION = 2;
const META_STORE = "meta";
const CONTENT_STORE = "contents";

// 元数据(path/name/size/lastModified)与文件内容分库存储:
// 恢复路径只读 meta(getAll 为毫秒级),内容按需经 read() 从 contents 读取,
// 不再把整个数据集的字节往返 JS 堆。
//
// 为什么 contents 存 ArrayBuffer 而不是 File 对象:IDB 对 File/Blob 值只保存
// 源文件引用(实测 put 秒回、内容不在写入时复制),源盘/SD 卡移除后读回即报
// NotFoundError——缓存必须脱离源文件可用,因此内容以字节复制落库。
interface CachedFileMeta {
  path: string;
  name: string;
  size: number;
  lastModified: number;
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
    [{ name: CONTENT_STORE, keyPath: "path" }],
    ["files"]
  );
}

// 内容库连接常驻页面生命周期,供恢复后的 read() 按需取用
let contentsDatabasePromise: Promise<IDBDatabase> | null = null;

function getContentsDatabase() {
  contentsDatabasePromise ??= openImportDatabase();
  return contentsDatabasePromise;
}

/** 测试辅助:关闭常驻 contents 连接,便于测试中删除/重建同名数据库 */
export function disposeContentsConnectionForTests(): Promise<void> {
  const promise = contentsDatabasePromise;
  contentsDatabasePromise = null;
  return promise?.then((database) => database.close()) ?? Promise.resolve();
}

async function readFileContent(path: string): Promise<ArrayBuffer> {
  const database = await getContentsDatabase();
  const transaction = database.transaction(CONTENT_STORE, "readonly");
  const record = await requestResult<CachedFileContent | undefined>(
    transaction.objectStore(CONTENT_STORE).get(path)
  );
  await transactionDone(transaction);
  if (!record) {
    throw new Error(`缓存中缺少文件内容: ${path}`);
  }
  return record.data;
}

function makeCachedRef(meta: CachedFileMeta): ImportedFileRef {
  return {
    name: meta.name,
    path: meta.path,
    size: meta.size,
    lastModified: meta.lastModified,
    read: async (start = 0, end?: number) => {
      const buffer = await readFileContent(meta.path);
      return buffer.slice(start, end);
    },
  };
}

export async function saveImportedFiles(files: ImportedFileRef[]) {
  const database = await openImportDatabase();

  try {
    const BATCH_SIZE = 20;
    // 先分批写内容(首批 clear 旧内容),最后单事务写元数据:
    // 写入中途被刷新/关页打断时,meta 与 contents 不会混入半新半旧状态
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const contents: CachedFileContent[] = [];
      for (const fileRef of batch) {
        contents.push({
          path: fileRef.path || fileRef.name,
          data: await fileRef.read(),
        });
      }

      const transaction = database.transaction(CONTENT_STORE, "readwrite");
      const contentStore = transaction.objectStore(CONTENT_STORE);
      if (i === 0) contentStore.clear();
      for (const content of contents) {
        contentStore.put(content);
      }
      await transactionDone(transaction);
    }

    const metaTransaction = database.transaction(META_STORE, "readwrite");
    const metaStore = metaTransaction.objectStore(META_STORE);
    metaStore.clear();
    for (const fileRef of files) {
      metaStore.put({
        path: fileRef.path || fileRef.name,
        name: fileRef.name,
        size: fileRef.size,
        lastModified: fileRef.lastModified,
      });
    }
    await transactionDone(metaTransaction);
  } finally {
    database.close();
  }
}

export async function loadImportedFiles(): Promise<ImportedFileRef[]> {
  if (typeof indexedDB === "undefined") return [];

  const database = await openImportDatabase();

  try {
    const transaction = database.transaction(
      [META_STORE, CONTENT_STORE],
      "readonly"
    );
    const metas = await requestResult<CachedFileMeta[]>(
      transaction.objectStore(META_STORE).getAll()
    );
    // 只取键不取内容,用于校验缓存完整性(内容与元数据一一对应)
    const contentKeys = await requestResult<IDBValidKey[]>(
      transaction.objectStore(CONTENT_STORE).getAllKeys()
    );
    await transactionDone(transaction);

    // meta 有记录但内容缺失 = 上次写入被打断的残缺缓存,视同未缓存
    const available = new Set(contentKeys);
    if (!metas.every((meta) => available.has(meta.path))) return [];

    return metas.map(makeCachedRef);
  } finally {
    database.close();
  }
}
