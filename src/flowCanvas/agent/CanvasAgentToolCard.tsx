import React from "react";

import { CanvasAgentAssetRefStrip } from "./CanvasAgentAssetRefStrip";
import { CanvasAgentParameterCard } from "./CanvasAgentParameterCard";
import type { CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";

function getStatusText(status: CanvasAgentToolTimelineItem["status"]) {
  if (status === "running") return "Running";
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "failed") return "Failed";
  return "Completed";
}

function buildRunSummary(item: CanvasAgentToolTimelineItem) {
  const selection = item.estimate?.currentSelection;
  if (!selection) return null;
  const sizeRatio = [selection.size, selection.aspectRatio].filter(Boolean).join(" · ");
  const referenceCount = item.estimate?.referenceRefs?.length ?? 0;
  return {
    model: selection.modelDisplayName,
    referenceSummary: referenceCount > 0 ? `${referenceCount} references` : null,
    route: selection.routeLabel,
    sizeRatio,
  };
}

export function CanvasAgentToolCard(props: {
  item: CanvasAgentToolTimelineItem;
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  const approval = props.item.status === "awaiting_approval";
  const canPlaceAssets = props.item.status === "succeeded" && props.item.assetRefs.length > 0;
  const approvalModels = props.item.estimate?.imageRunSettings ?? [];
  const runSummary = buildRunSummary(props.item);
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
      {props.item.taskId ? (
        <div style={{ color: "#64748b", fontSize: 11 }}>Task ID: {props.item.taskId}</div>
      ) : null}
      {runSummary ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{runSummary.model}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>{runSummary.route}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>
            {runSummary.sizeRatio}
            {runSummary.referenceSummary ? ` · ${runSummary.referenceSummary}` : ""}
          </div>
        </div>
      ) : null}
      {props.item.estimate && approvalModels.length === 0 ? (
        <div style={{ color: "#facc15", fontSize: 12 }}>Estimated credits ready for confirmation.</div>
      ) : null}
      <CanvasAgentAssetRefStrip assets={props.item.assetRefs} />
      {props.item.error ? <div style={{ color: "#fb7185", fontSize: 12 }}>{props.item.error}</div> : null}
      {props.item.placedNodeIds?.length ? (
        <div style={{ color: "#86efac", fontSize: 12 }}>Placed on canvas.</div>
      ) : null}
      {approval && approvalModels.length > 0 ? (
        <CanvasAgentParameterCard
          models={approvalModels}
          onCancel={() => props.onCancel?.(props.item.toolCallKey)}
          onConfirm={(selection) => props.onApprove?.(props.item.toolCallKey, selection)}
          referenceRefs={props.item.estimate?.referenceRefs}
        />
      ) : null}
      {approval && approvalModels.length === 0 ? (
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
