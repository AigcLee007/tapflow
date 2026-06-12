import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import {
  getAssetSignedUrls,
  listAssetFolders,
  listAssets,
  type AssetFolder,
  type AssetItem,
  type AssetListParams,
} from "./assetApi";
import { getCachedAssetUrl, setCachedAssetUrl } from "./assetUrlCache";
import {
  filterAssetsByMediaTab,
  getPreferredAssetPreviewRequest,
  groupAssetsByCreatedDate,
  type AssetDateGroup,
  type AssetMediaTab,
} from "./assetLibraryView";

type AssetMediaCounts = Record<AssetMediaTab, number>;

export type AssetLibraryState = {
  assets: AssetItem[];
  groupedAssets: AssetDateGroup[];
  error: string | null;
  folders: AssetFolder[];
  loading: boolean;
  mediaCounts: AssetMediaCounts;
  page: number;
  pageSize: number;
  refresh: () => Promise<void>;
  selectedMediaTab: AssetMediaTab;
  selectedFolderId: string | null;
  setSelectedMediaTab: (tab: AssetMediaTab) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setQuery: (query: string) => void;
  query: string;
  total: number;
};

type AssetLibrarySnapshot = {
  assets: AssetItem[];
  folders: AssetFolder[];
  mediaCounts: AssetMediaCounts;
  total: number;
};

const DEFAULT_MEDIA_COUNTS: AssetMediaCounts = {
  all: 0,
  audio: 0,
  image: 0,
  video: 0,
};

const librarySnapshotCache = new Map<string, AssetLibrarySnapshot>();

export function useAssetLibrary(): AssetLibraryState {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [selectedMediaTab, setSelectedMediaTab] = useState<AssetMediaTab>("image");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page] = useState(1);
  const [pageSize] = useState(60);
  const [total, setTotal] = useState(0);
  const [mediaCounts, setMediaCounts] = useState<AssetMediaCounts>(DEFAULT_MEDIA_COUNTS);
  const requestSequenceRef = useRef(0);

  const identityKey = useMemo(
    () => (authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous"),
    [authenticated, sessionId, tenant, user],
  );

  const params = useMemo<AssetListParams>(() => ({
    folderId: selectedFolderId,
    page,
    pageSize,
    query: query.trim() || undefined,
  }), [page, pageSize, query, selectedFolderId]);

  const countParams = useMemo(
    () => ({
      folderId: selectedFolderId,
      query: query.trim() || undefined,
    }),
    [query, selectedFolderId],
  );

  const refresh = useCallback(async () => {
    if (!authenticated || !tenant || !user) {
      requestSequenceRef.current += 1;
      setAssets([]);
      setFolders([]);
      setTotal(0);
      setMediaCounts(DEFAULT_MEDIA_COUNTS);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const [assetResult, folderResult] = await Promise.all([
        listAssets(params),
        listAssetFolders(),
      ]);

      const previewRequests = assetResult.items
        .map((asset) => ({
          asset,
          request: getPreferredAssetPreviewRequest(asset),
        }))
        .filter((item): item is { asset: AssetItem; request: NonNullable<ReturnType<typeof getPreferredAssetPreviewRequest>> } => Boolean(item.request));

      const requests = previewRequests
        .filter(({ asset, request }) => !getCachedAssetUrl(asset.id, request.variantKey ?? null))
        .map(({ request }) => request);

      if (requests.length > 0) {
        const signed = await getAssetSignedUrls(requests).catch(() => ({ items: [] }));
        signed.items.forEach(setCachedAssetUrl);
      }

      const requestByAssetId = new Map(previewRequests.map(({ asset, request }) => [asset.id, request]));
      const withPreview = assetResult.items.map((asset) => {
        const request = requestByAssetId.get(asset.id);
        const cachedPreview = request ? getCachedAssetUrl(asset.id, request.variantKey ?? null) : null;
        return {
          ...asset,
          previewUrl: cachedPreview || asset.previewUrl,
        };
      });

      if (requestSequenceRef.current !== requestId) return;
      const cachedCounts = librarySnapshotCache.get(identityKey)?.mediaCounts ?? DEFAULT_MEDIA_COUNTS;
      const nextCounts = {
        all: assetResult.total,
        audio: cachedCounts.audio,
        image: cachedCounts.image,
        video: cachedCounts.video,
      };
      setAssets(withPreview);
      setFolders(folderResult);
      setTotal(assetResult.total);
      setMediaCounts(nextCounts);
      librarySnapshotCache.set(identityKey, {
        assets: withPreview,
        folders: folderResult,
        mediaCounts: nextCounts,
        total: assetResult.total,
      });

      void Promise.all([
        listAssets({ ...countParams, kind: "image", page: 1, pageSize: 1 }),
        listAssets({ ...countParams, kind: "video", page: 1, pageSize: 1 }),
        listAssets({ ...countParams, kind: "audio", page: 1, pageSize: 1 }),
      ])
        .then(([imageCount, videoCount, audioCount]) => {
          if (requestSequenceRef.current !== requestId) return;
          const updatedCounts = {
            all: assetResult.total,
            audio: audioCount.total,
            image: imageCount.total,
            video: videoCount.total,
          };
          setMediaCounts(updatedCounts);
          librarySnapshotCache.set(identityKey, {
            assets: withPreview,
            folders: folderResult,
            mediaCounts: updatedCounts,
            total: assetResult.total,
          });
        })
        .catch(() => undefined);
    } catch (err) {
      if (requestSequenceRef.current !== requestId) return;
      setAssets([]);
      setFolders([]);
      setTotal(0);
      setMediaCounts(DEFAULT_MEDIA_COUNTS);
      setError(err instanceof Error ? err.message : "素材库加载失败，请稍后重试。");
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [authenticated, countParams, identityKey, params, tenant, user]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    const cached = librarySnapshotCache.get(identityKey);
    setAssets(cached?.assets ?? []);
    setFolders(cached?.folders ?? []);
    setSelectedMediaTab("image");
    setSelectedFolderId(null);
    setQuery("");
    setTotal(cached?.total ?? 0);
    setMediaCounts(cached?.mediaCounts ?? DEFAULT_MEDIA_COUNTS);
    setError(null);
    setLoading(Boolean(authenticated && tenant && user));
  }, [authenticated, identityKey, tenant, user]);

  useEffect(() => {
    void refresh();
  }, [identityKey, refresh]);

  const groupedAssets = useMemo(
    () => groupAssetsByCreatedDate(filterAssetsByMediaTab(assets, selectedMediaTab)),
    [assets, selectedMediaTab],
  );

  return {
    assets,
    groupedAssets,
    error,
    folders,
    loading,
    mediaCounts,
    page,
    pageSize,
    query,
    refresh,
    selectedMediaTab,
    selectedFolderId,
    setSelectedMediaTab,
    setQuery,
    setSelectedFolderId,
    total,
  };
}
