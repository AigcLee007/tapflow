import React from "react";

import { BrandMark } from "./BrandMark";

type BrandTransitionVariant = "auth" | "workspace" | "canvas" | "assets";
type BrandTransitionMode = "fullscreen" | "inline";

export function BrandTransition({
  label,
  sublabel,
  variant = "workspace",
  mode = "fullscreen",
}: {
  label: string;
  sublabel?: string;
  variant?: BrandTransitionVariant;
  mode?: BrandTransitionMode;
}) {
  const frameClass =
    mode === "inline"
      ? "brand-transition relative grid min-h-64 place-items-center overflow-hidden bg-transparent text-white"
      : "brand-transition fixed inset-0 z-[1600] grid place-items-center overflow-hidden bg-[#06070b] text-white";

  return (
    <div
      aria-live="polite"
      className={frameClass}
      data-mode={mode}
      data-testid="brand-transition"
      data-variant={variant}
      role="status"
    >
      <div className="brand-transition__grid" />
      <div className="brand-transition__float" data-testid="brand-transition-core">
        <div className="brand-transition__pulse" />
        <BrandMark size="large" showCaption={false} className="brand-transition__mark" />
        <div className="brand-transition__label">{label}</div>
        {sublabel ? <div className="brand-transition__sublabel">{sublabel}</div> : null}
      </div>
    </div>
  );
}
