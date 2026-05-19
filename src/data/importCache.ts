import type { ImportedFileRef } from '../types';

const DB_NAME = 'ventilator-web-visualizer-import-cache';
const DB_VERSION = 1;
const FILE_STORE = 'files';

interface CachedImportedFile {
  path: string;
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: 'path' });
      }
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open import cache'));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.oncomplete = () => resolve();
  });
}

async function toCachedFile(fileRef: ImportedFileRef): Promise<CachedImportedFile> {
  return {
    path: fileRef.path || fileRef.name,
    name: fileRef.name,
    type: fileRef.file.type,
    lastModified: fileRef.file.lastModified,
    data: await fileRef.file.arrayBuffer(),
  };
}

function fromCachedFile(cachedFile: CachedImportedFile): ImportedFileRef {
  return {
    name: cachedFile.name,
    path: cachedFile.path,
    file: new File([cachedFile.data], cachedFile.name, {
      type: cachedFile.type,
      lastModified: cachedFile.lastModified,
    }),
  };
}

export async function saveImportedFiles(files: ImportedFileRef[]) {
  const database = await openDatabase();

  try {
    const BATCH_SIZE = 20;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const cachedFiles = await Promise.all(batch.map(toCachedFile));

      const transaction = database.transaction(FILE_STORE, 'readwrite');
      const store = transaction.objectStore(FILE_STORE);
      if (i === 0) store.clear();

      for (const cachedFile of cachedFiles) {
        store.put(cachedFile);
      }

      await transactionDone(transaction);
    }
  } finally {
    database.close();
  }
}

export async function loadImportedFiles(): Promise<ImportedFileRef[]> {
  if (typeof indexedDB === 'undefined') return [];

  const database = await openDatabase();

  try {
    const transaction = database.transaction(FILE_STORE, 'readonly');
    const store = transaction.objectStore(FILE_STORE);
    const cachedFiles = await requestResult<CachedImportedFile[]>(store.getAll());
    await transactionDone(transaction);

    return cachedFiles.map(fromCachedFile);
  } finally {
    database.close();
  }
}
