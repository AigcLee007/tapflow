import type { AssetFolder, AssetItem } from "./assetApi";
import type { AssetMediaTab } from "./assetLibraryView";

export type AssetSessionSnapshot = {
  assets: AssetItem[];
  folders: AssetFolder[];
  mediaCounts: Record<AssetMediaTab, number>;
  staleAt: number;
  total: number;
};

const snapshots = new Map<string, AssetSessionSnapshot>();

function keyFor(identityKey: string, paramsKey: string) {
  return `${identityKey}::${paramsKey}`;
}

export function getAssetSessionSnapshot(identityKey: string, paramsKey: string): AssetSessionSnapshot | null {
  return snapshots.get(keyFor(identityKey, paramsKey)) ?? null;
}

export function isAssetSessionSnapshotFresh(snapshot: AssetSessionSnapshot, now = Date.now()): boolean {
  return snapshot.staleAt > now;
}

export function setAssetSessionSnapshot(
  identityKey: string,
  paramsKey: string,
  snapshot: AssetSessionSnapshot,
): void {
  snapshots.set(keyFor(identityKey, paramsKey), snapshot);
}

export function clearAssetSessionCache(): void {
  snapshots.clear();
}
