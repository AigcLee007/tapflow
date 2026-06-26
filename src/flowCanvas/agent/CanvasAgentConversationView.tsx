import React from "react";

import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import { CanvasAgentTimeline } from "./CanvasAgentTimeline";

export function CanvasAgentConversationView(props: {
  busy: boolean;
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
      <div style={{ display: "grid", gap: 16, height: "100%", overflowY: "auto", padding: 16 }}>
        <section
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 22,
            display: "grid",
            gap: 10,
            padding: 18,
          }}
        >
          <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 800 }}>TapFlow Agent</div>
          <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: 1.7 }}>
            One canvas, every production step
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            {[
              "试试：生成一张动物运动会海报",
              "把选中的图片做成三张风格变体",
              "基于刚才的结果继续做电商主图",
            ].map((suggestion) => (
              <div
                key={suggestion}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  color: "#e2e8f0",
                  fontSize: 12,
                  padding: "10px 12px",
                }}
              >
                {suggestion}
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 16 }}>
      <CanvasAgentTimeline
        items={props.items}
        onApprove={props.onApprove}
        onCancel={props.onCancel}
        onContinueFromAsset={props.onContinueFromAsset}
        onPlaceAssets={props.onPlaceAssets}
      />
      {props.busy ? (
        <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12, paddingBottom: 4 }}>
          Agent 正在继续处理这一轮任务...
        </div>
      ) : null}
    </div>
  );
}
