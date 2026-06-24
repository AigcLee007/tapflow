import React from "react";

import { CanvasAgentToolCard } from "./CanvasAgentToolCard";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";

export function CanvasAgentToolTimeline(props: {
  items: CanvasAgentToolTimelineItem[];
  onApprove?: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel?: (toolCallKey: string) => void;
  onPlaceAssets?: (toolCallKey: string) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <section aria-label="Agent tool timeline" style={{ display: "grid", gap: 10 }}>
      {props.items.map((item) => (
        <CanvasAgentToolCard
          item={item}
          key={item.toolCallKey}
          onApprove={props.onApprove}
          onCancel={props.onCancel}
          onPlaceAssets={props.onPlaceAssets}
        />
      ))}
    </section>
  );
}
