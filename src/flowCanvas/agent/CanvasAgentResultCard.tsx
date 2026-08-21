import React from "react";

import type { AgentResultAsset } from "./CanvasAgentWorkspaceTypes";
import type { CanvasAgentContinuationAction } from "./canvasAgentToolTypes";

const continuationActions: Array<{ action: CanvasAgentContinuationAction; label: string }> = [
  { action: "continue-edit", label: "继续编辑" },
  { action: "make-variant", label: "做变体" },
  { action: "make-poster", label: "做海报" },
  { action: "compare", label: "生成对比图" },
];

function getPreviewUrl(asset: AgentResultAsset) {
  const previewUrl = (asset as { previewUrl?: unknown }).previewUrl;
  return typeof previewUrl === "string" && previewUrl.trim() ? previewUrl : null;
}

function getAssetDimensions(asset: AgentResultAsset) {
  if (!asset.width || !asset.height) return null;
  return `${asset.width} × ${asset.height}`;
}

export function CanvasAgentResultCard(props: {
  assets: AgentResultAsset[];
  placedNodeIds?: string[];
  onContinueFromAsset?: (
    asset: AgentResultAsset,
    action: CanvasAgentContinuationAction,
    assets?: AgentResultAsset[],
  ) => void;
  onPlaceAssets?: () => void;
  onRetry?: () => void;
  onViewRun?: (workflowRunId?: string) => void;
  status?: "partial_success" | "succeeded";
  workflowRunId?: string;
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
        {props.status === "partial_success" ? (
          <div style={{ color: "#facc15", fontSize: 12, fontWeight: 800 }}>部分完成</div>
        ) : null}
        <div style={{ color: "rgba(226,232,240,0.7)", fontSize: 12 }}>
          {props.status === "partial_success" ? "部分完成，仍有失败步骤。" : `共返回 ${props.assets.length} 个可继续生产的结果。`}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {props.assets.map((asset) => {
          const previewUrl = getPreviewUrl(asset);
          const dimensions = getAssetDimensions(asset);
          return (
            <div
              key={asset.refId}
              style={{
                alignItems: "center",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "56px 1fr auto",
                minWidth: 0,
                padding: "10px 12px",
              }}
            >
              {previewUrl ? (
                <img
                  alt={asset.label}
                  src={previewUrl}
                  style={{ borderRadius: 10, height: 56, objectFit: "cover", width: 56 }}
                />
              ) : (
                <div
                  aria-label="结果缩略图占位"
                  style={{
                    background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(248,250,252,0.08))",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 10,
                    height: 56,
                    width: 56,
                  }}
                />
              )}
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700 }}>{asset.label}</div>
                <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
                  {asset.kind === "image" ? "图片结果" : "视频结果"}
                </div>
                {dimensions ? (
                  <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>{dimensions}</div>
                ) : null}
              </div>
              <div style={{ color: alreadyPlaced ? "#86efac" : "rgba(148,163,184,0.9)", fontSize: 11 }}>
                {alreadyPlaced ? "已放到画布" : "待放到画布"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {props.status === "partial_success" && props.onRetry ? (
          <button onClick={props.onRetry} style={actionButtonStyle()} type="button">
            重试失败步骤
          </button>
        ) : null}
        {alreadyPlaced ? (
          <span style={{ color: "#86efac", fontSize: 12, fontWeight: 700 }}>已放到画布</span>
        ) : (
          <button onClick={props.onPlaceAssets} style={actionButtonStyle()} type="button">
            放到画布
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
        {props.onViewRun ? <button onClick={() => props.onViewRun?.(props.workflowRunId)} style={actionButtonStyle(false)} type="button">查看运行</button> : null}
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
