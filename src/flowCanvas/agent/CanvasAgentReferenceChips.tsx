import React from "react";
import { X } from "lucide-react";

import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

export function CanvasAgentReferenceChips(props: {
  chips: AgentReferenceChip[];
  disabled?: boolean;
  onInsertRef?: (chip: AgentReferenceChip) => void;
  onRemoveRef?: (chip: AgentReferenceChip) => void;
  removableKinds?: AgentReferenceChip["kind"][];
}) {
  if (props.chips.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {props.chips.map((chip) => {
        const removable = props.removableKinds?.includes(chip.kind) ?? false;

        return (
          <div
            key={chip.id}
            style={{
              alignItems: "center",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              display: "inline-flex",
              opacity: props.disabled ? 0.58 : 1,
              overflow: "hidden",
            }}
          >
            <button
              aria-label={chip.label}
              disabled={props.disabled}
              onClick={() => props.onInsertRef?.(chip)}
              style={{
                alignItems: "center",
                background: "transparent",
                border: 0,
                color: "#f8fafc",
                cursor: props.disabled ? "not-allowed" : "pointer",
                display: "inline-flex",
                fontSize: 12,
                fontWeight: 700,
                gap: 6,
                minHeight: 28,
                padding: chip.previewUrl ? "3px 8px 3px 4px" : "4px 10px",
              }}
              type="button"
            >
              {chip.previewUrl ? (
                <img
                  alt=""
                  aria-hidden="true"
                  src={chip.previewUrl}
                  style={{
                    borderRadius: 999,
                    height: 22,
                    objectFit: "cover",
                    width: 22,
                  }}
                />
              ) : null}
              <span>{chip.label}</span>
            </button>

            {removable ? (
              <button
                aria-label={`移除 ${chip.label}`}
                disabled={props.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onRemoveRef?.(chip);
                }}
                style={{
                  alignItems: "center",
                  alignSelf: "stretch",
                  background: "rgba(255,255,255,0.04)",
                  border: 0,
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(248,250,252,0.72)",
                  cursor: props.disabled ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  justifyContent: "center",
                  padding: "0 7px",
                }}
                type="button"
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
