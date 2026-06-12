import React from "react";
import { Search } from "lucide-react";

import { UploadAssetButton } from "../../assets/UploadAssetButton";
import { AssetGroupedSections, AssetMediaTabs } from "../../assets/AssetGroupedSections";
import { filterAssetsByMediaTab } from "../../assets/assetLibraryView";
import { useAssetLibrary } from "../../assets/useAssetLibrary";
import { CanvasDockEmptyState } from "./CanvasDockDrawer";

export function CanvasAssetPanel({
  onInsertAsset,
  projectId,
}: {
  onInsertAsset: (assetId: string) => void;
  projectId?: string | null;
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ position: "relative", display: "block", flex: 1, minWidth: 0 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: "#8b8b95" }} />
          <input
            className="nodrag nopan"
            onChange={(event) => library.setQuery(event.target.value)}
            placeholder="搜索素材"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#f8fafc",
              fontSize: 14,
              outline: "none",
              padding: "0 14px 0 38px",
            }}
            value={library.query}
          />
        </label>
        <UploadAssetButton
          onUploaded={() => {
            void library.refresh();
          }}
          projectId={projectId}
          variant="compact"
        />
      </div>

      <AssetMediaTabs
        compact
        counts={mediaCounts}
        onSelectTab={library.setSelectedMediaTab}
        selectedTab={library.selectedMediaTab}
      />

      {library.loading ? <CanvasDockEmptyState message="正在加载素材..." /> : null}
      {library.error ? <CanvasDockEmptyState message={library.error} /> : null}
      {!library.loading && !library.error && library.groupedAssets.length === 0 ? (
        <CanvasDockEmptyState
          action={
            <UploadAssetButton
              onUploaded={() => {
                void library.refresh();
              }}
              projectId={projectId}
              variant="compact"
            />
          }
          message="当前分类下还没有素材，上传图片、视频或音频后会出现在这里。"
        />
      ) : null}

      {!library.loading && !library.error && library.groupedAssets.length > 0 ? (
        <AssetGroupedSections
          compact
          emptyMessage="当前分类下还没有素材。"
          groups={library.groupedAssets}
          onOpen={(asset) => onInsertAsset(asset.id)}
        />
      ) : null}
    </div>
  );
}
