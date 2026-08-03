import type { AssetSignedUrl, AssetSignedVariantKey } from './assetApi';
import { getAssetSignedUrls } from './assetApi';
import {
  getCachedAssetUrl,
  invalidateCachedAssetUrl,
  setCachedAssetUrl,
} from './assetUrlCache';

const MAX_BATCH_SIZE = 100;
const SIGNING_RETRY_DELAY_MS = 150;

export type ResolvedAssetUrl = {
  assetId: string;
  expiresAt: string;
  requestedVariantKey: AssetSignedVariantKey;
  servedVariantKey: AssetSignedVariantKey | null;
  status: 'ok' | 'fallback';
  url: string;
};

type PendingEntry = {
  assetId: string;
  promise: Promise<ResolvedAssetUrl>;
  reject: (error: unknown) => void;
  resolve: (result: ResolvedAssetUrl) => void;
  variantKey: AssetSignedVariantKey;
};

const pendingByKey = new Map<string, PendingEntry>();
const queuedKeys = new Set<string>();
let flushScheduled = false;

function requestKey(assetId: string, variantKey: AssetSignedVariantKey): string {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function requestSignedUrls(entries: PendingEntry[]) {
  const requests = entries.map((entry) => ({
    assetId: entry.assetId,
    allowVariantFallback: true,
    variantKey: entry.variantKey,
  }));
  try {
    return await getAssetSignedUrls(requests);
  } catch (error) {
    await delay(SIGNING_RETRY_DELAY_MS);
    return getAssetSignedUrls(requests).catch(() => {
      throw error;
    });
  }
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

function toResolvedAssetUrl(item: AssetSignedUrl, requestedVariantKey: AssetSignedVariantKey): ResolvedAssetUrl | null {
  if (!item.url || !item.expiresAt) return null;
  return {
    assetId: item.assetId,
    expiresAt: item.expiresAt,
    requestedVariantKey,
    servedVariantKey: item.servedVariantKey,
    status: item.status,
    url: item.url,
  };
}

async function resolveBatch(entries: PendingEntry[]): Promise<void> {
  const response = await requestSignedUrls(entries);
  const itemsByKey = new Map(
    response.items.map((item) => [
      requestKey(item.assetId, item.requestedVariantKey || item.variantKey || 'preview'),
      item,
    ]),
  );
  const unavailable = new Set((response.errors || []).map((item) => item.assetId));

  entries.forEach((entry) => {
    const item = itemsByKey.get(requestKey(entry.assetId, entry.variantKey));
    const result = item ? toResolvedAssetUrl(item, entry.variantKey) : null;
    if (!result) {
      entry.reject(new Error(unavailable.has(entry.assetId) ? 'Asset unavailable' : `Signed asset URL missing for asset ${entry.assetId}`));
      pendingByKey.delete(requestKey(entry.assetId, entry.variantKey));
      return;
    }

    setCachedAssetUrl(result);
    entry.resolve(result);
    pendingByKey.delete(requestKey(entry.assetId, entry.variantKey));
  });
}

export function resolveAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): Promise<ResolvedAssetUrl> {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) return Promise.reject(new Error('Asset ID is required'));

  const cached = getCachedAssetUrl(normalizedAssetId, variantKey);
  if (cached) return Promise.resolve(cached);

  const key = requestKey(normalizedAssetId, variantKey);
  const existing = pendingByKey.get(key);
  if (existing) return existing.promise;

  let resolvePromise!: (result: ResolvedAssetUrl) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<ResolvedAssetUrl>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  pendingByKey.set(key, {
    assetId: normalizedAssetId,
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
    variantKey,
  });
  queuedKeys.add(key);
  scheduleFlush();
  return promise;
}

export async function resolveAssetPreviewUrl(
  assetId: string,
  variantKey: AssetSignedVariantKey = 'preview',
): Promise<string> {
  return (await resolveAssetUrl(assetId, variantKey)).url;
}

export function invalidateAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): void {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) return;
  invalidateCachedAssetUrl(normalizedAssetId, variantKey);
}

export function refreshAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): Promise<ResolvedAssetUrl> {
  invalidateAssetUrl(assetId, variantKey);
  return resolveAssetUrl(assetId, variantKey);
}

export function invalidateAssetPreviewUrl(assetId: string, variantKey: AssetSignedVariantKey = 'preview'): void {
  invalidateAssetUrl(assetId, variantKey);
}

export async function refreshAssetPreviewUrl(
  assetId: string,
  variantKey: AssetSignedVariantKey = 'preview',
): Promise<string> {
  return (await refreshAssetUrl(assetId, variantKey)).url;
}

export function clearAssetPreviewResolver(): void {
  const error = new Error('Asset preview resolver was reset');
  pendingByKey.forEach((entry) => entry.reject(error));
  pendingByKey.clear();
  queuedKeys.clear();
  flushScheduled = false;
}
