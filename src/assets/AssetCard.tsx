import React from "react";
import { File, Film, Image, Music, Star } from "lucide-react";

import type { AssetItem } from "./assetApi";

function iconFor(asset: AssetItem) {
  if (asset.kind === "image") return <Image size={20} />;
  if (asset.kind === "video") return <Film size={20} />;
  if (asset.kind === "audio") return <Music size={20} />;
  return <File size={20} />;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  if (kind === "document") return "文档";
  return kind;
}

export function AssetCard({
  asset,
  onOpen,
}: {
  asset: AssetItem;
  onOpen: (asset: AssetItem) => void;
}) {
  const title = asset.title || asset.originalFilename || "未命名素材";
  return (
    <button
      className="group overflow-hidden rounded border border-white/10 bg-white/[0.035] text-left shadow-lg shadow-black/10 transition hover:border-sky-300/40 hover:bg-white/[0.06]"
      onClick={() => onOpen(asset)}
      type="button"
    >
      <div className="relative aspect-[4/3] bg-zinc-950">
        {asset.previewUrl && asset.mimeType.startsWith("image/") ? (
          <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={asset.previewUrl} />
        ) : asset.previewUrl && asset.mimeType.startsWith("video/") ? (
          <video className="h-full w-full object-cover" muted preload="metadata" src={asset.previewUrl} />
        ) : (
          <div className="grid h-full place-items-center text-slate-500">{iconFor(asset)}</div>
        )}
        {asset.favorite && (
          <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-amber-200">
            <Star fill="currentColor" size={14} />
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium text-slate-100">{title}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{kindLabel(asset.kind)}</span>
          <span>{formatBytes(asset.sizeBytes)}</span>
        </div>
      </div>
    </button>
  );
}
