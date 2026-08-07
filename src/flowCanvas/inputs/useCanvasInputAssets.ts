import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAsset, getAssetVariantUrl, type AssetItem } from "../../assets/assetApi";
import type { CanvasInputItem, CanvasInputPreviewState } from "./canvasInputProjection";

type ResolvedAsset = {
  durationMs?: number;
  previewState: CanvasInputPreviewState;
  previewUrl?: string;
  title?: string;
};

function assetRequestKey(item: CanvasInputItem): string | null {
  if (!item.assetId || (item.kind !== "image" && item.kind !== "video" && item.kind !== "audio")) return null;
  return item.assetId;
}

function getDisplayTitle(asset: AssetItem): string | undefined {
  return asset.title || asset.originalFilename || undefined;
}

export function useCanvasInputAssets(items: CanvasInputItem[]) {
  const [resolvedAssets, setResolvedAssets] = useState<Record<string, ResolvedAsset>>({});
  const activeAssetIds = useRef(new Set<string>());
  const assetGenerations = useRef<Record<string, number>>({});
  const itemsRef = useRef(items);
  const mounted = useRef(true);
  const previousAssetIds = useRef<Set<string> | null>(null);
  itemsRef.current = items;

  const assetIds = useMemo(
    () => [...new Set(items.map(assetRequestKey).filter((assetId): assetId is string => Boolean(assetId)))].sort(),
    [items],
  );
  const assetIdsKey = assetIds.join("|");
  activeAssetIds.current = new Set(assetIds);

  const resolveAsset = useCallback(async (assetId: string) => {
    const generation = (assetGenerations.current[assetId] ?? 0) + 1;
    assetGenerations.current[assetId] = generation;
    const relevantItems = itemsRef.current.filter((item) => assetRequestKey(item) === assetId);
    const immediatePreview = relevantItems.find((item) => item.previewUrl)?.previewUrl;
    const kind = relevantItems[0]?.kind;
    try {
      const asset = await getAsset(assetId);
      let previewUrl = immediatePreview || asset.previewUrl;
      if (!previewUrl && (kind === "image" || kind === "video")) {
        previewUrl = (await getAssetVariantUrl(assetId, "thumb")).url;
      }
      if (!mounted.current || !activeAssetIds.current.has(assetId) || assetGenerations.current[assetId] !== generation) return;
      setResolvedAssets((current) => ({
        ...current,
        [assetId]: {
          durationMs: asset.durationMs ?? undefined,
          previewState: previewUrl || kind === "audio" ? "ready" : "unavailable",
          previewUrl,
          title: getDisplayTitle(asset),
        },
      }));
    } catch {
      if (!mounted.current || !activeAssetIds.current.has(assetId) || assetGenerations.current[assetId] !== generation) return;
      setResolvedAssets((current) => ({ ...current, [assetId]: { previewState: "error" } }));
    }
  }, []);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    const previousIds = previousAssetIds.current;
    const addedAssetIds = previousIds ? assetIds.filter((assetId) => !previousIds.has(assetId)) : assetIds;
    previousAssetIds.current = new Set(assetIds);
    addedAssetIds.forEach((assetId) => { void resolveAsset(assetId); });
  }, [assetIds, assetIdsKey, resolveAsset]);

  const retry = useCallback((assetId: string) => {
    if (!activeAssetIds.current.has(assetId)) return;
    void resolveAsset(assetId);
  }, [resolveAsset]);

  return {
    items: items.map((item) => {
      const assetId = assetRequestKey(item);
      if (!assetId) return item;
      const resolved = resolvedAssets[assetId];
      if (!resolved) return item;
      return {
        ...item,
        durationMs: item.durationMs ?? resolved.durationMs,
        previewState: resolved.previewState,
        previewUrl: item.previewUrl ?? resolved.previewUrl,
        title: item.title || resolved.title || item.title,
      };
    }),
    retry,
  };
}
