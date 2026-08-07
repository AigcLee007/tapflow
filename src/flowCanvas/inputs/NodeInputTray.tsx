import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AudioLines, ChevronDown, ChevronUp, FileText, Image, Play, RotateCcw, Video, X } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { IMAGE_MENU_SURFACE_Z_INDEX } from "../nodes/imageMenuStyles";
import { VIDEO_UI_REFERENCE_ROLE_COPY } from "../video/videoUiCopy";
import type { CanvasInputItem } from "./canvasInputProjection";
import { MediaHoverPreview } from "./MediaHoverPreview";

export type NodeInputTrayProps = {
  disabled?: boolean;
  items: CanvasInputItem[];
  onFocusSource?: (inputKey: string) => void;
  onRemove?: (inputKey: string) => void;
  onRemoveAllText?: () => void;
  onReorder?: (inputKeys: string[]) => void;
  onRetryPreview?: (inputKey: string) => void;
};

const MAX_VISIBLE_CELLS = 8;
const menuButtonClass = "flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-white hover:bg-white/10 disabled:cursor-not-allowed";

function useAnchoredMenuStyle(open: boolean, triggerRef: React.RefObject<HTMLElement | null>, menuRef: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden", zIndex: IMAGE_MENU_SURFACE_Z_INDEX });

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const inset = 8;
      const gap = 6;
      const width = menuRect.width;
      const height = menuRect.height;
      const belowTop = triggerRect.bottom + gap;
      const belowSpace = window.innerHeight - belowTop - inset;
      const aboveTop = triggerRect.top - gap - height;
      const flipAbove = belowSpace < height && triggerRect.top - gap - inset > belowSpace;
      setStyle({
        left: Math.max(inset, Math.min(triggerRect.right - width, window.innerWidth - width - inset)),
        position: "fixed",
        top: Math.max(inset, Math.min(flipAbove ? aboveTop : belowTop, window.innerHeight - height - inset)),
        visibility: "visible",
        zIndex: IMAGE_MENU_SURFACE_Z_INDEX,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menuRef, open, triggerRef]);

  return style;
}

function formatDuration(durationMs?: number) {
  return durationMs === undefined ? null : `${(durationMs / 1000).toFixed(1)}s`;
}

function roleBadge(role?: CanvasInputItem["role"]) {
  if (role === "first_frame" || role === "last_frame") return VIDEO_UI_REFERENCE_ROLE_COPY[role];
  return null;
}

function InputIcon({ kind }: Pick<CanvasInputItem, "kind">) {
  const className = "h-4 w-4";
  if (kind === "image") return <Image aria-hidden className={className} />;
  if (kind === "video") return <Video aria-hidden className={className} />;
  if (kind === "audio") return <AudioLines aria-hidden className={className} />;
  return <FileText aria-hidden className={className} />;
}

function reorderAfter(items: CanvasInputItem[], sourceKey: string, targetKey: string) {
  const keys = items.map((item) => item.inputKey).filter((key) => key !== sourceKey);
  const target = keys.indexOf(targetKey);
  if (target < 0) return null;
  keys.splice(target + 1, 0, sourceKey);
  return keys;
}

function moveInput(items: CanvasInputItem[], inputKey: string, direction: -1 | 1) {
  const keys = items.map((item) => item.inputKey);
  const from = keys.indexOf(inputKey);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= keys.length) return null;
  [keys[from], keys[to]] = [keys[to], keys[from]];
  return keys;
}

function MediaInputCard({
  disabled,
  item,
  onDragEnd,
  onDragStart,
  onDrop,
  onHoverChange,
  onFocusSource,
  onRemove,
  onRetryPreview,
}: {
  disabled: boolean;
  item: CanvasInputItem;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, inputKey: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, inputKey: string) => void;
  onHoverChange: (item: CanvasInputItem | null, trigger: HTMLDivElement | null) => void;
  onFocusSource?: (inputKey: string) => void;
  onRemove?: (inputKey: string) => void;
  onRetryPreview?: (inputKey: string) => void;
}) {
  const suppressFocusPreviewRef = useRef(false);
  const number = item.order + 1;
  const duration = item.kind === "video" || item.kind === "audio" ? formatDuration(item.durationMs) : null;
  const badge = roleBadge(item.role);
  const visualUrl = item.thumbnailUrl || item.previewUrl;
  const hoverable = item.kind === "image" || item.kind === "video";
  const canFocus = item.source === "upstream" && Boolean(onFocusSource) && !disabled;
  const canPreview = hoverable && !disabled;
  const previewId = `media-preview-${item.inputKey}`;
  return (
    <div className="group relative h-[52px] w-[52px] shrink-0" data-testid="media-input-card">
      <div
        aria-label={`输入 ${number}：${item.title}`}
        className="relative h-[52px] w-[52px] overflow-hidden rounded-[8px] border border-white/15 bg-white/[0.06] text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        draggable={!disabled}
        onDragEnd={onDragEnd}
        onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
        onDragStart={(event) => onDragStart(event, item.inputKey)}
        onDrop={(event) => onDrop(event, item.inputKey)}
        aria-describedby={canPreview ? previewId : undefined}
        onClick={(event) => {
          if (canFocus) onFocusSource?.(item.inputKey);
          else if (canPreview) onHoverChange(item, event.currentTarget);
        }}
        onFocus={(event) => {
          if (suppressFocusPreviewRef.current) {
            suppressFocusPreviewRef.current = false;
            return;
          }
          if (hoverable) onHoverChange(item, event.currentTarget);
        }}
        onBlur={() => onHoverChange(null, null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            suppressFocusPreviewRef.current = true;
            onHoverChange(null, null);
            event.currentTarget.focus();
            window.setTimeout(() => { suppressFocusPreviewRef.current = false; }, 0);
            return;
          }
          if ((event.key === "Enter" || event.key === " ") && canFocus) {
            event.preventDefault();
            onFocusSource?.(item.inputKey);
          } else if ((event.key === "Enter" || event.key === " ") && canPreview) {
            event.preventDefault();
            onHoverChange(item, event.currentTarget);
          }
        }}
        onMouseEnter={(event) => { if (hoverable) onHoverChange(item, event.currentTarget); }}
        onMouseLeave={() => onHoverChange(null, null)}
        role={canFocus || canPreview ? "button" : "group"}
        tabIndex={canFocus || canPreview ? 0 : -1}
        title={item.title}
      >
        {visualUrl && item.kind !== "audio" ? <img alt="" className="h-full w-full object-cover" src={visualUrl} /> : <span className="flex h-full w-full items-center justify-center text-white/70"><InputIcon kind={item.kind} /></span>}
        {item.kind === "video" ? <Play aria-hidden className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" /> : null}
        {badge ? <span aria-label={`输入角色：${badge}`} className="absolute left-0 top-0 bg-cyan-400/90 px-1 text-[9px] font-bold leading-4 text-black">{badge}</span> : null}
        <span className="absolute bottom-0 left-0 max-w-full truncate bg-black/65 px-1 text-[9px] font-bold leading-4 text-white">{number}</span>
        {duration ? <span className="absolute bottom-0 right-0 bg-black/65 px-1 text-[9px] leading-4 text-white">{duration}</span> : null}
        {item.previewState === "loading" ? <span aria-label={`加载预览 ${number}`} className="absolute inset-0 animate-pulse bg-white/10" /> : null}
        {item.previewState === "unavailable" ? <span aria-label={`预览不可用 ${number}`} className="absolute inset-0 flex items-center justify-center bg-black/35"><InputIcon kind={item.kind} /></span> : null}
      </div>
      {item.previewState === "error" && onRetryPreview ? <button aria-label={`重试预览 ${number}：${item.title}`} className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/60 text-white" disabled={disabled} onClick={() => { if (!disabled) onRetryPreview(item.inputKey); }} type="button"><RotateCcw aria-hidden className="h-4 w-4" /></button> : null}
      {onRemove ? <button aria-label={`移除输入 ${number}：${item.title}`} className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-[6px] bg-black/75 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed" disabled={disabled} onClick={(event) => { event.stopPropagation(); if (!disabled) onRemove(item.inputKey); }} type="button"><X aria-hidden className="h-3 w-3" /></button> : null}
    </div>
  );
}

export function NodeInputTray({ disabled = false, items, onFocusSource, onRemove, onRemoveAllText, onReorder, onRetryPreview }: NodeInputTrayProps) {
  const draggedKey = useRef<string | null>(null);
  const closeTextMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layerId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const textLayer = useDismissibleLayer(`node-input-tray-text-${layerId}`);
  const overflowLayer = useDismissibleLayer(`node-input-tray-overflow-${layerId}`);
  const textMenuStyle = useAnchoredMenuStyle(textLayer.open, textLayer.triggerRef, textLayer.ref);
  const overflowMenuStyle = useAnchoredMenuStyle(overflowLayer.open, overflowLayer.triggerRef, overflowLayer.ref);
  const [hovered, setHovered] = useState<{ item: CanvasInputItem; trigger: HTMLElement } | null>(null);
  const textItems = items.filter((item) => item.kind === "text");
  const mediaItems = items.filter((item) => item.kind !== "text");
  const visibleMediaCount = MAX_VISIBLE_CELLS - (textItems.length ? 1 : 0);
  const visibleMediaItems = mediaItems.slice(0, visibleMediaCount);
  const overflowItems = mediaItems.slice(visibleMediaCount);

  useEffect(() => {
    if (!textItems.length) textLayer.closeLayer();
  }, [textItems.length, textLayer.closeLayer]);

  useEffect(() => {
    if (!overflowItems.length) overflowLayer.closeLayer();
  }, [overflowItems.length, overflowLayer.closeLayer]);

  useEffect(() => () => {
    if (closeTextMenuTimer.current) clearTimeout(closeTextMenuTimer.current);
  }, []);

  const openTextMenu = () => {
    if (closeTextMenuTimer.current) clearTimeout(closeTextMenuTimer.current);
    if (!disabled) textLayer.openLayer();
  };
  const closeTextMenuLater = () => {
    if (closeTextMenuTimer.current) clearTimeout(closeTextMenuTimer.current);
    closeTextMenuTimer.current = setTimeout(() => textLayer.closeLayer(), 160);
  };
  const dragStart = (event: React.DragEvent<HTMLDivElement>, inputKey: string) => {
    if (disabled || !onReorder) { event.preventDefault(); return; }
    draggedKey.current = inputKey;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", inputKey);
  };
  const drop = (event: React.DragEvent<HTMLDivElement>, targetKey: string) => {
    event.preventDefault();
    if (disabled || !onReorder) return;
    const sourceKey = draggedKey.current;
    draggedKey.current = null;
    if (!sourceKey || sourceKey === targetKey) return;
    const next = reorderAfter(mediaItems, sourceKey, targetKey);
    if (next) onReorder(next);
  };
  const move = (inputKey: string, direction: -1 | 1) => {
    if (disabled || !onReorder) return;
    const next = moveInput(mediaItems, inputKey, direction);
    if (next) onReorder(next);
  };

  const textMenu = textLayer.open && typeof document !== "undefined" ? createPortal(
    <MenuSurface aria-label="文本输入节点" className="w-[260px] max-h-[calc(100vh-96px)] overflow-x-hidden overflow-y-auto p-1" onMouseEnter={openTextMenu} onMouseLeave={closeTextMenuLater} ref={textLayer.ref as React.RefObject<HTMLDivElement>} role="menu" style={textMenuStyle}>
      {textItems.map((item) => (
        <div className="flex h-[38px] items-center gap-1 px-1" key={item.inputKey} role="none">
          <button aria-label={`聚焦文本输入 ${item.title}`} className="min-w-0 flex-1 truncate rounded-[8px] px-2 text-left text-[12px] font-bold leading-[38px] text-white hover:bg-white/10" disabled={disabled || !onFocusSource} onClick={() => { if (!disabled) onFocusSource?.(item.inputKey); }} role="menuitem" type="button" title={item.textExcerpt || item.title}>{item.title}</button>
          {onRemove ? <button aria-label={`移除输入 ${item.title}`} className={menuButtonClass} disabled={disabled} onClick={() => { if (!disabled) onRemove(item.inputKey); }} type="button"><X aria-hidden className="h-4 w-4" /></button> : null}
        </div>
      ))}
      {onRemoveAllText ? <button aria-label="移除全部文本输入" className="flex h-[38px] w-full items-center gap-2 rounded-[10px] px-2 text-left text-[12px] font-bold text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed" disabled={disabled} onClick={() => { if (!disabled) onRemoveAllText(); }} role="menuitem" type="button"><X aria-hidden className="h-4 w-4" />移除全部文本输入</button> : null}
    </MenuSurface>,
    document.body,
  ) : null;

  const overflowMenu = overflowLayer.open && typeof document !== "undefined" ? createPortal(
    <MenuSurface aria-label="更多输入" className="w-[208px] max-h-[calc(100vh-96px)] overflow-x-hidden overflow-y-auto p-1" ref={overflowLayer.ref as React.RefObject<HTMLDivElement>} role="menu" style={overflowMenuStyle}>
      {overflowItems.map((item) => {
        const number = item.order + 1;
        const index = mediaItems.findIndex((candidate) => candidate.inputKey === item.inputKey);
        const canFocus = item.source === "upstream" && Boolean(onFocusSource) && !disabled;
        return <div className="flex h-[38px] items-center gap-1 px-1" key={item.inputKey} role="none">{canFocus ? <button aria-label={`聚焦输入 ${number}：${item.title}`} className="min-w-0 flex-1 truncate rounded-[8px] px-2 text-left text-[12px] font-bold leading-[38px] text-white hover:bg-white/10" onClick={() => onFocusSource?.(item.inputKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onFocusSource?.(item.inputKey); } }} role="menuitem" type="button">输入 {number}：{item.title}</button> : <span className="min-w-0 flex-1 truncate px-2 text-[12px] font-bold text-white/70">输入 {number}：{item.title}</span>}{onReorder ? <><button aria-label={`上移输入 ${number}：${item.title}`} className={menuButtonClass} disabled={disabled || index === 0} onClick={() => move(item.inputKey, -1)} type="button"><ChevronUp aria-hidden className="h-4 w-4" /></button><button aria-label={`下移输入 ${number}：${item.title}`} className={menuButtonClass} disabled={disabled || index === mediaItems.length - 1} onClick={() => move(item.inputKey, 1)} type="button"><ChevronDown aria-hidden className="h-4 w-4" /></button></> : null}{onRemove ? <button aria-label={`移除输入 ${number}：${item.title}`} className={menuButtonClass} disabled={disabled} onClick={() => { if (!disabled) onRemove(item.inputKey); }} type="button"><X aria-hidden className="h-4 w-4" /></button> : null}</div>;
      })}
    </MenuSurface>,
    document.body,
  ) : null;

  return <>
    <div aria-label="节点输入" className="flex items-center gap-1.5">
      {textItems.length ? <button aria-expanded={textLayer.open} aria-haspopup="menu" aria-label={`文本输入，共 ${textItems.length} 个节点`} className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[8px] border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed" disabled={disabled} onClick={textLayer.toggle} onMouseEnter={openTextMenu} onMouseLeave={closeTextMenuLater} ref={textLayer.triggerRef as React.RefObject<HTMLButtonElement>} type="button"><FileText aria-hidden className="h-4 w-4" /><span className="text-[11px] font-bold">{textItems.length}</span></button> : null}
      {visibleMediaItems.map((item) => <MediaInputCard disabled={disabled} item={item} key={item.inputKey} onDragEnd={() => { draggedKey.current = null; }} onDragStart={dragStart} onDrop={drop} onFocusSource={onFocusSource} onHoverChange={(nextItem, trigger) => setHovered(nextItem && trigger ? { item: nextItem, trigger } : null)} onRemove={onRemove} onRetryPreview={onRetryPreview} />)}
      {overflowItems.length ? <button aria-expanded={overflowLayer.open} aria-haspopup="menu" aria-label={`显示另外 ${overflowItems.length} 个输入`} className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[8px] border border-white/15 bg-white/[0.06] text-xs font-bold text-white hover:bg-white/[0.12] disabled:cursor-not-allowed" disabled={disabled} onClick={overflowLayer.toggle} ref={overflowLayer.triggerRef as React.RefObject<HTMLButtonElement>} type="button">+{overflowItems.length}</button> : null}
    </div>
    {textMenu}
    {overflowMenu}
    {hovered ? <MediaHoverPreview id={`media-preview-${hovered.item.inputKey}`} item={hovered.item} onDismiss={() => setHovered(null)} open trigger={hovered.trigger} /> : null}
  </>;
}
