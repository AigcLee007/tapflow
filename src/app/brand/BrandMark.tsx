import React from "react";

type BrandMarkSize = "compact" | "canvas" | "large";

const sizeClass: Record<BrandMarkSize, string> = {
  compact: "h-9 w-9",
  canvas: "h-12 w-12",
  large: "h-20 w-20",
};

export function BrandMark({
  animated = false,
  className = "",
  showCaption = false,
  size = "canvas",
}: {
  animated?: boolean;
  className?: string;
  showCaption?: boolean;
  size?: BrandMarkSize;
}) {
  return (
    <div
      className={["inline-flex items-center gap-3", className].join(" ").trim()}
      data-animated={animated ? "true" : "false"}
      data-size={size}
      data-testid="brand-mark"
    >
      <span
        className={[
          "brand-mark__orb brand-mark__orb--bare grid shrink-0 place-items-center overflow-hidden rounded-full",
          sizeClass[size],
        ].join(" ")}
      >
        <img
          alt="Aittco"
          className="brand-mark__logo h-full w-full object-contain"
          decoding="async"
          draggable={false}
          src="/logo.png"
        />
        {animated ? (
          <svg
            aria-hidden="true"
            className="brand-mark__infinity"
            data-testid="brand-mark-infinity"
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id="brand-infinity-base" x1="0%" x2="100%" y1="50%" y2="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
              </linearGradient>
            </defs>
            <path
              className="brand-mark__infinity-base"
              d="M 24 50 C 24 38, 32 30, 42 30 C 50 30, 56 37, 61 44 C 66 37, 72 30, 80 30 C 90 30, 98 38, 98 50 C 98 62, 90 70, 80 70 C 72 70, 66 63, 61 56 C 56 63, 50 70, 42 70 C 32 70, 24 62, 24 50 Z"
              pathLength="100"
            />
            <path
              className="brand-mark__infinity-glow"
              d="M 24 50 C 24 38, 32 30, 42 30 C 50 30, 56 37, 61 44 C 66 37, 72 30, 80 30 C 90 30, 98 38, 98 50 C 98 62, 90 70, 80 70 C 72 70, 66 63, 61 56 C 56 63, 50 70, 42 70 C 32 70, 24 62, 24 50 Z"
              pathLength="100"
            />
          </svg>
        ) : null}
      </span>
      {showCaption ? (
        <span className="min-w-0 pr-1 text-sm font-extrabold leading-none text-white/92 tracking-normal">
          Aittco
        </span>
      ) : null}
    </div>
  );
}
