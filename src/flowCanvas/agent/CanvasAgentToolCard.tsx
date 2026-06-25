import React from "react";

import { CanvasAgentAssetRefStrip } from "./CanvasAgentAssetRefStrip";
import { CanvasAgentParameterCard } from "./CanvasAgentParameterCard";
import type {
  CanvasAgentContinuationAction,
  CanvasAgentToolAssetRef,
  CanvasAgentToolTimelineItem,
} from "./canvasAgentToolTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";

function getStatusText(status: CanvasAgentToolTimelineItem["status"]) {
  if (status === "running") return "Running";
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "failed") return "Failed";
  return "Completed";
}

function buildRunSummary(item: CanvasAgentToolTimelineItem) {
  const selection = item.estimate?.currentSelection ?? item.estimate?.draftSelection;
  if (!selection) return null;
  const sizeRatio = [
    selection.size,
    selection.aspectRatio,
    selection.n && selection.n > 1 ? `${selection.n} \u5f20` : null,
  ].filter(Boolean).join(" · ");
  const referenceCount = item.estimate?.referenceRefs?.length ?? 0;
  return {
    credits: selection.estimatedCredits ?? item.estimate?.totalCredits ?? null,
    model: selection.modelDisplayName ?? "Image model",
    referenceSummary: referenceCount > 0 ? `${referenceCount} references` : null,
    route: selection.routeLabel ?? "Selected line",
    sizeRatio,
  };
}

function getContinuationActions(): Array<{ key: CanvasAgentContinuationAction; label: string }> {
  return [
    { key: "continue-edit", label: "继续编辑" },
    { key: "make-variant", label: "做变体" },
    { key: "make-poster", label: "做海报" },
    { key: "compare", label: "做对比图" },
  ];
}

export function CanvasAgentToolCard(props: {
  item: CanvasAgentToolTimelineItem;
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onContinueFromAsset?: (
    asset: CanvasAgentToolAssetRef,
    action: CanvasAgentContinuationAction,
    assets?: CanvasAgentToolAssetRef[],
  ) => void;
  onSelectAssetRef?: (toolCallKey: string, refId: string) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  const { item } = props;
  const approval = item.status === "awaiting_approval";
  const canPlaceAssets = item.status === "succeeded" && item.assetRefs.length > 0;
  const canContinue = item.status === "succeeded" && item.assetRefs.length > 0;
  const approvalModels = item.estimate?.imageRunSettings ?? [];
  const runSummary = buildRunSummary(item);
  const primaryAsset = item.assetRefs.find((asset) => asset.refId === item.activeAssetRefId)
    ?? item.assetRefs[item.assetRefs.length - 1]
    ?? null;
  const selectedAssetRefIds = item.selectedAssetRefIds?.length
    ? item.selectedAssetRefIds
    : primaryAsset
      ? [primaryAsset.refId]
      : [];
  const selectedAssets = item.assetRefs.filter((asset) => selectedAssetRefIds.includes(asset.refId));
  const effectiveAssets = selectedAssets.length > 0 ? selectedAssets : primaryAsset ? [primaryAsset] : [];

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
          <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>{item.title}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>{getStatusText(item.status)}</div>
        </div>
      </div>

      {item.taskId ? <div style={{ color: "#64748b", fontSize: 11 }}>Task ID: {item.taskId}</div> : null}

      {runSummary ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{runSummary.model}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>{runSummary.route}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>
            {runSummary.sizeRatio}
            {runSummary.referenceSummary ? ` · ${runSummary.referenceSummary}` : ""}
          </div>
          {runSummary.credits !== null ? (
            <div style={{ color: "#facc15", fontSize: 11, fontWeight: 800 }}>
              Estimated credits {runSummary.credits}
            </div>
          ) : null}
        </div>
      ) : null}

      {item.estimate && approvalModels.length === 0 ? (
        <div style={{ color: "#facc15", fontSize: 12 }}>Estimated credits ready for confirmation.</div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <CanvasAgentAssetRefStrip assets={item.assetRefs} />
        {item.assetRefs.length > 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {item.assetRefs.map((asset) => {
              const selected = selectedAssetRefIds.includes(asset.refId);
              return (
                <button
                  key={asset.refId}
                  onClick={() => props.onSelectAssetRef?.(item.toolCallKey, asset.refId)}
                  style={{
                    background: selected ? "rgba(248,250,252,0.12)" : "transparent",
                    border: selected ? "1px solid rgba(248,250,252,0.65)" : "1px solid rgba(148,163,184,0.22)",
                    borderRadius: 999,
                    color: "#e2e8f0",
                    fontSize: 11,
                    padding: "4px 8px",
                  }}
                  type="button"
                >
                  {selected ? `已选 ${asset.label}` : `加入 ${asset.label}`}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {item.error ? <div style={{ color: "#fb7185", fontSize: 12 }}>{item.error}</div> : null}
      {item.placedNodeIds?.length ? <div style={{ color: "#86efac", fontSize: 12 }}>Placed on canvas.</div> : null}

      {approval && approvalModels.length > 0 ? (
        <CanvasAgentParameterCard
          models={approvalModels}
          onCancel={() => props.onCancel?.(item.toolCallKey)}
          onConfirm={(selection) => props.onApprove?.(item.toolCallKey, selection)}
          referenceRefs={item.estimate?.referenceRefs}
        />
      ) : null}

      {approval && approvalModels.length === 0 ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => props.onApprove?.(item.toolCallKey)} type="button">Approve</button>
          <button onClick={() => props.onCancel?.(item.toolCallKey)} type="button">Cancel</button>
        </div>
      ) : null}

      {canContinue && primaryAsset ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {getContinuationActions().map((action) => (
            <button
              key={action.key}
              onClick={() => props.onContinueFromAsset?.(primaryAsset, action.key, effectiveAssets)}
              type="button"
            >
              {effectiveAssets.length > 1 ? `基于已选 ${effectiveAssets.length} 张结果${action.label}` : action.label}
            </button>
          ))}
        </div>
      ) : null}

      {canPlaceAssets && !item.placedNodeIds?.length ? (
        <button onClick={() => props.onPlaceAssets?.(item.toolCallKey)} type="button">Place on canvas</button>
      ) : null}
    </article>
  );
}
