import React from "react";

import type { CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

export function CanvasAgentAssetRefStrip(props: { assets: CanvasAgentToolAssetRef[] }) {
  if (props.assets.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {props.assets.map((asset) => (
        <span
          key={asset.refId}
          style={{
            border: "1px solid rgba(148,163,184,0.22)",
            borderRadius: 999,
            color: "#cbd5e1",
            fontSize: 11,
            padding: "4px 8px",
          }}
        >
          {asset.label}
        </span>
      ))}
    </div>
  );
}
