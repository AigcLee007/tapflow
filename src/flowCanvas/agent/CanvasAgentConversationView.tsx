import React from "react";

import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import { CanvasAgentTimeline } from "./CanvasAgentTimeline";

export function CanvasAgentConversationView(props: {
  busy: boolean;
  busyLabel?: string | null;
  items: AgentWorkspaceTimelineItem[];
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onContinueFromAsset?: (
    asset: CanvasAgentToolAssetRef,
    action: CanvasAgentContinuationAction,
    assets?: CanvasAgentToolAssetRef[],
  ) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  if (props.items.length === 0) {
    return (
      <div style={{ display: "grid", height: "100%", overflowY: "auto", padding: "18px 16px" }}>
        <section
          data-testid="agent-conversation-empty-state"
          style={{
            alignSelf: "end",
            background: "transparent",
            border: "1px dashed rgba(255,255,255,0.12)",
            borderRadius: 16,
            display: "grid",
            gap: 6,
            padding: "14px 12px",
          }}
        >
          <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>
            Pick nodes or describe the next canvas step.
          </div>
          <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12, lineHeight: 1.6 }}>
            Agent reads the current selection, proposes canvas edits, and waits before applying changes.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      data-testid="agent-conversation-stream"
      style={{ display: "grid", gap: 10, height: "100%", overflowY: "auto", padding: "14px 16px" }}
    >
      <CanvasAgentTimeline
        items={props.items}
        onApprove={props.onApprove}
        onCancel={props.onCancel}
        onContinueFromAsset={props.onContinueFromAsset}
        onPlaceAssets={props.onPlaceAssets}
      />
      {props.busy ? (
        <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12, paddingBottom: 4 }}>
          {props.busyLabel ?? "Agent is working on this turn..."}
        </div>
      ) : null}
    </div>
  );
}
