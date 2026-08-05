import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useViewport } from "@xyflow/react";

import { getPromptBarDensity, type PromptBarDensityVariant } from "../utils/promptBarDensity";

export type NodeEditorSurfaceProps = {
  ariaLabel?: string;
  children: ReactNode;
  variant: PromptBarDensityVariant;
};

const baseSurfaceStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  background: "rgba(38,38,38,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
  backdropFilter: "blur(20px)",
  transition: "transform 0.1s ease-out",
};

export function getNodeEditorSurfaceStyle(
  variant: PromptBarDensityVariant,
  zoom: number,
  isNarrowViewport = false,
): CSSProperties {
  const density = getPromptBarDensity(variant);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const isVideo = variant === "video";
  const useNarrowVideoAnchor = isVideo && isNarrowViewport;

  return {
    ...baseSurfaceStyle,
    left: useNarrowVideoAnchor ? 0 : baseSurfaceStyle.left,
    top: `calc(100% + ${density.topGap}px)`,
    width: isVideo && isNarrowViewport
      ? "calc(100vw - 32px)"
      : density.width,
    minHeight: density.minHeight,
    borderRadius: density.borderRadius,
    padding: density.padding,
    gap: density.gap,
    background: baseSurfaceStyle.background,
    boxShadow: isVideo
      ? "0 18px 42px rgba(0,0,0,0.45)"
      : baseSurfaceStyle.boxShadow,
    backdropFilter: isVideo ? undefined : baseSurfaceStyle.backdropFilter,
    transition: isVideo ? "none" : baseSurfaceStyle.transition,
    zIndex: isVideo ? 40 : 30,
    transform: useNarrowVideoAnchor
      ? `scale(${1 / safeZoom})`
      : `translateX(-50%) scale(${1 / safeZoom})`,
    transformOrigin: useNarrowVideoAnchor ? "top left" : "top center",
  };
}

export function NodeEditorSurface({ ariaLabel, children, variant }: NodeEditorSurfaceProps) {
  const { zoom } = useViewport();
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 767px)");
    const sync = (event?: MediaQueryListEvent) => setIsNarrowViewport(event?.matches ?? query.matches);
    sync();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }
    query.addListener?.(sync);
    return () => query.removeListener?.(sync);
  }, []);

  return (
    <div
      aria-label={ariaLabel}
      className="nodrag nopan nowheel"
      data-node-editor-variant={variant}
      style={getNodeEditorSurfaceStyle(variant, zoom, isNarrowViewport)}
    >
      {children}
    </div>
  );
}
