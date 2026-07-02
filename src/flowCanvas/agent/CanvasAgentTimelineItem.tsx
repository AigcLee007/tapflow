import React from "react";

import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import { CanvasAgentCanvasOpsCard } from "./CanvasAgentCanvasOpsCard";
import { CanvasAgentParameterCard } from "./CanvasAgentParameterCard";
import { CanvasAgentResultCard } from "./CanvasAgentResultCard";

export function CanvasAgentTimelineItem(props: {
  item: AgentWorkspaceTimelineItem;
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onContinueFromAsset?: (
    asset: CanvasAgentToolAssetRef,
    action: CanvasAgentContinuationAction,
    assets?: CanvasAgentToolAssetRef[],
  ) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  const { item } = props;

  if (item.kind === "message") {
    const isUser = item.role === "user";
    const roleLabel = isUser ? "你" : item.role === "assistant" ? "Agent" : "系统";
    return (
      <div
        style={{
          background: isUser ? "rgba(248,250,252,0.94)" : "rgba(255,255,255,0.05)",
          borderRadius: 18,
          color: isUser ? "#09090f" : "#f8fafc",
          display: "grid",
          gap: 6,
          justifySelf: isUser ? "end" : "stretch",
          lineHeight: 1.6,
          maxWidth: isUser ? "88%" : "100%",
          padding: "10px 14px 12px",
          whiteSpace: "pre-wrap",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.68 }}>{roleLabel}</div>
        <div style={{ fontSize: 13 }}>{item.content}</div>
      </div>
    );
  }

  if (item.kind === "status") {
    return (
      <div
        style={{
          background: item.state === "failed" ? "rgba(127,29,29,0.22)" : "rgba(59,130,246,0.1)",
          border: `1px solid ${item.state === "failed" ? "rgba(248,113,113,0.26)" : "rgba(96,165,250,0.22)"}`,
          borderRadius: 16,
          display: "grid",
          gap: 4,
          padding: "10px 12px",
        }}
      >
        <div style={{ color: item.state === "failed" ? "#fecaca" : "#dbeafe", fontSize: 12, fontWeight: 800 }}>
          {item.title}
        </div>
        {item.detail ? (
          <div style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, lineHeight: 1.5 }}>{item.detail}</div>
        ) : null}
      </div>
    );
  }

  if (item.kind === "parameter") {
    return (
      <CanvasAgentParameterCard
        models={item.models}
        onCancel={() => props.onCancel?.(item.toolCallKey)}
        onConfirm={(selection) => props.onApprove?.(item.toolCallKey, selection)}
        referenceRefs={item.referenceRefs}
      />
    );
  }

  if (item.kind === "canvas_ops") {
    return <CanvasAgentCanvasOpsCard onCancel={() => {}} ops={item.ops} />;
  }

  if (item.kind === "tool") {
    return (
      <div
        style={{
          background: "rgba(15,23,42,0.78)",
          border: "1px solid rgba(148,163,184,0.16)",
          borderRadius: 16,
          display: "grid",
          gap: 6,
          padding: 12,
        }}
      >
        <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>{item.title}</div>
        <div style={{ color: "rgba(226,232,240,0.74)", fontSize: 12, lineHeight: 1.5 }}>{item.summary}</div>
      </div>
    );
  }

  if (item.kind === "result") {
    return (
      <CanvasAgentResultCard
        assets={item.assets}
        onContinueFromAsset={props.onContinueFromAsset}
        onPlaceAssets={() => props.onPlaceAssets?.(item.toolCallKey)}
        placedNodeIds={item.placedNodeIds}
      />
    );
  }

  return (
    <div
      style={{
        background: "rgba(127,29,29,0.32)",
        border: "1px solid rgba(248,113,113,0.26)",
        borderRadius: 16,
        display: "grid",
        gap: 4,
        padding: 12,
      }}
    >
      <div style={{ color: "#fecaca", fontSize: 12, fontWeight: 800 }}>{item.title}</div>
      <div style={{ color: "#fecaca", fontSize: 12, lineHeight: 1.5 }}>{item.message}</div>
    </div>
  );
}
