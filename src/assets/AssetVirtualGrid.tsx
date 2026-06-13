import React from "react";

import { AssetCard } from "./AssetCard";
import type { AssetItem } from "./assetApi";

export function AssetVirtualGrid({
  items,
  limit = 36,
  ...cardProps
}: {
  items: AssetItem[];
  limit?: number;
} & Omit<React.ComponentProps<typeof AssetCard>, "asset">) {
  const [visibleCount, setVisibleCount] = React.useState(() => Math.min(limit, items.length));

  React.useEffect(() => {
    setVisibleCount(Math.min(limit, items.length));
  }, [items.length, limit]);

  const visibleItems = items.slice(0, visibleCount);

  return (
    <>
      {visibleItems.map((asset) => (
        <AssetCard asset={asset} key={asset.id} {...cardProps} />
      ))}
      {visibleCount < items.length ? (
        <button
          className="h-full min-h-32 rounded border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          onClick={() => setVisibleCount((current) => Math.min(current + limit, items.length))}
          type="button"
        >
          加载更多
        </button>
      ) : null}
    </>
  );
}
