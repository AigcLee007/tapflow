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
  if (!item.assetId || (item.kind !== "image" && item.kind !== "video" && item.kind !== "audio")) {
    return null;
  }
  return item.assetId;
}

function getDisplayTitle(asset: AssetItem): string | undefined {
  return asset.title || asset.originalFilename || undefined;
}

export function useCanvasInputAssets(items: CanvasInputItem[]) {
  const [resolvedAssets, setResolvedAssets] = useState<Record<string, ResolvedAsset>>({});
  const [retryRequest, setRetryRequest] = useState<{ assetId: string; nonce: number } | null>(null);
  const lastAssetIdsKey = useRef<string | null>(null);
  const assetIds = useMemo(
    () => [...new Set(items.map(assetRequestKey).filter((assetId): assetId is string => Boolean(assetId)))].sort(),
    [items],
  );
  const assetIdsKey = assetIds.join("|");

  useEffect(() => {
    let cancelled = false;

    async function resolveAsset(assetId: string) {
      const relevantItems = items.filter((item) => assetRequestKey(item) === assetId);
      const immediatePreview = relevantItems.find((item) => item.previewUrl)?.previewUrl;
      const kind = relevantItems[0]?.kind;
      try {
        const asset = await getAsset(assetId);
        let previewUrl = immediatePreview || asset.previewUrl;
        if (!previewUrl && (kind === "image" || kind === "video")) {
          previewUrl = (await getAssetVariantUrl(assetId, "thumb")).url;
        }
        if (cancelled) return;
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
        if (cancelled) return;
        setResolvedAssets((current) => ({
          ...current,
          [assetId]: { previewState: "error" },
        }));
      }
    }

    const assetIdsToResolve = lastAssetIdsKey.current !== assetIdsKey
      ? assetIds
      : retryRequest ? [retryRequest.assetId] : [];
    lastAssetIdsKey.current = assetIdsKey;
    assetIdsToResolve.forEach((assetId) => {
      void resolveAsset(assetId);
    });

    return () => {
      cancelled = true;
    };
  // Asset IDs initialize resolution; a retry targets exactly one known asset.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIdsKey, retryRequest]);

  const retry = useCallback((assetId: string) => {
    if (!assetIds.includes(assetId)) return;
    setRetryRequest((current) => ({ assetId, nonce: (current?.nonce ?? 0) + 1 }));
  }, [assetIds]);

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
