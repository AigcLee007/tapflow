import React, { useState } from "react";

export function CanvasAgentComposer(props: {
  disabled?: boolean;
  onSend: (prompt: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");

  const handleSend = async () => {
    const prompt = value.trim();
    if (!prompt || props.disabled) return;
    setValue("");
    await props.onSend(prompt);
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10,10,15,0.96)",
      }}
    >
      <textarea
        disabled={props.disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder="描述你想完成的生产任务，或引用当前画布内容..."
        rows={4}
        style={{
          width: "100%",
          resize: "none",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
          color: "#f8fafc",
          padding: "12px 14px",
          fontSize: 14,
          lineHeight: 1.5,
          outline: "none",
        }}
        value={value}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12 }}>
          Agent 会先生成计划，再由你确认执行。
        </div>
        <button
          disabled={props.disabled || !value.trim()}
          onClick={() => {
            void handleSend();
          }}
          style={{
            minWidth: 88,
            height: 38,
            borderRadius: 19,
            border: "1px solid rgba(255,255,255,0.08)",
            background: props.disabled || !value.trim() ? "rgba(255,255,255,0.08)" : "#f8fafc",
            color: props.disabled || !value.trim() ? "rgba(248,250,252,0.55)" : "#09090f",
            fontSize: 13,
            fontWeight: 800,
            cursor: props.disabled || !value.trim() ? "not-allowed" : "pointer",
          }}
          type="button"
        >
          发送
        </button>
      </div>
    </div>
  );
}
