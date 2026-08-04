import type { CSSProperties, ReactNode } from "react";
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
): CSSProperties {
  const density = getPromptBarDensity(variant);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const isVideo = variant === "video";

  return {
    ...baseSurfaceStyle,
    top: `calc(100% + ${density.topGap}px)`,
    width: isVideo
      ? `min(calc(100vw - 32px), ${density.width})`
      : density.width,
    minHeight: density.minHeight,
    borderRadius: density.borderRadius,
    padding: density.padding,
    gap: density.gap,
    background: isVideo ? "#17171b" : baseSurfaceStyle.background,
    boxShadow: isVideo
      ? "0 18px 42px rgba(0,0,0,0.45)"
      : baseSurfaceStyle.boxShadow,
    backdropFilter: isVideo ? undefined : baseSurfaceStyle.backdropFilter,
    zIndex: isVideo ? 40 : 30,
    transform: `translateX(-50%) scale(${1 / safeZoom})`,
    transformOrigin: "top center",
  };
}

export function NodeEditorSurface({ ariaLabel, children, variant }: NodeEditorSurfaceProps) {
  const { zoom } = useViewport();

  return (
    <div
      aria-label={ariaLabel}
      className="nodrag nopan nowheel"
      data-node-editor-variant={variant}
      style={getNodeEditorSurfaceStyle(variant, zoom)}
    >
      {children}
    </div>
  );
}
