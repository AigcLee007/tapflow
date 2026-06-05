import React from "react";
import { Loader2 } from "lucide-react";

import type { AssetItem } from "./assetApi";
import { AssetCard } from "./AssetCard";

export function AssetGrid({
  assets,
  loading,
  onOpen,
}: {
  assets: AssetItem[];
  loading: boolean;
  onOpen: (asset: AssetItem) => void;
}) {
  if (loading) {
    return (
      <div className="grid min-h-72 place-items-center text-slate-400">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="animate-spin text-sky-300" size={18} />
          正在加载云端素材...
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="grid min-h-72 place-items-center rounded border border-dashed border-white/10 bg-white/[0.025] text-sm text-slate-500">
        暂无素材。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {assets.map((asset) => (
        <AssetCard asset={asset} key={asset.id} onOpen={onOpen} />
      ))}
    </div>
  );
}
