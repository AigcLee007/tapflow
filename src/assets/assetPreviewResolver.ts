import { getAssetSignedUrls } from './assetApi';
import {
  getCachedAssetUrl,
  invalidateCachedAssetUrl,
  setCachedAssetUrl,
} from './assetUrlCache';

const MAX_BATCH_SIZE = 100;

type PendingEntry = {
  assetId: string;
  promise: Promise<string>;
  reject: (error: unknown) => void;
  resolve: (url: string) => void;
  variantKey: string;
};

const pendingByKey = new Map<string, PendingEntry>();
const queuedKeys = new Set<string>();
let flushScheduled = false;

function requestKey(assetId: string, variantKey: string): string {
  return `${assetId}:${variantKey}`;
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  Promise.resolve().then(() => {
    flushScheduled = false;
    return flushQueue();
  }).catch(() => undefined);
}

async function flushQueue(): Promise<void> {
  while (queuedKeys.size > 0) {
    const keys = Array.from(queuedKeys).slice(0, MAX_BATCH_SIZE);
    keys.forEach((key) => queuedKeys.delete(key));
    const entries = keys
      .map((key) => pendingByKey.get(key))
      .filter((entry): entry is PendingEntry => Boolean(entry));
    if (entries.length === 0) continue;

    try {
      await resolveBatch(entries);
    } catch (error) {
      entries.forEach((entry) => entry.reject(error));
      entries.forEach((entry) => pendingByKey.delete(requestKey(entry.assetId, entry.variantKey)));
    }
  }
}

async function resolveBatch(entries: PendingEntry[]): Promise<void> {
  const response = await getAssetSignedUrls(
    entries.map((entry) => ({
      assetId: entry.assetId,
      allowVariantFallback: true,
      variantKey: entry.variantKey as 'thumb' | 'preview',
    })),
  );
  const itemsByKey = new Map(response.items.map((item) => [requestKey(item.assetId, item.requestedVariantKey || item.variantKey || 'preview'), item]));
  const unavailable = new Set((response.errors || []).map((item) => item.assetId));

  entries.forEach((entry) => {
    const item = itemsByKey.get(requestKey(entry.assetId, entry.variantKey));
    if (!item?.url || !item.expiresAt) {
      entry.reject(new Error(unavailable.has(entry.assetId) ? 'Asset unavailable' : `Signed preview URL missing for asset ${entry.assetId}`));
      pendingByKey.delete(requestKey(entry.assetId, entry.variantKey));
      return;
    }

    setCachedAssetUrl({
      assetId: entry.assetId,
      expiresAt: item.expiresAt,
      url: item.url,
      variantKey: entry.variantKey,
    });
    entry.resolve(item.url);
    pendingByKey.delete(requestKey(entry.assetId, entry.variantKey));
  });
}

export function resolveAssetPreviewUrl(assetId: string, variantKey = 'preview'): Promise<string> {
  const normalizedAssetId = assetId.trim();
  const normalizedVariantKey = variantKey.trim() || 'preview';
  if (!normalizedAssetId) return Promise.reject(new Error('Asset ID is required'));

  const cached = getCachedAssetUrl(normalizedAssetId, normalizedVariantKey);
  if (cached) return Promise.resolve(cached);

  const key = requestKey(normalizedAssetId, normalizedVariantKey);
  const existing = pendingByKey.get(key);
  if (existing) return existing.promise;

  let resolvePromise!: (url: string) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  pendingByKey.set(key, {
    assetId: normalizedAssetId,
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
    variantKey: normalizedVariantKey,
  });
  queuedKeys.add(key);
  scheduleFlush();
  return promise;
}

export function invalidateAssetPreviewUrl(assetId: string, variantKey = 'preview'): void {
  const normalizedAssetId = assetId.trim();
  const normalizedVariantKey = variantKey.trim() || 'preview';
  if (!normalizedAssetId) return;
  invalidateCachedAssetUrl(normalizedAssetId, normalizedVariantKey);
}

export function refreshAssetPreviewUrl(assetId: string, variantKey = 'preview'): Promise<string> {
  invalidateAssetPreviewUrl(assetId, variantKey);
  return resolveAssetPreviewUrl(assetId, variantKey);
}

export function clearAssetPreviewResolver(): void {
  const error = new Error('Asset preview resolver was reset');
  pendingByKey.forEach((entry) => entry.reject(error));
  pendingByKey.clear();
  queuedKeys.clear();
  flushScheduled = false;
}
