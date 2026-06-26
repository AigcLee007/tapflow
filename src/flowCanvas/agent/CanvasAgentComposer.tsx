import React, { useState } from "react";

import type { CanvasAgentArtifactRefChip } from "./agentArtifactRefs";

export function CanvasAgentComposer(props: {
  draftValue?: string;
  onChangeDraft?: (value: string) => void;
  disabled?: boolean;
  referenceRefs?: CanvasAgentArtifactRefChip[];
  onSend: (prompt: string) => Promise<void> | void;
}) {
  const [internalValue, setInternalValue] = useState("");
  const value = props.draftValue ?? internalValue;

  const updateValue = (nextValue: string) => {
    props.onChangeDraft?.(nextValue);
    if (props.draftValue === undefined) {
      setInternalValue(nextValue);
    }
  };

  const insertReference = (refId: string) => {
    const nextValue = value.trim().length > 0 ? `${value.trim()} ${refId}` : refId;
    updateValue(nextValue);
  };

  const handleSend = async () => {
    const prompt = value.trim();
    if (!prompt || props.disabled) return;
    updateValue("");
    await props.onSend(prompt);
  };

  return (
    <div
      style={{
        background: "rgba(10,10,15,0.96)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        gap: 10,
        padding: 14,
      }}
    >
      {props.referenceRefs?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {props.referenceRefs.map((ref) => (
            <button
              key={ref.refId}
              disabled={props.disabled}
              onClick={() => insertReference(ref.refId)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 999,
                color: "#f8fafc",
                cursor: props.disabled ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
              }}
              type="button"
            >
              {ref.label}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        disabled={props.disabled}
        onChange={(event) => updateValue(event.target.value)}
        placeholder="描述你想完成的生产任务，或引用当前画布内容..."
        rows={4}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          color: "#f8fafc",
          fontSize: 14,
          lineHeight: 1.5,
          outline: "none",
          padding: "12px 14px",
          resize: "none",
          width: "100%",
        }}
        value={value}
      />
      <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12 }}>
          Agent 会先生成计划，再由你确认执行。
        </div>
        <button
          disabled={props.disabled || !value.trim()}
          onClick={() => {
            void handleSend();
          }}
          style={{
            background: props.disabled || !value.trim() ? "rgba(255,255,255,0.08)" : "#f8fafc",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 19,
            color: props.disabled || !value.trim() ? "rgba(248,250,252,0.55)" : "#09090f",
            cursor: props.disabled || !value.trim() ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 800,
            height: 38,
            minWidth: 88,
          }}
          type="button"
        >
          发送
        </button>
      </div>
    </div>
  );
}
