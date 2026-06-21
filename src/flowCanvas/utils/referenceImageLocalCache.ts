const DB_NAME = "tapflow-reference-images";
const STORE_NAME = "previews";
const DB_VERSION = 1;

type ReferenceImageCacheRecord = {
  blob: Blob;
  cachedAt: number;
  expiresAt?: string | null;
  mimeType: string;
  referenceUploadId: string;
};

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "referenceUploadId" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open reference image cache"));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function cacheReferenceImagePreview(input: {
  blob: Blob;
  expiresAt?: string | null;
  mimeType?: string | null;
  referenceUploadId: string;
}): Promise<void> {
  if (!input.referenceUploadId || !canUseIndexedDb()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({
        blob: input.blob,
        cachedAt: Date.now(),
        expiresAt: input.expiresAt ?? null,
        mimeType: input.mimeType || input.blob.type || "image/png",
        referenceUploadId: input.referenceUploadId,
      } satisfies ReferenceImageCacheRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to cache reference image preview"));
    });
  } finally {
    db.close();
  }
}

export async function getCachedReferenceImageObjectUrl(referenceUploadId: string): Promise<string | null> {
  if (!referenceUploadId || !canUseIndexedDb()) return null;
  const db = await openDb();
  try {
    const record = await new Promise<ReferenceImageCacheRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(referenceUploadId);
      request.onsuccess = () => resolve(request.result as ReferenceImageCacheRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Failed to read reference image preview"));
    });
    if (!record?.blob) return null;
    return URL.createObjectURL(record.blob);
  } finally {
    db.close();
  }
}
