import React from "react";

import type { CanvasAgentOp } from "./canvasAgentTypes";
import { summarizeCanvasAgentOps } from "./canvasAgentTypes";

export type CanvasAgentCanvasOpsCardProps = {
  busy?: boolean;
  onCancel: () => void;
  onCreateAndRun?: () => void;
  onCreateOnly?: () => void;
  ops: CanvasAgentOp[];
};

export function CanvasAgentCanvasOpsCard(props: CanvasAgentCanvasOpsCardProps) {
  const summary = summarizeCanvasAgentOps(props.ops);
  const hasRunNode = summary.creditRunCount > 0;
  const createOnlyDisabled = summary.addNodeCount + summary.updateNodeCount + summary.connectCount === 0;
  const createAndRunDisabled = !hasRunNode || !props.onCreateAndRun;
  const createdNodeLabels = props.ops
    .filter((op): op is Extract<CanvasAgentOp, { type: "add_node" }> => op.type === "add_node")
    .map((op, index) => ({
      id: op.clientId ?? `${op.kind}-${index}`,
      kind: op.kind,
      title:
        typeof op.data.title === "string" && op.data.title.trim().length > 0
          ? op.data.title
          : `新${op.kind}节点`,
    }));

  return (
    <section
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        display: "grid",
        gap: 10,
        padding: 12,
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>待确认画布操作</div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: 12,
          color: "rgba(226,232,240,0.78)",
          display: "grid",
          fontSize: 12,
          gap: 4,
          padding: 10,
        }}
      >
        <div>创建节点：{summary.addNodeCount}</div>
        <div>更新节点：{summary.updateNodeCount}</div>
        <div>创建连线：{summary.connectCount}</div>
        <div>执行节点：{summary.creditRunCount}</div>
      </div>

      {createdNodeLabels.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "rgba(248,250,252,0.75)", fontSize: 12, fontWeight: 700 }}>将创建的节点</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {createdNodeLabels.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  color: "#e2e8f0",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
              >
                {item.title} · {item.kind}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasRunNode ? (
        <div style={{ color: "#facc15", fontSize: 12, fontWeight: 700 }}>
          执行会进入积分预估或扣费确认流程
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          disabled={props.busy || createOnlyDisabled || !props.onCreateOnly}
          onClick={props.onCreateOnly}
          style={secondaryButtonStyle(props.busy || createOnlyDisabled || !props.onCreateOnly)}
          type="button"
        >
          创建流程
        </button>
        <button
          disabled={props.busy || createAndRunDisabled}
          onClick={props.onCreateAndRun}
          style={primaryButtonStyle(props.busy || createAndRunDisabled)}
          type="button"
        >
          创建并执行
        </button>
        <button
          disabled={props.busy}
          onClick={props.onCancel}
          style={ghostButtonStyle(props.busy)}
          type="button"
        >
          取消
        </button>
      </div>
    </section>
  );
}

function primaryButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? "rgba(255,255,255,0.08)" : "#f8fafc",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 19,
    color: disabled ? "rgba(248,250,252,0.45)" : "#09090f",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 800,
    height: 38,
    minWidth: 104,
    padding: "0 16px",
  };
}

function secondaryButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    ...ghostButtonStyle(disabled),
    background: "rgba(255,255,255,0.08)",
  };
}

function ghostButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 19,
    color: disabled ? "rgba(248,250,252,0.45)" : "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 700,
    height: 38,
    minWidth: 88,
    padding: "0 16px",
  };
}
