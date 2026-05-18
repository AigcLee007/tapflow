import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page] = useState(1);
  const [pageSize] = useState(60);
  const [total, setTotal] = useState(0);

  const params = useMemo<AssetListParams>(() => ({
    folderId: selectedFolderId,
    page,
    pageSize,
    query: query.trim() || undefined,
  }), [page, pageSize, query, selectedFolderId]);

  const refresh = useCallback(async () => {
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
      setAssets(withPreview);
      setFolders(folderResult);
      setTotal(assetResult.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load asset library");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
