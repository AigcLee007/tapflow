export type CachedAssetUrl = {
  assetId: string;
  expiresAt: string;
  url: string;
  variantKey?: string | null;
};

const EXPIRY_SAFETY_MS = 60_000;
const cache = new Map<string, CachedAssetUrl>();

function keyFor(assetId: string, variantKey?: string | null): string {
  return `${assetId}:${variantKey || "original"}`;
}

export function getCachedAssetUrl(assetId: string, variantKey?: string | null): string | null {
  const key = keyFor(assetId, variantKey);
  const item = cache.get(key);
  if (!item) {
    return null;
  }

  const expiresAt = Date.parse(item.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() <= EXPIRY_SAFETY_MS) {
    cache.delete(key);
    return null;
  }

  return item.url;
}

export function setCachedAssetUrl(item: CachedAssetUrl): void {
  cache.set(keyFor(item.assetId, item.variantKey), item);
}

export function invalidateCachedAssetUrl(assetId: string, variantKey?: string | null): void {
  cache.delete(keyFor(assetId, variantKey));
}

export function clearAssetUrlCache(): void {
  cache.clear();
}
