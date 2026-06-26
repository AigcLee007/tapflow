import React from "react";

import type { AgentResultAsset } from "./CanvasAgentWorkspaceTypes";
import type { CanvasAgentContinuationAction } from "./canvasAgentToolTypes";

const continuationActions: Array<{ action: CanvasAgentContinuationAction; label: string }> = [
  { action: "continue-edit", label: "继续编辑" },
  { action: "make-variant", label: "做变体" },
  { action: "make-poster", label: "做海报" },
  { action: "compare", label: "生成对比图" },
];

export function CanvasAgentResultCard(props: {
  assets: AgentResultAsset[];
  placedNodeIds?: string[];
  onContinueFromAsset?: (
    asset: AgentResultAsset,
    action: CanvasAgentContinuationAction,
    assets?: AgentResultAsset[],
  ) => void;
  onPlaceAssets?: () => void;
}) {
  const primaryAsset = props.assets[0] ?? null;
  if (!primaryAsset) return null;

  const alreadyPlaced = (props.placedNodeIds?.length ?? 0) > 0;

  return (
    <article
      style={{
        background: "rgba(15,23,42,0.78)",
        border: "1px solid rgba(148,163,184,0.16)",
        borderRadius: 18,
        display: "grid",
        gap: 12,
        padding: 14,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>生成结果</div>
        <div style={{ color: "rgba(226,232,240,0.7)", fontSize: 12 }}>
          共返回 {props.assets.length} 个可继续生产的结果。
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {props.assets.map((asset) => (
          <div
            key={asset.refId}
            style={{
              alignItems: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700 }}>{asset.label}</div>
              <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
                {asset.kind === "image" ? "图片结果" : "视频结果"}
              </div>
            </div>
            <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>{asset.refId}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {alreadyPlaced ? (
          <span style={{ color: "#86efac", fontSize: 12, fontWeight: 700 }}>已放入画布</span>
        ) : (
          <button onClick={props.onPlaceAssets} style={actionButtonStyle()} type="button">
            放入画布
          </button>
        )}
        {continuationActions.map((item) => (
          <button
            key={item.action}
            onClick={() => props.onContinueFromAsset?.(primaryAsset, item.action, props.assets)}
            style={actionButtonStyle(false)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function actionButtonStyle(primary = true): React.CSSProperties {
  return {
    background: primary ? "#f8fafc" : "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    color: primary ? "#09090f" : "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    minHeight: 36,
    padding: "0 12px",
  };
}
