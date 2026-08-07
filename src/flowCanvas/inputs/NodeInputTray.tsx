import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AudioLines, ChevronDown, ChevronUp, FileText, Image, Play, RotateCcw, Video, X } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import type { CanvasInputItem } from "./canvasInputProjection";

export type NodeInputTrayProps = {
  disabled?: boolean;
  items: CanvasInputItem[];
  onFocusSource?: (inputKey: string) => void;
  onRemove?: (inputKey: string) => void;
  onReorder?: (inputKeys: string[]) => void;
  onRetryPreview?: (inputKey: string) => void;
};

const MAX_VISIBLE_ITEMS = 8;

function formatDuration(durationMs?: number) {
  return durationMs === undefined ? null : `${(durationMs / 1000).toFixed(1)}s`;
}

function InputIcon({ kind }: Pick<CanvasInputItem, "kind">) {
  const className = "h-4 w-4";
  if (kind === "image") return <Image aria-hidden className={className} />;
  if (kind === "video") return <Video aria-hidden className={className} />;
  if (kind === "audio") return <AudioLines aria-hidden className={className} />;
  return <FileText aria-hidden className={className} />;
}

function reorderAfter(items: CanvasInputItem[], sourceKey: string, targetKey: string) {
  const nextKeys = items.map((item) => item.inputKey).filter((inputKey) => inputKey !== sourceKey);
  const targetIndex = nextKeys.indexOf(targetKey);
  if (targetIndex < 0) return null;
  nextKeys.splice(targetIndex + 1, 0, sourceKey);
  return nextKeys;
}

function moveInput(items: CanvasInputItem[], inputKey: string, direction: -1 | 1) {
  const keys = items.map((item) => item.inputKey);
  const fromIndex = keys.indexOf(inputKey);
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= keys.length) return null;
  [keys[fromIndex], keys[toIndex]] = [keys[toIndex], keys[fromIndex]];
  return keys;
}

function InputCard({
  disabled,
  item,
  onDragEnd,
  onDragStart,
  onDrop,
  onFocusSource,
  onRemove,
  onRetryPreview,
}: {
  disabled: boolean;
  item: CanvasInputItem;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, inputKey: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, inputKey: string) => void;
  onFocusSource?: (inputKey: string) => void;
  onRemove?: (inputKey: string) => void;
  onRetryPreview?: (inputKey: string) => void;
}) {
  const number = item.order + 1;
  const title = item.kind === "text" ? item.textExcerpt || item.title : item.title;
  const roleLabel = item.role === "first_frame" ? "首帧" : item.role === "last_frame" ? "尾帧" : String(number);
  const duration = (item.kind === "video" || item.kind === "audio") ? formatDuration(item.durationMs) : null;
  const canFocusSource = item.source === "upstream" && Boolean(onFocusSource) && !disabled;

  return (
    <div className="group relative h-[52px] w-[52px] shrink-0">
      <div
        aria-label={`输入 ${number}：${item.title}`}
        className="relative h-[52px] w-[52px] overflow-hidden rounded-[8px] border border-white/15 bg-white/[0.06] text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        draggable={!disabled}
        onDoubleClick={() => { if (canFocusSource) onFocusSource?.(item.inputKey); }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
        onDragStart={(event) => onDragStart(event, item.inputKey)}
        onDrop={(event) => onDrop(event, item.inputKey)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && canFocusSource) {
            event.preventDefault();
            onFocusSource?.(item.inputKey);
          }
        }}
        role={canFocusSource ? "button" : "group"}
        tabIndex={canFocusSource ? 0 : -1}
        title={title}
      >
        {item.previewUrl && item.kind !== "audio" ? <img alt="" className="h-full w-full object-cover" src={item.previewUrl} /> : <span className="flex h-full w-full items-center justify-center text-white/70"><InputIcon kind={item.kind} /></span>}
        {item.kind === "video" ? <Play aria-hidden className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" /> : null}
        <span className="absolute bottom-0 left-0 max-w-full truncate bg-black/65 px-1 text-[9px] font-bold leading-4 text-white">{roleLabel}</span>
        {duration ? <span className="absolute bottom-0 right-0 bg-black/65 px-1 text-[9px] leading-4 text-white">{duration}</span> : null}
        {item.previewState === "loading" ? <span aria-label={`加载预览 ${number}`} className="absolute inset-0 animate-pulse bg-white/10" /> : null}
        {item.previewState === "unavailable" ? <span aria-label={`预览不可用 ${number}`} className="absolute inset-0 flex items-center justify-center bg-black/35"><InputIcon kind={item.kind} /></span> : null}
      </div>
      {item.previewState === "error" && onRetryPreview ? <button aria-label={`重试预览 ${number}：${item.title}`} className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/60 text-white" disabled={disabled} onClick={(event) => { event.stopPropagation(); if (!disabled) onRetryPreview(item.inputKey); }} type="button"><RotateCcw aria-hidden className="h-4 w-4" /></button> : null}
      {onRemove ? <button aria-label={`移除输入 ${number}：${item.title}`} className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-[6px] bg-black/75 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed" disabled={disabled} onClick={(event) => { event.stopPropagation(); if (!disabled) onRemove(item.inputKey); }} type="button"><X aria-hidden className="h-3 w-3" /></button> : null}
    </div>
  );
}

export function NodeInputTray({ disabled = false, items, onFocusSource, onRemove, onReorder, onRetryPreview }: NodeInputTrayProps) {
  const draggedKey = useRef<string | null>(null);
  const overflowLayerId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const overflowLayer = useDismissibleLayer(`node-input-tray-overflow-${overflowLayerId}`);
  const [overflowFlyoutStyle, setOverflowFlyoutStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  const overflowItems = items.slice(MAX_VISIBLE_ITEMS);

  useLayoutEffect(() => {
    if (!overflowLayer.open) return;

    const positionFlyout = () => {
      const trigger = overflowLayer.triggerRef.current;
      const menu = overflowLayer.ref.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = 6;
      const inset = 8;
      const menuWidth = Math.max(menuRect.width, 208);
      const menuHeight = menuRect.height;
      const belowTop = triggerRect.bottom + gap;
      const belowSpace = viewportHeight - belowTop - inset;
      const aboveTop = triggerRect.top - gap - menuHeight;
      const shouldFlipAbove = belowSpace < menuHeight && triggerRect.top - gap - inset > belowSpace;
      const top = Math.max(inset, Math.min(shouldFlipAbove ? aboveTop : belowTop, viewportHeight - menuHeight - inset));
      const left = Math.max(inset, Math.min(triggerRect.right - menuWidth, viewportWidth - menuWidth - inset));
      setOverflowFlyoutStyle({ left, position: "fixed", top, visibility: "visible" });
    };

    positionFlyout();
    window.addEventListener("resize", positionFlyout);
    return () => window.removeEventListener("resize", positionFlyout);
  }, [overflowLayer.open, overflowLayer.ref, overflowLayer.triggerRef]);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, inputKey: string) => {
    if (disabled || !onReorder) { event.preventDefault(); return; }
    draggedKey.current = inputKey;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", inputKey);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetKey: string) => {
    event.preventDefault();
    if (disabled || !onReorder) return;
    const sourceKey = draggedKey.current;
    draggedKey.current = null;
    if (!sourceKey || sourceKey === targetKey) return;
    const nextKeys = reorderAfter(items, sourceKey, targetKey);
    if (nextKeys) onReorder(nextKeys);
  };

  const moveOverflowInput = (inputKey: string, direction: -1 | 1) => {
    if (disabled || !onReorder) return;
    const nextKeys = moveInput(items, inputKey, direction);
    if (nextKeys) onReorder(nextKeys);
  };

  return (
    <div aria-label="节点输入" className="flex items-center gap-1.5">
      {visibleItems.map((item) => <InputCard disabled={disabled} item={item} key={item.inputKey} onDragEnd={() => { draggedKey.current = null; }} onDragStart={handleDragStart} onDrop={handleDrop} onFocusSource={onFocusSource} onRemove={onRemove} onRetryPreview={onRetryPreview} />)}
      {overflowItems.length ? <div className="relative"><button aria-expanded={overflowLayer.open} aria-haspopup="menu" aria-label={`显示另外 ${overflowItems.length} 个输入`} className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[8px] border border-white/15 bg-white/[0.06] text-xs font-bold text-white hover:bg-white/[0.12]" onClick={overflowLayer.toggle} ref={overflowLayer.triggerRef as React.RefObject<HTMLButtonElement>} type="button">+{overflowItems.length}</button>
        {overflowLayer.open ? <MenuSurface aria-label="更多输入" className="z-50 w-[208px] max-h-[calc(100vh-96px)] overflow-x-hidden overflow-y-auto p-1" ref={overflowLayer.ref as React.RefObject<HTMLDivElement>} role="menu" style={overflowFlyoutStyle}>
          {overflowItems.map((item) => {
            const number = item.order + 1;
            const canFocus = item.source === "upstream" && Boolean(onFocusSource);
            return <div className="flex h-[38px] items-center gap-1 px-1" key={item.inputKey} role="none">
              {canFocus ? <button aria-label={`聚焦输入 ${number}：${item.title}`} className="min-w-0 flex-1 truncate rounded-[8px] px-2 text-left text-[12px] font-bold leading-[38px] text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" disabled={disabled} onClick={() => { if (!disabled) onFocusSource?.(item.inputKey); }} role="menuitem" type="button">输入 {number}：{item.title}</button> : <span className="min-w-0 flex-1 truncate px-2 text-[12px] font-bold text-white/70">输入 {number}：{item.title}</span>}
              {onReorder ? <><button aria-label={`上移输入 ${number}：${item.title}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:cursor-not-allowed" disabled={disabled || items[0]?.inputKey === item.inputKey} onClick={() => moveOverflowInput(item.inputKey, -1)} role="menuitem" title="上移" type="button"><ChevronUp aria-hidden className="h-4 w-4" /></button><button aria-label={`下移输入 ${number}：${item.title}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:cursor-not-allowed" disabled={disabled || items[items.length - 1]?.inputKey === item.inputKey} onClick={() => moveOverflowInput(item.inputKey, 1)} role="menuitem" title="下移" type="button"><ChevronDown aria-hidden className="h-4 w-4" /></button></> : null}
              {item.previewState === "error" && onRetryPreview ? <button aria-label={`重试预览 ${number}：${item.title}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:cursor-not-allowed" disabled={disabled} onClick={() => { if (!disabled) onRetryPreview(item.inputKey); }} role="menuitem" type="button"><RotateCcw aria-hidden className="h-4 w-4" /></button> : null}
              {onRemove ? <button aria-label={`移除输入 ${number}：${item.title}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:cursor-not-allowed" disabled={disabled} onClick={() => { if (!disabled) onRemove(item.inputKey); }} role="menuitem" type="button"><X aria-hidden className="h-4 w-4" /></button> : null}
            </div>;
          })}
        </MenuSurface> : null}
      </div> : null}
    </div>
  );
}
