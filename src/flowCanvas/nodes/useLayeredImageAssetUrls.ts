import { useCallback, useEffect, useMemo, useState } from 'react';

import { refreshAssetUrl, resolveAssetUrl } from '../../assets/assetPreviewResolver';
import { canvasThumbnailPerformance } from '../performance/canvasThumbnailPerformance';

type LayeredImageAssetUrlOptions = {
  assetIds: string[];
  loadPreview?: boolean;
  previewAssetId?: string | null;
};

function uniqueAssetIds(assetIds: string[]): string[] {
  return Array.from(new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean)));
}

export function useLayeredImageAssetUrls({
  assetIds,
  loadPreview = false,
  previewAssetId = null,
}: LayeredImageAssetUrlOptions) {
  const assetIdsKey = useMemo(() => uniqueAssetIds(assetIds).join('|'), [assetIds]);
  const normalizedAssetIds = useMemo(() => assetIdsKey ? assetIdsKey.split('|') : [], [assetIdsKey]);
  const normalizedPreviewAssetId = previewAssetId?.trim() || '';
  const [thumbnailUrlsByAssetId, setThumbnailUrlsByAssetId] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (normalizedAssetIds.length === 0) {
      setThumbnailUrlsByAssetId({});
      return;
    }
    let active = true;
    const signingGeneration = canvasThumbnailPerformance.beginSigning(normalizedAssetIds);
    void Promise.allSettled(normalizedAssetIds.map((assetId) => resolveAssetUrl(assetId, 'thumb')))
      .then((results) => {
        if (!active) return;
        const entries = results.flatMap((result) => result.status === 'fulfilled'
          ? [[result.value.assetId, result.value.url] as const]
          : []);
        setThumbnailUrlsByAssetId(Object.fromEntries(entries));
      })
      .finally(() => canvasThumbnailPerformance.endSigning(signingGeneration));
    return () => {
      active = false;
    };
  }, [assetIdsKey, normalizedAssetIds]);

  useEffect(() => {
    if (!loadPreview || !normalizedPreviewAssetId) {
      setPreviewUrl('');
      return;
    }
    let active = true;
    void resolveAssetUrl(normalizedPreviewAssetId, 'preview')
      .then((result) => {
        if (active) setPreviewUrl(result.url);
      })
      .catch(() => {
        if (active) setPreviewUrl('');
      });
    return () => {
      active = false;
    };
  }, [loadPreview, normalizedPreviewAssetId]);

  const refreshThumbnail = useCallback(async (assetId: string) => {
    const result = await refreshAssetUrl(assetId, 'thumb');
    setThumbnailUrlsByAssetId((current) => ({ ...current, [result.assetId]: result.url }));
    return result;
  }, []);

  return {
    markPreviewVisible: canvasThumbnailPerformance.markPreviewVisible,
    markThumbnailVisible: canvasThumbnailPerformance.markThumbVisible,
    previewUrl,
    refreshThumbnail,
    thumbnailUrlsByAssetId,
  };
}
