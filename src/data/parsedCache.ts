import type { DatasetIndex, ImportedFileRef, ParsedVentilatorFile } from '../types';
import { inferDateFromPath } from './dataset';

const DB_NAME = 'ventilator-parsed-cache';
const DB_VERSION = 1;
const STORE = 'cache';

interface CacheManifest {
  id: 'manifest';
  files: Array<{ path: string; lastModified: number; size: number }>;
}

interface CacheMeta {
  id: 'meta';
  days: string[];
  dateRange: { start: string | null; end: string | null };
  summariesByDay: DatasetIndex['summariesByDay'];
  warnings: string[];
}

type TypedArrayValues = ParsedVentilatorFile['values'];

interface SerializedParsedFile {
  fileName: string;
  kind: ParsedVentilatorFile['kind'];
  header: ParsedVentilatorFile['header'];
  payloadBytes: number;
  valuesData: ArrayBuffer;
  valuesType: 'Uint8Array' | 'Uint16Array' | 'Int16Array';
  records: ParsedVentilatorFile['records'];
  warnings: string[];
}

interface CachedParsedDay {
  id: string;
  files: SerializedParsedFile[];
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open parsed cache'));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.oncomplete = () => resolve();
  });
}

function typedArrayType(values: TypedArrayValues): 'Uint8Array' | 'Uint16Array' | 'Int16Array' {
  if (values instanceof Int16Array) return 'Int16Array';
  if (values instanceof Uint16Array) return 'Uint16Array';
  return 'Uint8Array';
}

function bufferOf(values: TypedArrayValues): ArrayBuffer {
  return values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength) as ArrayBuffer;
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
    warnings: file.warnings,
  };
}

function makeTypedArray(type: string, buffer: ArrayBuffer): TypedArrayValues {
  if (type === 'Int16Array') return new Int16Array(buffer);
  if (type === 'Uint16Array') return new Uint16Array(buffer);
  return new Uint8Array(buffer);
}

function deserializeFile(sf: SerializedParsedFile): ParsedVentilatorFile {
  return {
    fileName: sf.fileName,
    kind: sf.kind,
    header: sf.header,
    payloadBytes: sf.payloadBytes,
    values: makeTypedArray(sf.valuesType, sf.valuesData),
    records: sf.records,
    rawPayload: new Uint8Array(0),
    warnings: sf.warnings,
  };
}

export function buildManifest(files: ImportedFileRef[]): CacheManifest['files'] {
  return files
    .map((f) => ({
      path: f.path || f.name,
      lastModified: f.file.lastModified,
      size: f.file.size,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function manifestMatches(
  cached: CacheManifest['files'],
  files: ImportedFileRef[],
): boolean {
  const current = buildManifest(files);
  if (cached.length !== current.length) return false;
  return cached.every(
    (entry, i) =>
      entry.path === current[i].path &&
      entry.lastModified === current[i].lastModified &&
      entry.size === current[i].size,
  );
}

export async function saveParsedDataset(
  files: ImportedFileRef[],
  index: DatasetIndex,
): Promise<void> {
  const db = await openDatabase();

  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();

    store.put({ id: 'manifest', files: buildManifest(files) });
    store.put({
      id: 'meta',
      days: index.days,
      dateRange: index.dateRange,
      summariesByDay: index.summariesByDay,
      warnings: index.warnings,
    });

    await transactionDone(tx);

    for (const day of index.days) {
      const serialized = index.parsedFilesByDay[day].map(serializeFile);
      const dayTx = db.transaction(STORE, 'readwrite');
      const dayStore = dayTx.objectStore(STORE);
      dayStore.put({ id: `parsed:${day}`, files: serialized });
      await transactionDone(dayTx);
    }
  } catch (err) {
    console.error('[parsedCache] saveParsedDataset failed:', err);
    throw err;
  } finally {
    db.close();
  }
}

export async function loadParsedDatasetDirect(): Promise<DatasetIndex | null> {
  if (typeof indexedDB === 'undefined') return null;

  const db = await openDatabase();

  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);

    const manifest = await requestResult<CacheManifest | undefined>(store.get('manifest'));
    if (!manifest || manifest.files.length === 0) return null;

    const meta = await requestResult<CacheMeta | undefined>(store.get('meta'));
    if (!meta) return null;

    const parsedFilesByDay: Record<string, ParsedVentilatorFile[]> = {};
    for (const day of meta.days) {
      const cached = await requestResult<CachedParsedDay | undefined>(
        store.get(`parsed:${day}`),
      );
      if (!cached) return null;
      parsedFilesByDay[day] = cached.files.map(deserializeFile);
    }

    await transactionDone(tx);

    return {
      days: meta.days,
      dateRange: meta.dateRange,
      filesByDay: {},
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

export async function loadParsedDataset(
  files: ImportedFileRef[],
): Promise<DatasetIndex | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (files.length === 0) return null;

  const db = await openDatabase();

  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);

    const manifest = await requestResult<CacheManifest | undefined>(store.get('manifest'));
    if (!manifest || !manifestMatches(manifest.files, files)) return null;

    const meta = await requestResult<CacheMeta | undefined>(store.get('meta'));
    if (!meta) return null;

    const parsedFilesByDay: Record<string, ParsedVentilatorFile[]> = {};
    for (const day of meta.days) {
      const cached = await requestResult<CachedParsedDay | undefined>(
        store.get(`parsed:${day}`),
      );
      if (!cached) return null;
      parsedFilesByDay[day] = cached.files.map(deserializeFile);
    }

    await transactionDone(tx);

    const filesByDay: Record<string, ImportedFileRef[]> = {};
    for (const fileRef of files) {
      const date = inferDateFromPath(fileRef.path || fileRef.name);
      if (!date) continue;
      filesByDay[date] ??= [];
      filesByDay[date].push(fileRef);
    }

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
