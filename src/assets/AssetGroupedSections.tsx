import React from "react";
import { Film, Image, Music } from "lucide-react";

import type { AssetItem } from "./assetApi";
import type { AssetDateGroup, AssetMediaTab } from "./assetLibraryView";
import { AssetCard } from "./AssetCard";

const TAB_OPTIONS: Array<{ label: string; value: AssetMediaTab }> = [
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "音频", value: "audio" },
];

export function AssetMediaTabs({
  counts,
  selectedTab,
  onSelectTab,
  compact = false,
}: {
  counts: Record<AssetMediaTab, number>;
  selectedTab: AssetMediaTab;
  onSelectTab: (tab: AssetMediaTab) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "sleek-scroll-x" : undefined}
      style={{
        display: "flex",
        gap: compact ? 10 : 10,
        overflowX: compact ? "auto" : "visible",
        paddingBottom: compact ? 2 : 0,
      }}
    >
      {TAB_OPTIONS.map((tab) => {
        const active = selectedTab === tab.value;
        return (
          <button
            key={tab.value}
            className="nodrag nopan"
            onClick={() => onSelectTab(tab.value)}
            style={{
              height: compact ? 42 : 34,
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 999,
              background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
              color: active ? "#ffffff" : "#d4d4d8",
              fontSize: compact ? 15 : 13,
              fontWeight: 700,
              padding: compact ? "0 16px" : "0 14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            type="button"
          >
            {tab.label}
            <span style={{ marginLeft: 8, color: active ? "#f4f4f5" : "#8a8a95" }}>{counts[tab.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AssetGroupedSections({
  compact = false,
  emptyMessage,
  groups,
  onOpen,
}: {
  compact?: boolean;
  emptyMessage: string;
  groups: AssetDateGroup[];
  onOpen: (asset: AssetItem) => void;
}) {
  if (groups.length === 0) {
    return (
      <div
        style={{
          minHeight: compact ? 180 : 240,
          display: "grid",
          placeItems: "center",
          border: compact ? "none" : "1px dashed rgba(255,255,255,0.1)",
          borderRadius: compact ? 0 : 16,
          background: compact ? "transparent" : "rgba(255,255,255,0.025)",
          color: "#94a3b8",
          fontSize: compact ? 12 : 13,
          textAlign: "center",
          padding: compact ? "18px 0" : "24px",
        }}
      >
        <div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12, color: "#64748b" }}>
            <Image size={18} />
            <Film size={18} />
            <Music size={18} />
          </div>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 18 : 22 }}>
      {groups.map((group) => (
        <section key={group.dateLabel} style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 12 }}>
          <div
            style={{
              color: "rgba(255,255,255,0.96)",
              fontSize: compact ? 17 : 14,
              fontWeight: 700,
              letterSpacing: 0,
              paddingLeft: compact ? 2 : 0,
            }}
          >
            {group.dateLabel}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))",
              gap: compact ? 14 : 14,
            }}
          >
            {group.items.map((asset) => (
              <AssetCard asset={asset} compact={compact} key={asset.id} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
