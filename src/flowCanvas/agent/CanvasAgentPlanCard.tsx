import React from "react";

import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { summarizeCanvasAgentOps } from "./canvasAgentTypes";

export function CanvasAgentPlanCard(props: {
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onCreateOnly?: () => void;
  plan: CanvasAgentPlannerOutput;
}) {
  const summary = summarizeCanvasAgentOps(props.plan.proposedOps);
  const hasRunNode = props.plan.proposedOps.some((op) => op.type === "run_node");
  const createOnlyDisabled = summary.addNodeCount + summary.updateNodeCount + summary.connectCount === 0;
  const createAndRunDisabled = !hasRunNode;

  return (
    <section
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        display: "grid",
        gap: 10,
        padding: 12,
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>
        Agent will make these canvas changes
      </div>
      <div style={{ color: "rgba(226,232,240,0.86)", fontSize: 13, lineHeight: 1.55 }}>{props.plan.reply}</div>

      {props.plan.evidence.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "rgba(248,250,252,0.75)", fontSize: 12, fontWeight: 700 }}>Context used</div>
          {props.plan.evidence.map((item, index) => (
            <div key={`${item.type}-${index}`} style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.5 }}>
              {item.summary}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 7 }}>
        <div style={{ color: "rgba(248,250,252,0.75)", fontSize: 12, fontWeight: 700 }}>Plan</div>
        {props.plan.plan.map((step, index) => (
          <div key={`${step.step}-${index}`} style={{ display: "grid", gap: 2 }}>
            <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 700 }}>{step.step}</div>
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, lineHeight: 1.45 }}>{step.reason}</div>
          </div>
        ))}
      </div>

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
        <div>新增节点：{summary.addNodeCount}</div>
        <div>修改节点：{summary.updateNodeCount}</div>
        <div>创建连线：{summary.connectCount}</div>
        <div>执行节点：{summary.creditRunCount}</div>
      </div>

      {props.plan.costEstimate ? (
        <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>
          预计消耗 {props.plan.costEstimate.totalCredits} 积分
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          disabled={props.busy || createOnlyDisabled || !props.onCreateOnly}
          onClick={props.onCreateOnly}
          style={secondaryActionStyle(props.busy || createOnlyDisabled || !props.onCreateOnly)}
          type="button"
        >
          创建流程
        </button>
        <button
          disabled={props.busy || createAndRunDisabled}
          onClick={props.onConfirm}
          style={primaryActionStyle(props.busy || createAndRunDisabled)}
          type="button"
        >
          创建并执行
        </button>
        <button disabled={props.busy} onClick={props.onCancel} style={ghostActionStyle(props.busy)} type="button">
          取消
        </button>
      </div>
    </section>
  );
}

function primaryActionStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: disabled ? "rgba(255,255,255,0.08)" : "#f8fafc",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    color: disabled ? "rgba(248,250,252,0.5)" : "#09090f",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 800,
    height: 36,
    minWidth: 104,
    padding: "0 14px",
  };
}

function secondaryActionStyle(disabled?: boolean): React.CSSProperties {
  return {
    ...ghostActionStyle(disabled),
    background: "rgba(255,255,255,0.08)",
  };
}

function ghostActionStyle(disabled?: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    color: disabled ? "rgba(248,250,252,0.45)" : "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 700,
    height: 36,
    minWidth: 76,
    padding: "0 14px",
  };
}
