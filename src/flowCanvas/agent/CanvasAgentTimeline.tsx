import React from "react";

import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import { CanvasAgentTimelineItem } from "./CanvasAgentTimelineItem";

export function CanvasAgentTimeline(props: {
  items: AgentWorkspaceTimelineItem[];
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onContinueFromAsset?: (
    asset: CanvasAgentToolAssetRef,
    action: CanvasAgentContinuationAction,
    assets?: CanvasAgentToolAssetRef[],
  ) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
  onRetryTool?: (toolCallKey: string) => void;
  onViewRun?: (workflowRunId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {props.items.map((item) => (
        <CanvasAgentTimelineItem
          item={item}
          key={item.id}
          onApprove={props.onApprove}
          onCancel={props.onCancel}
          onContinueFromAsset={props.onContinueFromAsset}
          onPlaceAssets={props.onPlaceAssets}
          onRetryTool={props.onRetryTool}
          onViewRun={props.onViewRun}
        />
      ))}
    </div>
  );
}
