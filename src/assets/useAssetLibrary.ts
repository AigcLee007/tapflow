import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import {
  getAssetSummary,
  listAssetFolders,
  listAssets,
  type AssetFolder,
  type AssetItem,
  type AssetListParams,
} from "./assetApi";
import {
  clearAssetSessionCache,
  getAssetSessionSnapshot,
  isAssetSessionSnapshotFresh,
  setAssetSessionSnapshot,
} from "./assetSessionCache";
import {
  filterAssetsByMediaTab,
  groupAssetsByCreatedDate,
  type AssetDateGroup,
  type AssetMediaTab,
} from "./assetLibraryView";

type AssetMediaCounts = Record<AssetMediaTab, number>;

export type AssetLibraryState = {
  assets: AssetItem[];
  groupedAssets: AssetDateGroup[];
  error: string | null;
  favoriteOnly: boolean;
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
  setFavoriteOnly: (favoriteOnly: boolean) => void;
  updateAssetOptimistically: (
    assetId: string,
    updater: (asset: AssetItem) => AssetItem | null,
    action: () => Promise<void>,
  ) => Promise<void>;
  setQuery: (query: string) => void;
  query: string;
  total: number;
};

const DEFAULT_MEDIA_COUNTS: AssetMediaCounts = {
  all: 0,
  audio: 0,
  image: 0,
  video: 0,
};
const SNAPSHOT_TTL_MS = 30_000;

export function useAssetLibrary(): AssetLibraryState {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [selectedMediaTab, setSelectedMediaTab] = useState<AssetMediaTab>("image");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page] = useState(1);
  const [pageSize] = useState(30);
  const [total, setTotal] = useState(0);
  const [mediaCounts, setMediaCounts] = useState<AssetMediaCounts>(DEFAULT_MEDIA_COUNTS);
  const requestSequenceRef = useRef(0);

  const identityKey = useMemo(
    () => (authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous"),
    [authenticated, sessionId, tenant, user],
  );

  const params = useMemo<AssetListParams>(() => ({
    folderId: selectedFolderId,
    favorite: favoriteOnly || undefined,
    includePreviewUrls: true,
    page,
    pageSize,
    previewExpiresInSeconds: 900,
    query: query.trim() || undefined,
  }), [favoriteOnly, page, pageSize, query, selectedFolderId]);

  const paramsKey = useMemo(
    () =>
      JSON.stringify({
        favoriteOnly,
        folderId: selectedFolderId,
        page,
        pageSize,
        query: query.trim() || undefined,
      }),
    [favoriteOnly, page, pageSize, query, selectedFolderId],
  );

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
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
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [assetResult, folderResult] = await Promise.all([
        listAssets(params),
        listAssetFolders(),
      ]);

      if (requestSequenceRef.current !== requestId) return;
      const cachedCounts = getAssetSessionSnapshot(identityKey, paramsKey)?.mediaCounts ?? DEFAULT_MEDIA_COUNTS;
      const nextCounts = {
        all: assetResult.total,
        audio: cachedCounts.audio,
        image: cachedCounts.image,
        video: cachedCounts.video,
      };
      setAssets(assetResult.items);
      setFolders(folderResult);
      setTotal(assetResult.total);
      setMediaCounts(nextCounts);
      setAssetSessionSnapshot(identityKey, paramsKey, {
        assets: assetResult.items,
        folders: folderResult,
        mediaCounts: nextCounts,
        staleAt: Date.now() + SNAPSHOT_TTL_MS,
        total: assetResult.total,
      });

      void Promise.resolve(getAssetSummary())
        .then((summary) => {
          if (requestSequenceRef.current !== requestId) return;
          setMediaCounts(summary.counts);
          setAssetSessionSnapshot(identityKey, paramsKey, {
            assets: assetResult.items,
            folders: folderResult,
            mediaCounts: summary.counts,
            staleAt: Date.now() + SNAPSHOT_TTL_MS,
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
  }, [authenticated, identityKey, params, paramsKey, tenant, user]);

  const updateAssetOptimistically = useCallback(
    async (assetId: string, updater: (asset: AssetItem) => AssetItem | null, action: () => Promise<void>) => {
      const previousAssets = assets;
      const nextAssets = assets
        .map((asset) => (asset.id === assetId ? updater(asset) : asset))
        .filter((asset): asset is AssetItem => Boolean(asset));
      setAssets(nextAssets);
      setAssetSessionSnapshot(identityKey, paramsKey, {
        assets: nextAssets,
        folders,
        mediaCounts,
        staleAt: Date.now() + SNAPSHOT_TTL_MS,
        total: favoriteOnly ? nextAssets.length : total,
      });
      try {
        await action();
        void refresh();
      } catch (error) {
        setAssets(previousAssets);
        setAssetSessionSnapshot(identityKey, paramsKey, {
          assets: previousAssets,
          folders,
          mediaCounts,
          staleAt: Date.now() + SNAPSHOT_TTL_MS,
          total,
        });
        throw error;
      }
    },
    [assets, favoriteOnly, folders, identityKey, mediaCounts, paramsKey, refresh, total],
  );

  useEffect(() => {
    requestSequenceRef.current += 1;
    if (!authenticated || !tenant || !user) {
      clearAssetSessionCache();
    }
    const cached = getAssetSessionSnapshot(identityKey, paramsKey);
    setAssets(cached?.assets ?? []);
    setFolders(cached?.folders ?? []);
    setTotal(cached?.total ?? 0);
    setMediaCounts(cached?.mediaCounts ?? DEFAULT_MEDIA_COUNTS);
    setError(null);
    setLoading(Boolean(authenticated && tenant && user && !cached));
  }, [authenticated, identityKey, paramsKey, tenant, user]);

  useEffect(() => {
    const cached = getAssetSessionSnapshot(identityKey, paramsKey);
    if (cached && isAssetSessionSnapshotFresh(cached)) {
      void refresh({ silent: true });
      return;
    }
    void refresh({ silent: Boolean(cached) });
  }, [identityKey, paramsKey, refresh]);

  const groupedAssets = useMemo(
    () => groupAssetsByCreatedDate(filterAssetsByMediaTab(assets, selectedMediaTab)),
    [assets, selectedMediaTab],
  );

  return {
    assets,
    groupedAssets,
    error,
    favoriteOnly,
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
    setFavoriteOnly,
    setQuery,
    setSelectedFolderId,
    updateAssetOptimistically,
    total,
  };
}
