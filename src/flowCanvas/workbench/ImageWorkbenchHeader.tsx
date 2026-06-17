import React from "react";

import type { WorkbenchProjectMode } from "./imageWorkbenchTypes";

type ImageWorkbenchHeaderProps = {
  mode: WorkbenchProjectMode;
  onSwitchMode: (mode: WorkbenchProjectMode) => void;
  projectName: string;
};

const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
  alignItems: "center",
  background: active ? "rgba(255,255,255,0.14)" : "transparent",
  border: "none",
  borderRadius: 999,
  color: active ? "#f8fafc" : "rgba(226,232,240,0.72)",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 800,
  height: 32,
  justifyContent: "center",
  minWidth: 88,
  padding: "0 14px",
});

export function ImageWorkbenchHeader({
  mode,
  onSwitchMode,
  projectName,
}: ImageWorkbenchHeaderProps) {
  return (
    <header
      style={{
        alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        gap: 12,
        justifyContent: "space-between",
        minHeight: 58,
        padding: "0 20px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>
          {projectName || "Untitled Project"}
        </div>
      </div>

      <div
        aria-label="Project mode"
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          display: "inline-flex",
          gap: 4,
          padding: 4,
        }}
      >
        <button
          aria-pressed={mode === "workbench"}
          onClick={() => onSwitchMode("workbench")}
          style={segmentButtonStyle(mode === "workbench")}
          type="button"
        >
          工作台
        </button>
        <button
          aria-pressed={mode === "canvas"}
          onClick={() => onSwitchMode("canvas")}
          style={segmentButtonStyle(mode === "canvas")}
          type="button"
        >
          画布
        </button>
      </div>
    </header>
  );
}
