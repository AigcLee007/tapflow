import React from "react";

import type { FlowImageResultItem } from "../types";

type ImageWorkbenchResultSheetProps = {
  item: FlowImageResultItem | null;
  onClose: () => void;
  onUseAsReference: (item: FlowImageResultItem) => void;
};

export function ImageWorkbenchResultSheet({
  item,
  onClose,
  onUseAsReference,
}: ImageWorkbenchResultSheetProps) {
  if (!item) return null;
  return (
    <div
      data-testid="image-workbench-result-sheet"
      style={{
        background: "rgba(9,9,15,0.96)",
        borderRadius: "22px 22px 0 0",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        bottom: 0,
        boxShadow: "0 -18px 60px rgba(0,0,0,0.45)",
        left: 0,
        padding: 16,
        position: "fixed",
        right: 0,
        zIndex: 80,
      }}
    >
      <img alt="" src={item.url} style={{ borderRadius: 14, maxHeight: 320, objectFit: "contain", width: "100%" }} />
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => onUseAsReference(item)}>Use as reference</button>
        <a href={item.url} download>Download</a>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
