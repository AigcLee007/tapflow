import type { AssetSignedVariantKey } from './assetApi';

export type CachedAssetUrl = {
  assetId: string;
  expiresAt: string;
  requestedVariantKey: AssetSignedVariantKey;
  servedVariantKey: AssetSignedVariantKey | null;
  status: 'ok' | 'fallback';
  url: string;
};

const EXPIRY_SAFETY_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CachedAssetUrl>();
let scopeKey: string | null = null;

function keyFor(assetId: string, variantKey: AssetSignedVariantKey): string {
  return `${assetId}:${variantKey}`;
}

function storageKey(): string | null {
  return scopeKey ? `tapflow.asset-url-cache.v1:${scopeKey}` : null;
}

function isAllowedUrl(value: string): boolean {
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'https:'
      || parsed.origin === window.location.origin
      || (parsed.protocol === 'http:' && parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

function isVariantKey(value: unknown): value is AssetSignedVariantKey {
  return value === 'thumb' || value === 'preview';
}

function isUsable(item: CachedAssetUrl): boolean {
  const expiresAt = Date.parse(item.expiresAt);
  return Boolean(item.assetId?.trim())
    && isAllowedUrl(item.url)
    && isVariantKey(item.requestedVariantKey)
    && (item.servedVariantKey === null || isVariantKey(item.servedVariantKey))
    && (item.status === 'ok' || item.status === 'fallback')
    && Number.isFinite(expiresAt)
    && expiresAt - Date.now() > EXPIRY_SAFETY_MS;
}

function normalizeCache(): void {
  const entries = [...cache.entries()]
    .filter(([, item]) => isUsable(item))
    .sort(([, left], [, right]) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt))
    .slice(-MAX_CACHE_ENTRIES);
  cache.clear();
  entries.forEach(([key, item]) => cache.set(key, item));
}

function persist(): void {
  const key = storageKey();
  if (!key || typeof sessionStorage === 'undefined') return;
  normalizeCache();
  try {
    sessionStorage.setItem(key, JSON.stringify([...cache.values()]));
  } catch {
    // Asset rendering cannot depend on browser storage availability.
  }
}

function isCachedAssetUrl(value: unknown): value is CachedAssetUrl {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CachedAssetUrl>;
  return typeof item.assetId === 'string'
    && typeof item.expiresAt === 'string'
    && typeof item.url === 'string'
    && isVariantKey(item.requestedVariantKey)
    && (item.servedVariantKey === null || isVariantKey(item.servedVariantKey))
    && (item.status === 'ok' || item.status === 'fallback')
    && isUsable(item as CachedAssetUrl);
}

function hydrate(): void {
  const key = storageKey();
  if (!key || typeof sessionStorage === 'undefined') return;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('Invalid asset URL cache');
    parsed.forEach((item) => {
      if (isCachedAssetUrl(item)) cache.set(keyFor(item.assetId, item.requestedVariantKey), item);
    });
    persist();
  } catch {
    sessionStorage.removeItem(key);
  }
}

export function setAssetUrlCacheScope(scope: { tenantId: string; userId: string } | null): void {
  const nextScope = scope?.tenantId && scope.userId ? `${scope.tenantId}:${scope.userId}` : null;
  if (scopeKey === nextScope) return;
  cache.clear();
  scopeKey = nextScope;
  hydrate();
}

export function getCachedAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): CachedAssetUrl | null {
  const key = keyFor(assetId, variantKey);
  const item = cache.get(key);
  if (!item) return null;
  if (!isUsable(item)) {
    cache.delete(key);
    persist();
    return null;
  }
  return item;
}

export function setCachedAssetUrl(item: CachedAssetUrl): void {
  if (!isUsable(item)) return;
  cache.set(keyFor(item.assetId, item.requestedVariantKey), item);
  persist();
}

export function invalidateCachedAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): void {
  cache.delete(keyFor(assetId, variantKey));
  persist();
}

export function clearAssetUrlMemoryCache(): void {
  cache.clear();
}

export function clearAssetUrlCache(): void {
  const key = storageKey();
  cache.clear();
  if (key && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
}
