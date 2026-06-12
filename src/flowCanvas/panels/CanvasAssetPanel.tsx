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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ position: "relative", display: "block", flex: 1, minWidth: 0 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#71717a" }} />
          <input
            className="nodrag nopan"
            onChange={(event) => library.setQuery(event.target.value)}
            placeholder="搜索素材"
            style={{
              width: "100%",
              height: 32,
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.055)",
              color: "#f8fafc",
              fontSize: 12,
              outline: "none",
              padding: "0 10px 0 30px",
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

      <div className="sleek-scroll-x" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <button
          className="nodrag nopan"
          onClick={() => library.setSelectedFolderId(null)}
          style={folderChip(!library.selectedFolderId)}
          type="button"
        >
          全部
        </button>
        {library.folders.map((folder) => (
          <button
            key={folder.id}
            className="nodrag nopan"
            onClick={() => library.setSelectedFolderId(folder.id)}
            style={folderChip(library.selectedFolderId === folder.id)}
            type="button"
          >
            {folder.name}
          </button>
        ))}
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

function folderChip(active: boolean): React.CSSProperties {
  return {
    height: 26,
    border: "none",
    borderRadius: 999,
    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.055)",
    color: active ? "#fff" : "#a1a1aa",
    fontSize: 11,
    fontWeight: 650,
    padding: "0 10px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}
