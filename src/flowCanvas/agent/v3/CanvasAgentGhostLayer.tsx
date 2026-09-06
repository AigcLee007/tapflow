import React from "react";
export type CanvasGhostOperation = { type: "node.create"; node: { id: string; type: string; position: { x: number; y: number } } } | { type: "result.place"; result: { assetId: string; position: { x: number; y: number }; label?: string } };

export function CanvasAgentGhostLayer({ operations, visible = true }: { operations: CanvasGhostOperation[]; visible?: boolean }) {
  if (!visible) return null;
  return <div className="canvas-agent-v3-ghost-layer" aria-hidden="true">{operations.map((operation, index) => {
    if (operation.type === "node.create") return <div key={index} className="canvas-agent-v3-ghost-node" style={{ left: operation.node.position.x, top: operation.node.position.y }}>{operation.node.type}</div>;
    if (operation.type === "result.place") return <div key={index} className="canvas-agent-v3-ghost-node" style={{ left: operation.result.position.x, top: operation.result.position.y }}>{operation.result.label ?? "结果"}</div>;
    return null;
  })}</div>;
}
