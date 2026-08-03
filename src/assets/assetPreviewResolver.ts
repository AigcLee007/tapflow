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
      await resolveBatch(entries, 'preview');
    } catch (previewError) {
      try {
        await resolveBatch(entries, null);
      } catch (originalError) {
        entries.forEach((entry) => entry.reject(originalError || previewError));
        entries.forEach((entry) => pendingByKey.delete(requestKey(entry.assetId, entry.variantKey)));
      }
    }
  }
}

async function resolveBatch(entries: PendingEntry[], variantKey: string | null): Promise<void> {
  const response = await getAssetSignedUrls(
    entries.map((entry) => ({
      assetId: entry.assetId,
      ...(variantKey ? { variantKey } : {}),
    })),
  );
  const itemsByAssetId = new Map(response.items.map((item) => [item.assetId, item]));

  entries.forEach((entry) => {
    const item = itemsByAssetId.get(entry.assetId);
    if (!item?.url || !item.expiresAt) {
      throw new Error(`Signed preview URL missing for asset ${entry.assetId}`);
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
