import React from "react";

import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

export function CanvasAgentReferenceChips(props: {
  chips: AgentReferenceChip[];
  disabled?: boolean;
  onInsertRef?: (chip: AgentReferenceChip) => void;
}) {
  if (props.chips.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {props.chips.map((chip) => (
        <button
          aria-label={chip.label}
          disabled={props.disabled}
          key={chip.id}
          onClick={() => props.onInsertRef?.(chip)}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            color: "#f8fafc",
            cursor: props.disabled ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 700,
            opacity: props.disabled ? 0.58 : 1,
            padding: "4px 10px",
          }}
          type="button"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
