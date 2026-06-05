import React, { useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { useAuth } from "../auth/useAuth";
import type { AssetItem } from "./assetApi";
import { AssetFolderSidebar } from "./AssetFolderSidebar";
import { AssetGrid } from "./AssetGrid";
import { AssetPreviewModal } from "./AssetPreviewModal";
import { UploadAssetButton } from "./UploadAssetButton";
import { useAssetLibrary } from "./useAssetLibrary";

export function AssetLibraryPage() {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const library = useAssetLibrary();
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);

  const identityKey =
    authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous";

  React.useEffect(() => {
    setPreviewAsset(null);
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

  const refresh = () => {
    void library.refresh();
  };

  return (
    <section className="min-h-[calc(100vh-92px)] overflow-hidden rounded border border-white/10 bg-[#0b0d14]">
      <div className="flex flex-col md:flex-row">
        <AssetFolderSidebar
          folders={library.folders}
          onCreated={refresh}
          onSelect={library.setSelectedFolderId}
          selectedFolderId={library.selectedFolderId}
        />
        <main className="min-w-0 flex-1 p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-sky-300">素材库</div>
              <h1 className="mt-2 text-2xl font-semibold text-white">云端素材库</h1>
              <p className="mt-2 text-sm text-slate-500">共 {library.total} 个云端素材</p>
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
                onClick={refresh}
                type="button"
              >
                <RefreshCw size={16} />
                刷新
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
            <AssetGrid assets={library.assets} loading={library.loading} onOpen={setPreviewAsset} />
          </div>
        </main>
      </div>
      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onUpdated={() => {
            refresh();
          }}
        />
      )}
    </section>
  );
}
