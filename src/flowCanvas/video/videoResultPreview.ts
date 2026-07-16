import { isTransientMediaUrl } from "../utils/transientMedia";

type PersistedVideoResult = {
  id?: unknown;
};

type RuntimeVideoAsset = {
  downloadUrl?: string | null;
};

const ASSET_RESULT_ID_PREFIX = "asset:";

function readActiveIndex(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function getPersistedAssetId(result: PersistedVideoResult | undefined): string | null {
  const id = typeof result?.id === "string" ? result.id.trim() : "";
  if (!id.startsWith(ASSET_RESULT_ID_PREFIX)) return null;
  const assetId = id.slice(ASSET_RESULT_ID_PREFIX.length).trim();
  return assetId && !isTransientMediaUrl(assetId) ? assetId : null;
}

/**
 * Generated-result URLs are transient. The stable `asset:<id>` reference is
 * the only persisted source used to recover a preview after a draft reload.
 */
export function getPersistedVideoResultAssetId(data: {
  activeResultIndex?: unknown;
  generatedResults?: unknown;
}): string | null {
  if (!Array.isArray(data.generatedResults)) return null;
  const results = data.generatedResults as PersistedVideoResult[];
  const selected = getPersistedAssetId(results[readActiveIndex(data.activeResultIndex)]);
  if (selected) return selected;
  return results.map(getPersistedAssetId).find((assetId): assetId is string => Boolean(assetId)) || null;
}

export function getSelectedRuntimeVideoPreviewUrl(
  assets: RuntimeVideoAsset[],
  activeResultIndex: unknown,
): string | null {
  const selected = assets[readActiveIndex(activeResultIndex)]?.downloadUrl;
  const fallback = assets[0]?.downloadUrl;
  const url = typeof selected === "string" && selected.trim()
    ? selected.trim()
    : typeof fallback === "string" && fallback.trim()
      ? fallback.trim()
      : "";
  return url || null;
}

export function getSafePersistedVideoPosterUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  return url && !isTransientMediaUrl(url) ? url : null;
}
