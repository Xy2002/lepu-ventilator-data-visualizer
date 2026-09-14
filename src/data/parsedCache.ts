import { openDatabase, requestResult, transactionDone } from "./idb";
import type {
  DatasetIndex,
  ImportedFileRef,
  ParsedVentilatorFile,
} from "../types";
import { groupImportedFilesByDay } from "./dataset";
import { readImportEpoch, readImportGeneration } from "./importCache";

const DB_NAME = "ventilator-parsed-cache";
const DB_VERSION = 1;
const STORE = "cache";

// 解析器输出语义变化(如标签路由调整)时递增:旧版本写入的缓存直接作废,
// 由调用方回退到从源文件重新解析。v2 = leak/csa 路由为 events16(issue #52)。
export const PARSER_VERSION = 2;

interface CacheManifest {
  id: "manifest";
  parserVersion: number;
  /** 摘要/头部所属的导入代际:与当前发布代际不符即作废,防止旧摘要配新内容 */
  importGeneration: string | null;
  files: Array<{ path: string; lastModified: number; size: number }>;
}

interface CacheMeta {
  id: "meta";
  days: string[];
  dateRange: { start: string | null; end: string | null };
  summariesByDay: DatasetIndex["summariesByDay"];
  warnings: string[];
}

type TypedArrayValues = ParsedVentilatorFile["values"];

interface SerializedParsedFile {
  fileName: string;
  kind: ParsedVentilatorFile["kind"];
  header: ParsedVentilatorFile["header"];
  payloadBytes: number;
  valuesData: ArrayBuffer;
  valuesType: "Uint8Array" | "Uint16Array" | "Int16Array";
  records: ParsedVentilatorFile["records"];
  rawPayloadData: ArrayBuffer;
  warnings: string[];
}

interface CachedParsedDay {
  id: string;
  files: SerializedParsedFile[];
}

function typedArrayType(
  values: TypedArrayValues
): "Uint8Array" | "Uint16Array" | "Int16Array" {
  if (values instanceof Int16Array) return "Int16Array";
  if (values instanceof Uint16Array) return "Uint16Array";
  return "Uint8Array";
}

function bufferOf(values: TypedArrayValues): ArrayBuffer {
  return values.buffer.slice(
    values.byteOffset,
    values.byteOffset + values.byteLength
  ) as ArrayBuffer;
}

function serializeFile(file: ParsedVentilatorFile): SerializedParsedFile {
  return {
    fileName: file.fileName,
    kind: file.kind,
    header: file.header,
    payloadBytes: file.payloadBytes,
    valuesData: bufferOf(file.values),
    valuesType: typedArrayType(file.values),
    records: file.records,
    rawPayloadData: bufferOf(file.rawPayload),
    warnings: file.warnings,
  };
}

function makeTypedArray(type: string, buffer: ArrayBuffer): TypedArrayValues {
  if (type === "Int16Array") return new Int16Array(buffer);
  if (type === "Uint16Array") return new Uint16Array(buffer);
  return new Uint8Array(buffer);
}

// 旧版缓存把波形 payload 全量写进了 IndexedDB；加载时归一化为 header-only，
// 让升级用户同样享受两阶段的内存收益（payload 仍可经 importCache 按需重解析）
const DEFERRED_PAYLOAD_KINDS = new Set([
  "waveform_u8",
  "waveform_u16le",
  "waveform_i16le",
  "triples_u16le",
  "raw",
]);

function deserializeFile(sf: SerializedParsedFile): ParsedVentilatorFile {
  if (DEFERRED_PAYLOAD_KINDS.has(sf.kind)) {
    return {
      fileName: sf.fileName,
      kind: sf.kind,
      header: sf.header,
      payloadBytes: sf.payloadBytes,
      values: new Uint8Array(),
      records: sf.records,
      rawPayload: new Uint8Array(),
      warnings: sf.warnings,
    };
  }
  return {
    fileName: sf.fileName,
    kind: sf.kind,
    header: sf.header,
    payloadBytes: sf.payloadBytes,
    values: makeTypedArray(sf.valuesType, sf.valuesData),
    records: sf.records,
    rawPayload: new Uint8Array(sf.rawPayloadData),
    warnings: sf.warnings,
  };
}

export function buildManifest(
  files: ImportedFileRef[]
): CacheManifest["files"] {
  return files
    .map((f) => ({
      path: f.path || f.name,
      lastModified: f.lastModified,
      size: f.size,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function manifestMatches(
  cached: CacheManifest["files"],
  files: ImportedFileRef[]
): boolean {
  const current = buildManifest(files);
  if (cached.length !== current.length) return false;
  return cached.every(
    (entry, i) =>
      entry.path === current[i].path &&
      entry.lastModified === current[i].lastModified &&
      entry.size === current[i].size
  );
}

export async function saveParsedDataset(
  files: ImportedFileRef[],
  index: DatasetIndex,
  importGeneration: string | null = null
): Promise<void> {
  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "id");

  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();

    store.put({
      id: "manifest",
      parserVersion: PARSER_VERSION,
      importGeneration,
      files: buildManifest(files),
    });
    store.put({
      id: "meta",
      days: index.days,
      dateRange: index.dateRange,
      summariesByDay: index.summariesByDay,
      warnings: index.warnings,
    });

    for (const day of index.days) {
      const serialized = index.parsedFilesByDay[day].map(serializeFile);
      store.put({ id: `parsed:${day}`, files: serialized });
    }

    await transactionDone(tx);
  } finally {
    db.close();
  }
}

// 新导入开始时作废旧解析结果:防止关闭发生在"导入缓存已发布、
// 解析缓存未更新"之间时,旧摘要/头部配上按需读取的新内容字节。
// baselineEpoch 绑定本次导入的作废纪元:已被更新的导入取代
// (纪元已推进)时跳过清空,保留他们的有效解析索引
export async function invalidateParsedDataset(
  baselineEpoch?: number | null
): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  // 纪元读取必须在打开事务之前(跨库 await 会使事务失活)
  const currentEpoch = baselineEpoch != null ? await readImportEpoch() : null;
  if (baselineEpoch != null && currentEpoch !== baselineEpoch) return;

  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "id");
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function loadParsedDataset(
  files: ImportedFileRef[]
): Promise<DatasetIndex | null> {
  if (typeof indexedDB === "undefined") return null;
  if (files.length === 0) return null;

  // 先读当前发布代际(跨库):不能在 parsed-cache 事务内 await 另一个库的
  // 读取,否则事务失活。顺序有竞态时只会误判为不匹配 → 回退重建,方向安全
  const currentGeneration = await readImportGeneration();

  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "id");

  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);

    const manifest = await requestResult<CacheManifest | undefined>(
      store.get("manifest")
    );
    if (
      !manifest ||
      manifest.parserVersion !== PARSER_VERSION ||
      !manifestMatches(manifest.files, files)
    )
      return null;

    // 摘要/头部必须属于当前已发布的导入代际:恢复路径的重建也可能与
    // 其他标签页的新导入交错,代际不符时宁可回退重建
    if ((manifest.importGeneration ?? null) !== currentGeneration) return null;

    const meta = await requestResult<CacheMeta | undefined>(store.get("meta"));
    if (!meta) return null;

    const parsedFilesByDay: Record<string, ParsedVentilatorFile[]> = {};
    for (const day of meta.days) {
      const cached = await requestResult<CachedParsedDay | undefined>(
        store.get(`parsed:${day}`)
      );
      if (!cached) return null;
      parsedFilesByDay[day] = cached.files.map(deserializeFile);
    }

    await transactionDone(tx);

    const filesByDay = groupImportedFilesByDay(files);

    return {
      days: meta.days,
      dateRange: meta.dateRange,
      filesByDay,
      summariesByDay: meta.summariesByDay,
      parsedFilesByDay,
      warnings: meta.warnings,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
