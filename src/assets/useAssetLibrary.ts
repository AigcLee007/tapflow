import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import {
  getAssetDownloadUrl,
  listAssetFolders,
  listAssets,
  type AssetFolder,
  type AssetItem,
  type AssetListParams,
} from "./assetApi";

export type AssetLibraryState = {
  assets: AssetItem[];
  error: string | null;
  folders: AssetFolder[];
  loading: boolean;
  page: number;
  pageSize: number;
  refresh: () => Promise<void>;
  selectedFolderId: string | null;
  setSelectedFolderId: (folderId: string | null) => void;
  setQuery: (query: string) => void;
  query: string;
  total: number;
};

export function useAssetLibrary(): AssetLibraryState {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
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
      const withPreview = await Promise.all(
        assetResult.items.map(async (asset) => {
          if (asset.status !== "available") return asset;
          if (!asset.mimeType.startsWith("image/") && !asset.mimeType.startsWith("video/")) return asset;
          const download = await getAssetDownloadUrl(asset.id).catch(() => null);
          return download ? { ...asset, previewUrl: download.url } : asset;
        }),
      );
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
    setSelectedFolderId(null);
    setQuery("");
    setTotal(0);
    setError(null);
    setLoading(Boolean(authenticated && tenant && user));
  }, [authenticated, identityKey, tenant, user]);

  useEffect(() => {
    void refresh();
  }, [identityKey, refresh]);

  return {
    assets,
    error,
    folders,
    loading,
    page,
    pageSize,
    query,
    refresh,
    selectedFolderId,
    setQuery,
    setSelectedFolderId,
    total,
  };
}
