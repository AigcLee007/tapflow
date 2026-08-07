import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IMAGE_MENU_SURFACE_Z_INDEX } from "../nodes/imageMenuStyles";
import type { CanvasInputItem } from "./canvasInputProjection";

export type MediaHoverPreviewProps = {
  item: CanvasInputItem;
  id?: string;
  open: boolean;
  onDismiss?: () => void;
  trigger: HTMLElement | null;
};

type PreviewPosition = {
  left: number;
  top: number;
};

const INSET = 8;
const GAP = 8;
const MAX_WIDTH = 420;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

function positionPreview(trigger: HTMLElement, preview: HTMLElement): PreviewPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const width = Math.min(previewRect.width || MAX_WIDTH, window.innerWidth - INSET * 2);
  const height = Math.min(previewRect.height || width, window.innerHeight - INSET * 2);
  const belowTop = triggerRect.bottom + GAP;
  const aboveTop = triggerRect.top - GAP - height;
  const belowSpace = window.innerHeight - belowTop - INSET;
  const top = belowSpace >= height || aboveTop < INSET ? belowTop : aboveTop;
  return {
    left: clamp(triggerRect.left, INSET, window.innerWidth - width - INSET),
    top: clamp(top, INSET, window.innerHeight - height - INSET),
  };
}

export function MediaHoverPreview({ id, item, open, onDismiss, trigger }: MediaHoverPreviewProps) {
  const generatedId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState<PreviewPosition | null>(null);
  const isVideo = item.kind === "video";
  const previewUrl = item.hoverPreviewUrl || item.previewUrl || item.thumbnailUrl;

  useLayoutEffect(() => {
    if (!open || !trigger || !previewRef.current) {
      setPosition(null);
      return;
    }
    const updatePosition = () => {
      if (previewRef.current) setPosition(positionPreview(trigger, previewRef.current));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, trigger, item.inputKey]);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !open) return;
    const playback = video.play();
    if (playback) void playback.catch(() => undefined);
    return () => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        // A detached media element can reject time updates in older browsers.
      }
    };
  }, [open, item.inputKey]);

  useEffect(() => {
    if (!open || !onDismiss) return;
    const shouldRestoreFocus = trigger instanceof HTMLElement && document.activeElement === trigger;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss();
      if (shouldRestoreFocus) requestAnimationFrame(() => trigger.focus());
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [onDismiss, open, trigger]);

  if (!open || !trigger || !previewUrl || (item.kind !== "image" && item.kind !== "video") || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-label={`预览 ${item.title}`}
      className="overflow-hidden rounded-[8px] border border-white/20 bg-[#161616] shadow-2xl"
      id={id ?? generatedId}
      ref={previewRef}
      role="tooltip"
      style={{
        left: position?.left ?? INSET,
        maxWidth: "min(420px, calc(100vw - 16px))",
        pointerEvents: "none",
        position: "fixed",
        top: position?.top ?? INSET,
        visibility: position ? "visible" : "hidden",
        zIndex: IMAGE_MENU_SURFACE_Z_INDEX + 1,
      }}
    >
      {isVideo ? (
        <video
          aria-label={`视频预览 ${item.title}`}
          className="block max-h-[min(320px,calc(100vh-16px))] w-full object-contain"
          muted
          playsInline
          poster={item.thumbnailUrl || item.previewUrl}
          preload="metadata"
          ref={videoRef}
          src={previewUrl}
        />
      ) : (
        <img alt={item.title} className="block max-h-[min(320px,calc(100vh-16px))] w-full object-contain" src={previewUrl} />
      )}
    </div>,
    document.body,
  );
}
