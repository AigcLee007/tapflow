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
  const confirmLabel = hasRunNode ? "确认并生成" : "确认执行";

  return (
    <section
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(180deg, rgba(20,20,28,0.96) 0%, rgba(12,12,18,0.98) 100%)",
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 800 }}>待确认计划</div>
      <div style={{ color: "rgba(226,232,240,0.86)", fontSize: 13, lineHeight: 1.6 }}>{props.plan.reply}</div>

      {props.plan.evidence.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "rgba(248,250,252,0.75)", fontSize: 12, fontWeight: 700 }}>证据</div>
          {props.plan.evidence.map((item, index) => (
            <div key={`${item.type}-${index}`} style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.5 }}>
              {item.summary}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ color: "rgba(248,250,252,0.75)", fontSize: 12, fontWeight: 700 }}>执行步骤</div>
        {props.plan.plan.map((step, index) => (
          <div key={`${step.step}-${index}`} style={{ display: "grid", gap: 3 }}>
            <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 700 }}>{step.step}</div>
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, lineHeight: 1.5 }}>{step.reason}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: 4,
          padding: 12,
          borderRadius: 14,
          background: "rgba(255,255,255,0.04)",
          color: "rgba(226,232,240,0.78)",
          fontSize: 12,
        }}
      >
        <div>新增节点：{summary.addNodeCount}</div>
        <div>修改节点：{summary.updateNodeCount}</div>
        <div>连接关系：{summary.connectCount}</div>
        <div>执行任务：{summary.creditRunCount}</div>
      </div>

      {props.plan.costEstimate ? (
        <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>
          预计消耗 {props.plan.costEstimate.totalCredits} 积分
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          disabled={props.busy}
          onClick={props.onConfirm}
          style={primaryActionStyle(props.busy)}
          type="button"
        >
          {confirmLabel}
        </button>
        {hasRunNode && props.onCreateOnly ? (
          <button
            disabled={props.busy}
            onClick={props.onCreateOnly}
            style={secondaryActionStyle(props.busy)}
            type="button"
          >
            只创建节点不生成
          </button>
        ) : null}
        <button
          disabled={props.busy}
          onClick={props.onCancel}
          style={ghostActionStyle(props.busy)}
          type="button"
        >
          取消
        </button>
      </div>
    </section>
  );
}

function primaryActionStyle(disabled?: boolean): React.CSSProperties {
  return {
    minWidth: 104,
    height: 38,
    borderRadius: 19,
    border: "1px solid rgba(255,255,255,0.08)",
    background: disabled ? "rgba(255,255,255,0.08)" : "#f8fafc",
    color: disabled ? "rgba(248,250,252,0.5)" : "#09090f",
    fontWeight: 800,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 16px",
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
    minWidth: 88,
    height: 38,
    borderRadius: 19,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: disabled ? "rgba(248,250,252,0.45)" : "#f8fafc",
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "0 16px",
  };
}
