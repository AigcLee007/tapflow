import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { VIDEO_UI_COPY } from "./videoUiCopy";

export const VIDEO_PARAMETER_POPOVER_Z_INDEX = 10020;

type AnchorRect = Pick<DOMRect, "bottom" | "left" | "right" | "top">;
type Size = { height: number; width: number };
type Position = { left: number; placement: "bottom" | "top"; top: number };

type VideoParameterPopoverProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  layerRef: React.MutableRefObject<HTMLElement | null>;
};

const VIEWPORT_MARGIN = 16;
const ANCHOR_GAP = 8;
const MAX_PANEL_WIDTH = 480;

export function getVideoParameterPopoverPosition(
  anchor: AnchorRect,
  viewport: Size,
  panel: Size,
): Position {
  const left = Math.min(
    Math.max(anchor.left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, viewport.width - panel.width - VIEWPORT_MARGIN),
  );
  const topPosition = anchor.top - ANCHOR_GAP - panel.height;
  if (topPosition >= VIEWPORT_MARGIN) {
    return { left, placement: "top", top: topPosition };
  }
  return {
    left,
    placement: "bottom",
    top: Math.min(
      anchor.bottom + ANCHOR_GAP,
      Math.max(VIEWPORT_MARGIN, viewport.height - panel.height - VIEWPORT_MARGIN),
    ),
  };
}

export function VideoParameterPopover({ anchorRef, children, layerRef }: VideoParameterPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const setPanelRef = useCallback((element: HTMLDivElement | null) => {
    panelRef.current = element;
    layerRef.current = element;
  }, [layerRef]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel || typeof window === "undefined") return;
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || Math.min(MAX_PANEL_WIDTH, Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2));
    const panelHeight = panelRect.height || Math.max(0, window.innerHeight - VIEWPORT_MARGIN * 2);
    setPosition(getVideoParameterPopoverPosition(
      anchor.getBoundingClientRect(),
      { height: window.innerHeight, width: window.innerWidth },
      { height: panelHeight, width: panelWidth },
    ));
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={setPanelRef}
      aria-label={VIDEO_UI_COPY.videoParameters}
      className="w-[min(480px,calc(100vw-32px))] overflow-y-auto rounded-[16px] border border-white/10 bg-[#1c1c20]/98 p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.58)] backdrop-blur-[18px]"
      data-placement={position?.placement ?? "top"}
      role="dialog"
      style={{
        left: position?.left ?? VIEWPORT_MARGIN,
        maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
        position: "fixed",
        top: position?.top ?? VIEWPORT_MARGIN,
        visibility: position ? "visible" : "hidden",
        zIndex: VIDEO_PARAMETER_POPOVER_Z_INDEX,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
