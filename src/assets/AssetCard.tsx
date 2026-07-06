import React from "react";
import { Check, File, Film, Image, MoreHorizontal, Music, Star } from "lucide-react";

import { EntityActionMenu, EntityConfirmDialog, EntityRenameDialog } from "../components/EntityActionMenu";
import type { AssetItem } from "./assetApi";

const ASSET_LIBRARY_DRAG_TYPE = "application/x-tapflow-asset-id";

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
  compact = false,
  folders = [],
  onAddToFolder,
  onDelete,
  onDownload,
  onOpen,
  onPointerDown,
  onRename,
  onToggleFavorite,
  selected = false,
  showActions = true,
  tileOnly = false,
}: {
  asset: AssetItem;
  compact?: boolean;
  folders?: Array<{ id: string; name: string }>;
  onAddToFolder?: (asset: AssetItem, folderId: string) => Promise<void>;
  onDelete?: (asset: AssetItem) => Promise<void>;
  onDownload?: (asset: AssetItem) => Promise<void>;
  onOpen: (asset: AssetItem) => void;
  onPointerDown?: (event: React.PointerEvent, asset: AssetItem) => void;
  onRename?: (asset: AssetItem, title: string) => Promise<void>;
  onToggleFavorite?: (asset: AssetItem) => Promise<void>;
  selected?: boolean;
  showActions?: boolean;
  tileOnly?: boolean;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const title = asset.title || asset.originalFilename || "未命名素材";
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(ASSET_LIBRARY_DRAG_TYPE, asset.id);
    event.dataTransfer.setData("text/plain", asset.id);
  };
  const menuItems = [
    {
      key: "preview",
      label: "预览",
      onSelect: () => {
        setMenuOpen(false);
        setMoving(false);
        onOpen(asset);
      },
    },
    ...(onRename
      ? [
          {
            key: "rename",
            label: "重命名",
            onSelect: () => {
              setMenuOpen(false);
              setMoving(false);
              setRenaming(true);
            },
          },
        ]
      : []),
    ...(onToggleFavorite
      ? [
          {
            key: "favorite",
            label: asset.favorite ? "取消收藏" : "收藏",
            onSelect: () => {
              setMenuOpen(false);
              setMoving(false);
              void onToggleFavorite(asset);
            },
          },
        ]
      : []),
    ...(onAddToFolder
      ? [
          {
            disabled: folders.length === 0,
            key: "move",
            label: "移动到文件夹",
            onSelect: () => setMoving(true),
            separatorBefore: true,
          },
        ]
      : []),
    ...(onDownload
      ? [
          {
            key: "download",
            label: "下载原图",
            onSelect: () => {
              setMenuOpen(false);
              setMoving(false);
              void onDownload(asset);
            },
          },
        ]
      : []),
    ...(onDelete
      ? [
          {
            danger: true,
            key: "delete",
            label: "删除",
            onSelect: () => {
              setMenuOpen(false);
              setMoving(false);
              setConfirmingDelete(true);
            },
            separatorBefore: true,
          },
        ]
      : []),
  ];

  return (
    <article
      className={
        compact || tileOnly
          ? `group relative overflow-visible rounded-[18px] border bg-[#11131a] text-left shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition hover:bg-[#151822] ${
              selected ? "border-sky-300 ring-2 ring-sky-300/70" : "border-white/8 hover:border-white/16"
            }`
          : `group relative overflow-visible rounded border bg-white/[0.035] text-left shadow-lg shadow-black/10 transition hover:bg-white/[0.06] ${
              selected ? "border-sky-300 ring-2 ring-sky-300/60" : "border-white/10 hover:border-sky-300/40"
            }`
      }
      style={{ minWidth: 0 }}
    >
      <button
        aria-label={title}
        aria-selected={selected}
        className="block w-full text-left"
        data-asset-id={asset.id}
        data-asset-selectable="true"
        draggable
        onClick={() => onOpen(asset)}
        onDragStart={handleDragStart}
        onPointerDown={(event) => {
          onPointerDown?.(event, asset);
          if (event.defaultPrevented) {
            event.stopPropagation();
          }
        }}
        type="button"
      >
        <div
          className="relative overflow-hidden bg-zinc-950"
          style={{
            aspectRatio: compact || tileOnly ? "1 / 1" : "4 / 3",
            borderRadius: compact || tileOnly ? 18 : undefined,
          }}
        >
          {asset.previewUrl && asset.mimeType.startsWith("image/") ? (
            <img
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              draggable={false}
              loading="lazy"
              src={asset.previewUrl}
            />
          ) : asset.previewUrl && asset.mimeType.startsWith("video/") ? (
            <video className="h-full w-full object-cover" draggable={false} muted preload="metadata" src={asset.previewUrl} />
          ) : (
            <div className="grid h-full place-items-center text-slate-500">{iconFor(asset)}</div>
          )}
          {asset.favorite && (
            <span className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-amber-200">
              <Star fill="currentColor" size={14} />
            </span>
          )}
          {selected && (
            <span className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-100/70 bg-sky-300 text-slate-950 shadow-lg shadow-sky-950/40">
              <Check size={15} strokeWidth={3} />
            </span>
          )}
        </div>
        {compact || tileOnly ? null : (
          <div className="p-3">
            <div className="truncate text-sm font-medium text-slate-100">{title}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{kindLabel(asset.kind)}</span>
              <span>{formatBytes(asset.sizeBytes)}</span>
            </div>
          </div>
        )}
      </button>
      {showActions && (
        <div className="absolute right-2 top-2" data-asset-actions="true">
          <button
            aria-label={`管理素材 ${title}`}
            className="grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/85 opacity-90 transition hover:bg-black/75 hover:text-white"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen((open) => !open);
              setMoving(false);
            }}
            ref={menuButtonRef}
            type="button"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <EntityActionMenu
              anchorRef={menuButtonRef}
              density={compact ? "compact" : "default"}
              items={menuItems}
              onClose={() => {
                setMenuOpen(false);
                setMoving(false);
              }}
            />
          )}
          {menuOpen && moving && (
            <div className="absolute right-[252px] top-0 z-[90] w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#242424] py-2 text-sm font-medium text-slate-100 shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
              {folders.map((folder) => (
                <button
                  aria-label={`移动到 ${folder.name}`}
                  className="flex h-10 w-full items-center px-4 text-left hover:bg-white/[0.07]"
                  key={folder.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void onAddToFolder?.(asset, folder.id);
                    setMenuOpen(false);
                    setMoving(false);
                  }}
                  type="button"
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {renaming && (
        <EntityRenameDialog
          defaultValue={title}
          label="素材名称"
          onClose={() => setRenaming(false)}
          onSubmit={(value) => onRename?.(asset, value)}
          title="重命名素材"
        />
      )}
      {confirmingDelete && (
        <EntityConfirmDialog
          body={`删除后素材会从素材库移除。确定删除「${title}」吗？`}
          confirmLabel="确认删除"
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => onDelete?.(asset)}
          title="删除素材"
        />
      )}
    </article>
  );
}
