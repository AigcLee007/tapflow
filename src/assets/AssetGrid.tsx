import React from "react";
import { FileImage, Loader2, Music, UploadCloud, Video } from "lucide-react";

import type { AssetItem } from "./assetApi";
import type { AssetDateGroup } from "./assetLibraryView";
import { AssetGroupedSections } from "./AssetGroupedSections";

type SelectionBox = {
  currentPageX: number;
  currentPageY: number;
  startPageX: number;
  startPageY: number;
};

function rectsIntersect(rect: DOMRect, box: SelectionBox) {
  const minX = Math.min(box.startPageX, box.currentPageX);
  const maxX = Math.max(box.startPageX, box.currentPageX);
  const minY = Math.min(box.startPageY, box.currentPageY);
  const maxY = Math.max(box.startPageY, box.currentPageY);
  const rectLeft = rect.left + window.scrollX;
  const rectRight = rect.right + window.scrollX;
  const rectTop = rect.top + window.scrollY;
  const rectBottom = rect.bottom + window.scrollY;
  return (
    minX < rectRight + DRAG_SELECTION_HIT_SLOP_PX &&
    maxX > rectLeft - DRAG_SELECTION_HIT_SLOP_PX &&
    minY < rectBottom + DRAG_SELECTION_HIT_SLOP_PX &&
    maxY > rectTop - DRAG_SELECTION_HIT_SLOP_PX
  );
}

function getPagePoint(clientX: number, clientY: number) {
  return {
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
  };
}

function shouldIgnoreDragStart(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-asset-selectable='true']")) return false;
  return Boolean(target.closest("button, a, input, textarea, select, [role='menu'], [data-asset-actions='true']"));
}

const DRAG_SELECT_THRESHOLD_PX = 6;
const DRAG_SELECTION_HIT_SLOP_PX = 8;
const DRAG_SCROLL_THRESHOLD_PX = 44;
const DRAG_SCROLL_STEP_PX = 16;
function sameAssetIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((assetId, index) => assetId === b[index]);
}

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
  const dragStartRef = React.useRef<{ clientX: number; clientY: number; pageX: number; pageY: number; startedOnTile: boolean } | null>(null);
  const lastClientPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = React.useRef(false);
  const suppressNextOpenRef = React.useRef(false);
  const [selectionBox, setSelectionBox] = React.useState<SelectionBox | null>(null);

  const latestSelectedIdsRef = React.useRef<string[]>([]);
  const initialSelectedIdsRef = React.useRef<string[]>([]);
  const selectedAssetIdsRef = React.useRef(selectedAssetIds);
  const dragScrollIntervalRef = React.useRef<number | null>(null);
  const dragScrollDirectionRef = React.useRef<-1 | 1 | null>(null);

  React.useEffect(() => {
    selectedAssetIdsRef.current = selectedAssetIds;
  }, [selectedAssetIds]);

  const stopDragScroll = React.useCallback(() => {
    if (dragScrollIntervalRef.current != null) {
      window.clearInterval(dragScrollIntervalRef.current);
      dragScrollIntervalRef.current = null;
    }
    dragScrollDirectionRef.current = null;
  }, []);

  const startDragScroll = React.useCallback((direction: -1 | 1) => {
    if (dragScrollIntervalRef.current != null && dragScrollDirectionRef.current === direction) return;
    stopDragScroll();
    dragScrollDirectionRef.current = direction;
    dragScrollIntervalRef.current = window.setInterval(() => {
      window.scrollBy({ top: direction * DRAG_SCROLL_STEP_PX, behavior: "instant" });
    }, 16);
  }, [stopDragScroll]);

  const updateSelectionFromBox = React.useCallback((box: SelectionBox) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const nextSelectedIds = Array.from(surface.querySelectorAll<HTMLElement>("[data-asset-selectable='true']"))
      .filter((element) => rectsIntersect(element.getBoundingClientRect(), box))
      .map((element) => element.dataset.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));

    latestSelectedIdsRef.current = nextSelectedIds;
    if (!sameAssetIds(nextSelectedIds, Array.from(selectedAssetIdsRef.current))) {
      onSelectionChange?.(nextSelectedIds);
    }
  }, [onSelectionChange]);

  React.useEffect(() => {
    return () => {
      stopDragScroll();
      document.body.classList.remove("asset-drag-selecting");
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", stopSelecting);
      window.removeEventListener("pointercancel", stopSelecting);
      window.removeEventListener("scroll", handleWindowScroll, true);
    };
  }, []);

  const handleWindowPointerMove = React.useCallback((event: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const point = getPagePoint(event.clientX, event.clientY);
      lastClientPointRef.current = { x: event.clientX, y: event.clientY };
      const distance = Math.hypot(point.pageX - start.pageX, point.pageY - start.pageY);
      if (distance < DRAG_SELECT_THRESHOLD_PX && !hasDraggedRef.current) return;

      hasDraggedRef.current = true;
      suppressNextOpenRef.current = true;
      const nextBox = {
        currentPageX: point.pageX,
        currentPageY: point.pageY,
        startPageX: start.pageX,
        startPageY: start.pageY,
      };
      setSelectionBox(nextBox);
      updateSelectionFromBox(nextBox);
      event.preventDefault();

      if (event.clientY < DRAG_SCROLL_THRESHOLD_PX) {
        startDragScroll(-1);
      } else if (event.clientY > window.innerHeight - DRAG_SCROLL_THRESHOLD_PX) {
        startDragScroll(1);
      } else {
        stopDragScroll();
      }
  }, [updateSelectionFromBox]);

  const stopSelecting = React.useCallback((event?: PointerEvent) => {
    const start = dragStartRef.current;
    document.body.classList.remove("asset-drag-selecting");
    stopDragScroll();

    if (event && start && hasDraggedRef.current) {
      onSelectionChange?.(latestSelectedIdsRef.current);
    } else if (event && start && !start.startedOnTile && initialSelectedIdsRef.current.length > 0) {
      onSelectionChange?.([]);
    }

    dragStartRef.current = null;
    lastClientPointRef.current = null;
    hasDraggedRef.current = false;
    setSelectionBox(null);
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", stopSelecting);
    window.removeEventListener("pointercancel", stopSelecting);
    window.removeEventListener("scroll", handleWindowScroll, true);
  }, [handleWindowPointerMove, onSelectionChange, stopDragScroll]);

  const handleWindowScroll = React.useCallback(() => {
    const start = dragStartRef.current;
    const lastClientPoint = lastClientPointRef.current;
    if (!start || !lastClientPoint || !hasDraggedRef.current) return;
    const point = getPagePoint(lastClientPoint.x, lastClientPoint.y);
    const nextBox = {
      currentPageX: point.pageX,
      currentPageY: point.pageY,
      startPageX: start.pageX,
      startPageY: start.pageY,
    };
    setSelectionBox(nextBox);
    updateSelectionFromBox(nextBox);
  }, [updateSelectionFromBox]);

  const beginSelection = React.useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 || shouldIgnoreDragStart(event.target)) return;
    event.preventDefault();
    const point = getPagePoint(event.clientX, event.clientY);
    const target = event.target instanceof Element ? event.target : null;
    const startedOnTile = Boolean(target?.closest("[data-asset-selectable='true']"));
    dragStartRef.current = { clientX: event.clientX, clientY: event.clientY, pageX: point.pageX, pageY: point.pageY, startedOnTile };
    lastClientPointRef.current = { x: event.clientX, y: event.clientY };
    hasDraggedRef.current = false;
    latestSelectedIdsRef.current = Array.from(selectedAssetIdsRef.current);
    initialSelectedIdsRef.current = Array.from(selectedAssetIdsRef.current);
    document.body.classList.add("asset-drag-selecting");
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", stopSelecting);
    window.addEventListener("pointercancel", stopSelecting);
    window.addEventListener("scroll", handleWindowScroll, true);
  }, [handleWindowPointerMove, handleWindowScroll, stopSelecting]);

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
            height: Math.abs(selectionBox.currentPageY - selectionBox.startPageY),
            left: Math.min(selectionBox.startPageX, selectionBox.currentPageX) - window.scrollX,
            top: Math.min(selectionBox.startPageY, selectionBox.currentPageY) - window.scrollY,
            width: Math.abs(selectionBox.currentPageX - selectionBox.startPageX),
          }}
        />
      ) : null}
    </div>
  );
}
