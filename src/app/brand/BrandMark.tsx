import React, { useId } from "react";

type BrandMarkSize = "compact" | "canvas" | "header" | "large";

const sizeClass: Record<BrandMarkSize, string> = {
  compact: "h-8 w-12",
  canvas: "h-12 w-[72px]",
  header: "h-20 w-[120px]",
  large: "h-40 w-60",
};

const INFINITY_PATH_D =
  "M 61 50 C 57 45, 52 38, 43 34 C 35 31, 27 35, 24 43 C 21 50, 24 58, 31 62 C 39 66, 47 62, 54 55 C 57 52, 59 50, 61 50 C 63 50, 66 52, 69 55 C 76 62, 84 66, 91 62 C 98 58, 101 50, 98 43 C 95 35, 87 31, 79 34 C 70 38, 65 45, 61 50 Z";

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
  const pathId = `brand-infinity-path-${useId().replace(/:/g, "")}`;

  return (
    <div
      className={["inline-flex items-center gap-3", className].join(" ").trim()}
      data-animated={animated ? "true" : "false"}
      data-size={size}
      data-testid="brand-mark"
    >
      <span
        className={[
          "brand-mark__orb brand-mark__orb--transparent grid shrink-0 place-items-center overflow-visible rounded-none",
          sizeClass[size],
        ].join(" ")}
        data-testid="brand-mark-orb"
      >
        <img
          alt="Aittco"
          className="brand-mark__logo h-full w-full object-contain"
          decoding="async"
          draggable={false}
          src="/logo-2.png"
        />
        {animated ? (
          <svg
            aria-hidden="true"
            className="brand-mark__infinity"
            data-testid="brand-mark-infinity"
            viewBox="0 0 122 100"
          >
            <defs>
              <path id={pathId} d={INFINITY_PATH_D} pathLength="100" />
              <radialGradient id={`${pathId}-pulse`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="45%" stopColor="rgba(125,211,252,0.52)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0)" />
              </radialGradient>
            </defs>

            <use className="brand-mark__infinity-base" href={`#${pathId}`} />
            <use className="brand-mark__infinity-aura" href={`#${pathId}`} />
            <use className="brand-mark__infinity-trail" href={`#${pathId}`} />

            <circle
              className="brand-mark__infinity-center-pulse"
              cx="61"
              cy="50"
              data-testid="brand-mark-infinity-center-pulse"
              fill={`url(#${pathId}-pulse)`}
              r="10"
            />

            <g data-testid="brand-mark-infinity-particle">
              <circle className="brand-mark__particle-tail brand-mark__particle-tail--far" cx="0" cy="0" r="4.8">
                <animateMotion begin="-0.36s" dur="2.25s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              <circle className="brand-mark__particle-tail brand-mark__particle-tail--near" cx="0" cy="0" r="5.8">
                <animateMotion begin="-0.18s" dur="2.25s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
              <circle className="brand-mark__particle-core" cx="0" cy="0" r="6.6">
                <animateMotion dur="2.25s" repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            </g>
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
