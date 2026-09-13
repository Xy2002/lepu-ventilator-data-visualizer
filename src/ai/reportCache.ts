const DB_NAME = "ventilator-ai-report-cache";
const DB_VERSION = 1;
const STORE = "reports";

import { buildSystemPrompt } from "./dataSummary";

import { openDatabase, requestResult, transactionDone } from "../data/idb";

export interface CachedReport {
  key: string;
  date: string;
  content: string;
  createdAt: number;
  provider: string;
  model: string;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function reportCacheKey(
  date: string,
  provider: string,
  model: string,
  customPrompt: string
): string {
  const promptPart = customPrompt ? `_${simpleHash(customPrompt)}` : "";
  // 系统提示词(安全边界/免责声明)变化时使旧报告缓存失效
  const systemVersion = simpleHash(buildSystemPrompt());
  return `${date}_${provider}_${model}${promptPart}_sv${systemVersion}`;
}

export async function saveReport(report: CachedReport): Promise<void> {
  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "key");
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(report);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function loadReport(key: string): Promise<CachedReport | null> {
  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "key");
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const result = await requestResult<CachedReport | undefined>(
      store.get(key)
    );
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function clearReport(key: string): Promise<void> {
  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "key");
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(key);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function clearAllReports(): Promise<void> {
  const db = await openDatabase(DB_NAME, DB_VERSION, STORE, "key");
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    await transactionDone(tx);
  } finally {
    db.close();
  }
}
