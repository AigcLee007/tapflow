import React from "react";
import { FileImage, Loader2, Music, UploadCloud, Video } from "lucide-react";

import type { AssetItem } from "./assetApi";
import type { AssetDateGroup } from "./assetLibraryView";
import { AssetGroupedSections } from "./AssetGroupedSections";

type SelectionBox = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function rectsIntersect(a: DOMRect, b: SelectionBox) {
  const right = b.left + b.width;
  const bottom = b.top + b.height;
  return a.left < right && a.right > b.left && a.top < bottom && a.bottom > b.top;
}

function getSelectionBox(start: { x: number; y: number }, current: { x: number; y: number }): SelectionBox {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  return {
    height: Math.abs(current.y - start.y),
    left,
    top,
    width: Math.abs(current.x - start.x),
  };
}

function shouldIgnoreDragStart(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, input, textarea, select, [role='menu'], [data-asset-actions='true']"));
}

const DRAG_SELECT_THRESHOLD_PX = 6;

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
  onSelectionChange,
  selectedAssetIds = new Set<string>(),
  tileOnly = false,
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
  onSelectionChange?: (assetIds: string[]) => void;
  selectedAssetIds?: Set<string>;
  tileOnly?: boolean;
}) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const suppressNextOpenRef = React.useRef(false);
  const [selectionBox, setSelectionBox] = React.useState<SelectionBox | null>(null);

  const updateSelectionFromBox = React.useCallback((box: SelectionBox) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const selectedIds = Array.from(surface.querySelectorAll<HTMLElement>("[data-asset-selectable='true']"))
      .filter((element) => rectsIntersect(element.getBoundingClientRect(), box))
      .map((element) => element.dataset.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    onSelectionChange?.(selectedIds);
  }, [onSelectionChange]);

  React.useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", stopSelecting);
      window.removeEventListener("pointercancel", stopSelecting);
    };
  }, []);

  const handleWindowPointerMove = React.useCallback((event: PointerEvent) => {
      if (!dragStartRef.current) return;
      const nextBox = getSelectionBox(dragStartRef.current, { x: event.clientX, y: event.clientY });
      if (Math.max(nextBox.width, nextBox.height) >= DRAG_SELECT_THRESHOLD_PX) {
        suppressNextOpenRef.current = true;
      }
      setSelectionBox(nextBox);
      updateSelectionFromBox(nextBox);
  }, [updateSelectionFromBox]);

  const stopSelecting = React.useCallback(() => {
    dragStartRef.current = null;
    setSelectionBox(null);
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", stopSelecting);
    window.removeEventListener("pointercancel", stopSelecting);
  }, [handleWindowPointerMove]);

  const beginSelection = React.useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 || shouldIgnoreDragStart(event.target)) return;
    event.preventDefault();
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    const nextBox = getSelectionBox(dragStartRef.current, dragStartRef.current);
    setSelectionBox(nextBox);
    onSelectionChange?.([]);
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", stopSelecting);
    window.addEventListener("pointercancel", stopSelecting);
  }, [handleWindowPointerMove, onSelectionChange, stopSelecting]);

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
    <div
      className="relative select-none"
      data-testid="asset-selection-surface"
      onPointerDown={beginSelection}
      ref={surfaceRef}
    >
      <AssetGroupedSections
        emptyMessage={emptyMessage}
        folders={folders}
        groups={groups}
        onAddToFolder={onAddToFolder}
        onDelete={onDelete}
        onDownload={onDownload}
        onOpen={(asset) => {
          if (suppressNextOpenRef.current) {
            suppressNextOpenRef.current = false;
            return;
          }
          onOpen(asset);
        }}
        onPointerDown={beginSelection}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        selectedAssetIds={selectedAssetIds}
        tileOnly={tileOnly}
        virtualize
      />
      {selectionBox ? (
        <div
          className="pointer-events-none fixed z-[1500] rounded border border-sky-300/90 bg-sky-300/15 shadow-[0_0_0_1px_rgba(14,165,233,0.16)]"
          style={{
            height: selectionBox.height,
            left: selectionBox.left,
            top: selectionBox.top,
            width: selectionBox.width,
          }}
        />
      ) : null}
    </div>
  );
}
