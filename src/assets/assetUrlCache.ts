export type CachedAssetUrl = {
  assetId: string;
  expiresAt: string;
  url: string;
  variantKey?: string | null;
};

const EXPIRY_SAFETY_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CachedAssetUrl>();
let scopeKey: string | null = null;

function keyFor(assetId: string, variantKey?: string | null): string {
  return `${assetId}:${variantKey || "original"}`;
}

function storageKey(): string | null {
  return scopeKey ? `tapflow.asset-url-cache.v1:${scopeKey}` : null;
}

function isUsable(item: CachedAssetUrl): boolean {
  const expiresAt = Date.parse(item.expiresAt);
  return Boolean(item.assetId && item.url) && Number.isFinite(expiresAt) && expiresAt - Date.now() > EXPIRY_SAFETY_MS;
}

function persist(): void {
  const key = storageKey();
  if (!key || typeof sessionStorage === "undefined") return;
  const entries = [...cache.values()]
    .filter(isUsable)
    .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt))
    .slice(-MAX_CACHE_ENTRIES);
  try {
    sessionStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // Caching must never affect asset display.
  }
}

function hydrate(): void {
  const key = storageKey();
  if (!key || typeof sessionStorage === "undefined") return;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(parsed)) return;
    parsed.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const candidate = item as CachedAssetUrl;
      if (isUsable(candidate)) cache.set(keyFor(candidate.assetId, candidate.variantKey), candidate);
    });
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

export function getCachedAssetUrl(assetId: string, variantKey?: string | null): string | null {
  const key = keyFor(assetId, variantKey);
  const item = cache.get(key);
  if (!item) return null;
  if (!isUsable(item)) {
    cache.delete(key);
    persist();
    return null;
  }
  return item.url;
}

export function setCachedAssetUrl(item: CachedAssetUrl): void {
  if (!isUsable(item)) return;
  cache.set(keyFor(item.assetId, item.variantKey), item);
  persist();
}

export function invalidateCachedAssetUrl(assetId: string, variantKey?: string | null): void {
  cache.delete(keyFor(assetId, variantKey));
  persist();
}

export function clearAssetUrlMemoryCache(): void {
  cache.clear();
}

export function clearAssetUrlCache(): void {
  const key = storageKey();
  cache.clear();
  if (key && typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
}
