import React from "react";
import { FileImage, Loader2, Music, UploadCloud, Video } from "lucide-react";

import type { AssetItem } from "./assetApi";
import type { AssetDateGroup } from "./assetLibraryView";
import { AssetGroupedSections } from "./AssetGroupedSections";

export function AssetGrid({
  emptyMessage,
  groups,
  loading,
  onAddToFolder,
  onDelete,
  onDownload,
  onRename,
  onToggleFavorite,
  onOpen,
  folders,
}: {
  emptyMessage: string;
  folders?: Array<{ id: string; name: string }>;
  groups: AssetDateGroup[];
  loading: boolean;
  onAddToFolder?: (asset: AssetItem, folderId: string) => Promise<void>;
  onDelete?: (asset: AssetItem) => Promise<void>;
  onDownload?: (asset: AssetItem) => Promise<void>;
  onRename?: (asset: AssetItem, title: string) => Promise<void>;
  onToggleFavorite?: (asset: AssetItem) => Promise<void>;
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

  if (groups.length === 0) {
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
          <p className="mt-5 text-sm text-slate-500">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <AssetGroupedSections
      emptyMessage={emptyMessage}
      folders={folders}
      groups={groups}
      onAddToFolder={onAddToFolder}
      onDelete={onDelete}
      onDownload={onDownload}
      onOpen={onOpen}
      onRename={onRename}
      onToggleFavorite={onToggleFavorite}
    />
  );
}
