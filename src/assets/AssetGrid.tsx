import React from "react";
import { FileImage, Loader2, Music, UploadCloud, Video } from "lucide-react";

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
          正在加载素材...
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded bg-white text-slate-950">
            <UploadCloud size={24} />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-white">上传第一个素材</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            把常用图片、视频、音频和参考文件放进素材库，创作时可以在项目间复用。
          </p>
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { icon: FileImage, label: "上传图片" },
              { icon: Video, label: "上传视频" },
              { icon: Music, label: "上传音频" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="flex h-24 flex-col items-center justify-center gap-2 rounded border border-white/10 bg-black/20 text-sm font-medium text-slate-200"
                  key={item.label}
                >
                  <Icon className="text-sky-200" size={20} />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>
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
