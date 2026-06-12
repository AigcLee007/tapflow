import React from "react";

import { AssetGroupedSections, AssetMediaTabs } from "../../assets/AssetGroupedSections";
import { filterAssetsByMediaTab } from "../../assets/assetLibraryView";
import { useAssetLibrary } from "../../assets/useAssetLibrary";
import { CanvasDockEmptyState } from "./CanvasDockDrawer";

export function CanvasAssetPanel({
  onInsertAsset,
}: {
  onInsertAsset: (assetId: string) => void;
}) {
  const library = useAssetLibrary();

  const mediaCounts = {
    all: library.assets.length,
    image: filterAssetsByMediaTab(library.assets, "image").length,
    video: filterAssetsByMediaTab(library.assets, "video").length,
    audio: filterAssetsByMediaTab(library.assets, "audio").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AssetMediaTabs
        compact
        counts={mediaCounts}
        onSelectTab={library.setSelectedMediaTab}
        selectedTab={library.selectedMediaTab}
      />

      {library.loading ? <CanvasDockEmptyState message="姝ｅ湪鍔犺浇绱犳潗..." /> : null}
      {library.error ? <CanvasDockEmptyState message={library.error} /> : null}
      {!library.loading && !library.error && library.groupedAssets.length === 0 ? (
        <CanvasDockEmptyState message="褰撳墠鍒嗙被涓嬭繕娌℃湁绱犳潗锛岃鍒扮礌鏉愬簱涓婁紶鍚庡啀寮曠敤銆?" />
      ) : null}

      {!library.loading && !library.error && library.groupedAssets.length > 0 ? (
        <AssetGroupedSections
          compact
          emptyMessage="褰撳墠鍒嗙被涓嬭繕娌℃湁绱犳潗銆?"
          groups={library.groupedAssets}
          onOpen={(asset) => onInsertAsset(asset.id)}
          showActions={false}
        />
      ) : null}
    </div>
  );
}
