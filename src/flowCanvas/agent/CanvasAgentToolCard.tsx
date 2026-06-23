import React from "react";

import { CanvasAgentAssetRefStrip } from "./CanvasAgentAssetRefStrip";
import type { CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";

function getStatusText(status: CanvasAgentToolTimelineItem["status"]) {
  if (status === "running") return "Running";
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "failed") return "Failed";
  return "Completed";
}

export function CanvasAgentToolCard(props: {
  item: CanvasAgentToolTimelineItem;
  onApprove?: (toolCallKey: string) => void;
  onCancel?: (toolCallKey: string) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  const approval = props.item.status === "awaiting_approval";
  const canPlaceAssets = props.item.status === "succeeded" && props.item.assetRefs.length > 0;
  return (
    <article
      style={{
        background: "rgba(15,23,42,0.72)",
        border: "1px solid rgba(148,163,184,0.16)",
        borderRadius: 16,
        display: "grid",
        gap: 10,
        padding: 12,
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>{props.item.title}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>{getStatusText(props.item.status)}</div>
        </div>
      </div>
      {props.item.estimate ? (
        <div style={{ color: "#facc15", fontSize: 12 }}>Estimated credits ready for confirmation.</div>
      ) : null}
      <CanvasAgentAssetRefStrip assets={props.item.assetRefs} />
      {props.item.error ? <div style={{ color: "#fb7185", fontSize: 12 }}>{props.item.error}</div> : null}
      {props.item.placedNodeIds?.length ? (
        <div style={{ color: "#86efac", fontSize: 12 }}>Placed on canvas.</div>
      ) : null}
      {approval ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => props.onApprove?.(props.item.toolCallKey)} type="button">Approve</button>
          <button onClick={() => props.onCancel?.(props.item.toolCallKey)} type="button">Cancel</button>
        </div>
      ) : null}
      {canPlaceAssets && !props.item.placedNodeIds?.length ? (
        <button onClick={() => props.onPlaceAssets?.(props.item.toolCallKey)} type="button">Place on canvas</button>
      ) : null}
    </article>
  );
}
