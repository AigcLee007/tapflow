import type { AssetItem, AssetKind } from "./assetApi";

export type AssetMediaTab = "all" | "image" | "video" | "audio";

export type AssetPreviewRequest = {
  assetId: string;
  variantKey?: string;
};

export type AssetDateGroup = {
  dateLabel: string;
  items: AssetItem[];
};

const MEDIA_KIND_ORDER: AssetMediaTab[] = ["all", "image", "video", "audio"];

export function isSupportedMediaTab(value: string): value is AssetMediaTab {
  return MEDIA_KIND_ORDER.includes(value as AssetMediaTab);
}

export function getPreferredAssetPreviewRequest(asset: AssetItem): AssetPreviewRequest | null {
  if (asset.status !== "available") return null;
  if (!(asset.mimeType.startsWith("image/") || asset.mimeType.startsWith("video/"))) return null;

  const variantKeys = new Set(asset.variants.map((variant) => variant.variantKey));
  if (variantKeys.has("thumb")) {
    return { assetId: asset.id, variantKey: "thumb" };
  }
  if (variantKeys.has("preview")) {
    return { assetId: asset.id, variantKey: "preview" };
  }
  return { assetId: asset.id };
}

export function getAssetDateLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function compareAssetsByCreatedAtDesc(a: AssetItem, b: AssetItem): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime;
  }
  if (a.createdAt !== b.createdAt) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  }
  return a.id.localeCompare(b.id);
}

export function groupAssetsByCreatedDate(assets: AssetItem[]): AssetDateGroup[] {
  const sorted = [...assets].sort(compareAssetsByCreatedAtDesc);
  const groups = new Map<string, AssetItem[]>();

  sorted.forEach((asset) => {
    const key = getAssetDateLabel(asset.createdAt);
    const current = groups.get(key) ?? [];
    current.push(asset);
    groups.set(key, current);
  });

  return Array.from(groups.entries()).map(([dateLabel, items]) => ({
    dateLabel,
    items,
  }));
}

export function filterAssetsByMediaTab(assets: AssetItem[], tab: AssetMediaTab): AssetItem[] {
  if (tab === "all") return assets;
  return assets.filter((asset) => normalizeAssetKind(asset.kind) === tab);
}

export function normalizeAssetKind(kind: AssetKind): AssetMediaTab | "other" {
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  return "other";
}
