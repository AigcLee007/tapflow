import React from "react";

export function CanvasAgentTaskCard(props: {
  detail?: string | null;
  status: "error" | "idle" | "running" | "success";
  title: string;
}) {
  const accent =
    props.status === "success"
      ? "#22c55e"
      : props.status === "error"
        ? "#f97316"
        : props.status === "running"
          ? "#38bdf8"
          : "rgba(226,232,240,0.5)";

  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: 14,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
        <span style={{ color: "#f8fafc", fontSize: 13, fontWeight: 700 }}>{props.title}</span>
      </div>
      {props.detail ? (
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.5 }}>{props.detail}</div>
      ) : null}
    </div>
  );
}
