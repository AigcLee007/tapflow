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

export type AssetLibraryState = {
  assets: AssetItem[];
  groupedAssets: AssetDateGroup[];
  error: string | null;
  folders: AssetFolder[];
  loading: boolean;
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

  const refresh = useCallback(async () => {
    if (!authenticated || !tenant || !user) {
      requestSequenceRef.current += 1;
      setAssets([]);
      setFolders([]);
      setTotal(0);
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
      setAssets(withPreview);
      setFolders(folderResult);
      setTotal(assetResult.total);
    } catch (err) {
      if (requestSequenceRef.current !== requestId) return;
      setAssets([]);
      setFolders([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "素材库加载失败，请稍后重试。");
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [authenticated, params, tenant, user]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    setAssets([]);
    setFolders([]);
    setSelectedMediaTab("image");
    setSelectedFolderId(null);
    setQuery("");
    setTotal(0);
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
