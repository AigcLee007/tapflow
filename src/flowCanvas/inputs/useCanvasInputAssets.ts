import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAsset, getAssetVariantUrl, type AssetItem } from "../../assets/assetApi";
import type { CanvasInputItem, CanvasInputPreviewState } from "./canvasInputProjection";

type ResolvedAsset = {
  durationMs?: number;
  hoverPreviewUrl?: string;
  previewState: CanvasInputPreviewState;
  previewUrl?: string;
  thumbnailUrl?: string;
  title?: string;
};

const SIGNED_URL_REFRESH_SAFETY_MS = 30_000;
const SIGNED_URL_REFRESH_MIN_DELAY_MS = 30_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

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
  const refreshTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const resolveAssetRef = useRef<(assetId: string) => void>(() => undefined);
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
    const existingTimer = refreshTimers.current[assetId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete refreshTimers.current[assetId];
    }
    const generation = (assetGenerations.current[assetId] ?? 0) + 1;
    assetGenerations.current[assetId] = generation;
    const relevantItems = itemsRef.current.filter((item) => assetRequestKey(item) === assetId);
    const kind = relevantItems[0]?.kind;
    const immediateThumbnailUrl = relevantItems
      .map((item) => item.thumbnailUrl || item.previewUrl)
      .find(Boolean);
    const immediateHoverPreviewUrl = relevantItems
      .map((item) => item.hoverPreviewUrl || item.previewUrl)
      .find(Boolean);
    const isVisualAsset = kind === "image" || kind === "video";
    const metadataPromise = Promise.resolve()
      .then(() => getAsset(assetId))
      .then((asset) => ({ asset, resolved: true as const }), () => ({ asset: undefined, resolved: false as const }));
    const variantsPromise = isVisualAsset
      ? Promise.allSettled([
        Promise.resolve().then(() => getAssetVariantUrl(assetId, "thumb")),
        Promise.resolve().then(() => getAssetVariantUrl(assetId, "preview")),
      ])
      : Promise.resolve([]);
    const [metadata, variants] = await Promise.all([metadataPromise, variantsPromise]);
    const thumbResult = variants[0];
    const previewResult = variants[1];
    const thumbUrl = thumbResult?.status === "fulfilled" ? thumbResult.value?.url : undefined;
    const previewUrl = previewResult?.status === "fulfilled" ? previewResult.value?.url : undefined;
    const legacyPreviewUrl = metadata.asset?.previewUrl;
    const thumbnailUrl = thumbUrl || immediateThumbnailUrl || (kind === "image" ? legacyPreviewUrl : undefined);
    const hoverPreviewUrl = previewUrl || immediateHoverPreviewUrl || legacyPreviewUrl;
    const hasPreview = Boolean(thumbnailUrl || hoverPreviewUrl || (kind === "audio" && metadata.resolved));
    const variantsFailed = isVisualAsset && thumbResult?.status === "rejected" && previewResult?.status === "rejected";
    if (!mounted.current || !activeAssetIds.current.has(assetId) || assetGenerations.current[assetId] !== generation) return;
    setResolvedAssets((current) => ({
      ...current,
      [assetId]: {
        durationMs: metadata.asset?.durationMs ?? undefined,
        hoverPreviewUrl,
        previewState: hasPreview ? "ready" : !metadata.resolved && (!isVisualAsset || variantsFailed) ? "error" : "unavailable",
        previewUrl: thumbnailUrl || hoverPreviewUrl,
        thumbnailUrl,
        title: metadata.asset ? getDisplayTitle(metadata.asset) : undefined,
      },
    }));

    const expiryTimes = [thumbResult, previewResult]
      .flatMap((result) => result?.status === "fulfilled" ? [Date.parse(result.value.expiresAt)] : [])
      .filter(Number.isFinite);
    if (expiryTimes.length > 0) {
      const refreshDelay = Math.min(
        MAX_TIMER_DELAY_MS,
        Math.max(
          SIGNED_URL_REFRESH_MIN_DELAY_MS,
          Math.min(...expiryTimes) - Date.now() - SIGNED_URL_REFRESH_SAFETY_MS,
        ),
      );
      refreshTimers.current[assetId] = setTimeout(() => {
        delete refreshTimers.current[assetId];
        if (mounted.current && activeAssetIds.current.has(assetId)) {
          resolveAssetRef.current(assetId);
        }
      }, refreshDelay);
    }
  }, []);
  resolveAssetRef.current = resolveAsset;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      Object.values(refreshTimers.current).forEach(clearTimeout);
      refreshTimers.current = {};
    };
  }, []);

  useEffect(() => {
    const previousIds = previousAssetIds.current;
    const addedAssetIds = previousIds ? assetIds.filter((assetId) => !previousIds.has(assetId)) : assetIds;
    previousIds?.forEach((assetId) => {
      if (activeAssetIds.current.has(assetId)) return;
      const timer = refreshTimers.current[assetId];
      if (timer) clearTimeout(timer);
      delete refreshTimers.current[assetId];
    });
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
      const suppliedPreviewUrl = item.previewUrl ?? item.thumbnailUrl ?? item.hoverPreviewUrl;
      const previewUrl = resolved.previewUrl ?? suppliedPreviewUrl;
      const thumbnailUrl = resolved.thumbnailUrl ?? item.thumbnailUrl;
      const hoverPreviewUrl = resolved.hoverPreviewUrl ?? item.hoverPreviewUrl;
      const hasPreview = Boolean(previewUrl || thumbnailUrl || hoverPreviewUrl);
      return {
        ...item,
        durationMs: item.durationMs ?? resolved.durationMs,
        hoverPreviewUrl,
        previewState: hasPreview ? "ready" : resolved.previewState,
        previewUrl,
        thumbnailUrl,
        title: item.title || resolved.title || item.title,
      };
    }),
    retry,
  };
}
