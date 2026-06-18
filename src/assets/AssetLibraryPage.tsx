import React, { useState } from "react";
import { CheckSquare, Download, Grid2X2, RefreshCw, Search, SlidersHorizontal, Star, Trash2, X } from "lucide-react";

import { EntityConfirmDialog } from "../components/EntityActionMenu";
import { useAuth } from "../auth/useAuth";
import {
  addAssetToFolder,
  deleteAsset,
  getAssetDownloadUrl,
  updateAssetMetadata,
  type AssetItem,
} from "./assetApi";
import { AssetFolderSidebar } from "./AssetFolderSidebar";
import { AssetGrid } from "./AssetGrid";
import { AssetMediaTabs } from "./AssetGroupedSections";
import { AssetPreviewModal } from "./AssetPreviewModal";
import { UploadAssetButton } from "./UploadAssetButton";
import { useAssetLibrary } from "./useAssetLibrary";

function AssetLibraryLoadingState() {
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">素材加载中...</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="brand-skeleton h-28 rounded-xl border border-white/10 bg-white/[0.04]"
            data-testid="brand-skeleton"
          />
        ))}
      </div>
    </div>
  );
}

export function AssetLibraryPage() {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const library = useAssetLibrary();
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  const identityKey =
    authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous";

  React.useEffect(() => {
    setPreviewAsset(null);
    setSelectedAssetIds(new Set());
  }, [identityKey]);

  React.useEffect(() => {
    if (!previewAsset) return;
    const currentAsset = library.assets.find((item) => item.id === previewAsset.id);
    if (!currentAsset) {
      setPreviewAsset(null);
      return;
    }

    if (currentAsset !== previewAsset) {
      setPreviewAsset(currentAsset);
    }
  }, [library.assets, previewAsset]);

  React.useEffect(() => {
    setSelectedAssetIds((current) => {
      if (current.size === 0) return current;
      const availableIds = new Set(library.assets.map((asset) => asset.id));
      const next = new Set(Array.from(current).filter((assetId) => availableIds.has(assetId)));
      return next.size === current.size ? current : next;
    });
  }, [library.assets]);

  const refresh = () => {
    void library.refresh();
  };

  const renameAsset = async (asset: AssetItem, title: string) => {
    await updateAssetMetadata(asset.id, { title });
    await library.refresh();
  };

  const toggleAssetFavorite = async (asset: AssetItem) => {
    const nextFavorite = !asset.favorite;
    await library.updateAssetOptimistically(
      asset.id,
      (current) => {
        const updated = { ...current, favorite: nextFavorite };
        return library.favoriteOnly && !nextFavorite ? null : updated;
      },
      async () => {
        await updateAssetMetadata(asset.id, { favorite: nextFavorite });
      },
    );
  };

  const downloadAsset = async (asset: AssetItem) => {
    const result = await getAssetDownloadUrl(asset.id);
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const moveAssetToFolder = async (asset: AssetItem, folderId: string) => {
    await addAssetToFolder(folderId, asset.id);
    await library.refresh();
  };

  const removeAsset = async (asset: AssetItem) => {
    await library.updateAssetOptimistically(
      asset.id,
      () => null,
      async () => {
        await deleteAsset(asset.id);
      },
    );
  };

  const selectedAssets = library.assets.filter((asset) => selectedAssetIds.has(asset.id));

  const clearSelectedAssets = () => {
    setSelectedAssetIds(new Set());
  };

  const selectAllVisibleAssets = () => {
    setSelectedAssetIds(new Set(library.groupedAssets.flatMap((group) => group.items.map((asset) => asset.id))));
  };

  const favoriteSelectedAssets = async () => {
    await Promise.all(
      selectedAssets.map((asset) =>
        library.updateAssetOptimistically(
          asset.id,
          (current) => ({ ...current, favorite: true }),
          async () => {
            await updateAssetMetadata(asset.id, { favorite: true });
          },
        ),
      ),
    );
  };

  const downloadSelectedAssets = async () => {
    const downloads = await Promise.all(selectedAssets.map((asset) => getAssetDownloadUrl(asset.id)));
    downloads.forEach((download) => {
      window.open(download.url, "_blank", "noopener,noreferrer");
    });
  };

  const bulkDeleteSelectedAssets = async () => {
    const assetsToDelete = selectedAssets;
    await Promise.all(
      assetsToDelete.map((asset) =>
        library.updateAssetOptimistically(
          asset.id,
          () => null,
          async () => {
            await deleteAsset(asset.id);
          },
        ),
      ),
    );
    clearSelectedAssets();
  };

  const handleSelectionChange = (assetIds: string[]) => {
    setSelectedAssetIds(new Set(assetIds));
  };

  const selectedMediaLabel =
    library.selectedMediaTab === "image" ? "图片" : library.selectedMediaTab === "video" ? "视频" : "音频";

  return (
    <section
      className="relative min-h-[calc(100vh-92px)] overflow-hidden rounded border border-white/10 bg-[#0b0d14] shadow-2xl shadow-black/20"
      data-testid="asset-library-shell"
    >
      <div className="flex flex-col md:flex-row">
        <AssetFolderSidebar
          favoriteOnly={library.favoriteOnly}
          folders={library.folders}
          onCreated={refresh}
          onFavoriteOnlyChange={library.setFavoriteOnly}
          onSelect={library.setSelectedFolderId}
          selectedFolderId={library.selectedFolderId}
        />
        <main className="min-w-0 flex-1 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-sky-300">Assets</div>
              <h1 className="mt-2 text-2xl font-semibold text-white">素材库</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                管理项目可复用的图片、视频、音频和参考素材。
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  共 {library.mediaCounts.all} 个素材
                </span>
                <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1">云端同步</span>
                <span className="rounded border border-white/10 bg-white/[0.04] px-2.5 py-1">项目复用</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  className="h-10 w-full rounded border border-white/10 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/60 sm:w-72"
                  onChange={(event) => library.setQuery(event.target.value)}
                  placeholder="搜索素材"
                  value={library.query}
                />
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/10 text-slate-100 hover:bg-white/[0.06]"
                onClick={refresh}
                title="刷新"
                type="button"
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/10 text-slate-100 hover:bg-white/[0.06]"
                title="筛选"
                type="button"
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-white/10 text-slate-100 hover:bg-white/[0.06]"
                title="网格视图"
                type="button"
              >
                <Grid2X2 size={16} />
              </button>
              <UploadAssetButton key={identityKey} onUploaded={refresh} />
            </div>
          </div>

          {library.error && (
            <div className="mt-5 rounded border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {library.error}
            </div>
          )}

          <div className="mt-6">
            <div className="mb-5">
              <AssetMediaTabs
                counts={library.mediaCounts}
                onSelectTab={library.setSelectedMediaTab}
                selectedTab={library.selectedMediaTab}
              />
            </div>
            {library.loading ? (
              <AssetLibraryLoadingState />
            ) : (
              <AssetGrid
                emptyMessage={`当前${selectedMediaLabel}分类下还没有素材。`}
                folders={library.folders}
                groups={library.groupedAssets}
                loading={library.loading}
                onAddToFolder={moveAssetToFolder}
                onDelete={removeAsset}
                onDownload={downloadAsset}
                onOpen={setPreviewAsset}
                onRename={renameAsset}
                onSelectionChange={handleSelectionChange}
                onToggleFavorite={toggleAssetFavorite}
                selectedAssetIds={selectedAssetIds}
                tileOnly
              />
            )}
          </div>
        </main>
      </div>
      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onUpdated={refresh}
        />
      )}
      {!library.loading && selectedAssets.length > 0 && (
        <div
          className="fixed bottom-8 left-1/2 z-[2400] flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#10131c]/95 p-1 text-slate-100 shadow-[0_18px_52px_rgba(0,0,0,0.45)] ring-1 ring-sky-300/10 backdrop-blur-xl"
          data-testid="asset-selection-floating-toolbar"
        >
          <span className="whitespace-nowrap px-2 text-xs font-bold text-sky-100">{selectedAssets.length} 个</span>
          <button aria-label="取消选择" className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 hover:bg-white/[0.08] hover:text-white" onClick={clearSelectedAssets} title="取消选择" type="button">
            <X size={18} />
          </button>
          <span className="h-5 w-px bg-white/10" />
          <button aria-label="全选" className="grid h-9 w-9 place-items-center rounded-xl text-sky-300 hover:bg-sky-300/10 hover:text-sky-100" onClick={selectAllVisibleAssets} title="全选" type="button">
            <CheckSquare size={18} />
          </button>
          <span className="h-5 w-px bg-white/10" />
          <button aria-label="收藏" className="grid h-9 w-9 place-items-center rounded-xl text-amber-300 hover:bg-amber-300/10 hover:text-amber-100" onClick={() => void favoriteSelectedAssets()} title="收藏" type="button">
            <Star size={18} />
          </button>
          <span className="h-5 w-px bg-white/10" />
          <button aria-label="下载原图" className="grid h-9 w-9 place-items-center rounded-xl text-emerald-300 hover:bg-emerald-300/10 hover:text-emerald-100" onClick={() => void downloadSelectedAssets()} title="下载原图" type="button">
            <Download size={18} />
          </button>
          <span className="h-5 w-px bg-white/10" />
          <button aria-label="删除" className="grid h-9 w-9 place-items-center rounded-xl text-red-300 hover:bg-red-400/10 hover:text-red-100" onClick={() => setConfirmingBulkDelete(true)} title="删除" type="button">
            <Trash2 size={18} />
          </button>
        </div>
      )}
      {confirmingBulkDelete && (
        <EntityConfirmDialog
          body={`将从素材库删除选中的 ${selectedAssets.length} 个素材。删除后不可在素材库中继续使用，确定要删除吗？`}
          confirmLabel={`确认删除 ${selectedAssets.length} 个素材`}
          onClose={() => setConfirmingBulkDelete(false)}
          onConfirm={bulkDeleteSelectedAssets}
          title="批量删除素材"
        />
      )}
    </section>
  );
}
