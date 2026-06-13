import React from "react";

type BrandMarkSize = "compact" | "canvas" | "large";

const sizeClass: Record<BrandMarkSize, string> = {
  compact: "h-9 w-9",
  canvas: "h-12 w-12",
  large: "h-16 w-16",
};

export function BrandMark({
  className = "",
  showCaption = false,
  size = "canvas",
}: {
  className?: string;
  showCaption?: boolean;
  size?: BrandMarkSize;
}) {
  return (
    <div
      className={[
        "brand-mark inline-flex items-center gap-3 rounded-[18px] border border-white/12 bg-black/42 p-2 shadow-[0_16px_38px_rgba(0,0,0,0.42)] backdrop-blur-md",
        className,
      ].join(" ")}
      data-size={size}
      data-testid="brand-mark"
    >
      <span
        className={[
          "brand-mark__orb grid shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white/[0.04]",
          sizeClass[size],
        ].join(" ")}
      >
        <img
          alt="Aittco"
          className="h-full w-full object-contain p-1.5 drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]"
          decoding="async"
          draggable={false}
          src="/logo.png"
        />
      </span>
      {showCaption ? (
        <span className="min-w-0 pr-1 text-sm font-extrabold leading-none text-white/92 tracking-normal">
          Aittco
        </span>
      ) : null}
    </div>
  );
}
