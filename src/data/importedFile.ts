import type { ImportedFileRef } from "../types";

// 旧浏览器兼容:Blob.arrayBuffer 不可用时退回 FileReader
async function readBlobPart(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsArrayBuffer(blob);
  });
}

/** 导入面板入口:把用户选择的真实 File 包装为惰性读取的 ImportedFileRef */
export function importedFileRefFromFile(
  file: File,
  path?: string
): ImportedFileRef {
  return {
    name: file.name,
    path: path || file.name,
    size: file.size,
    lastModified: file.lastModified,
    read: (start = 0, end?: number) =>
      readBlobPart(end === undefined ? file : file.slice(start, end)),
  };
}
