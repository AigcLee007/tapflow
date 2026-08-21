import React from "react";
import { Check, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import type { AgentSkillStep } from "./canvasAgentSkillTypes";

const actionLabel: Record<AgentSkillStep["action"], string> = { canvas: "更新画布", deliver: "交付结果", image: "生成图片", review: "检查结果", text: "生成文本", video: "生成视频" };

export function CanvasAgentSkillStepRow(props: { step: AgentSkillStep; onRetry?: (step: AgentSkillStep) => void }) {
  const Icon = props.step.status === "succeeded" ? Check : props.step.status === "failed" ? CircleAlert : props.step.status === "running" ? LoaderCircle : RotateCcw;
  return (
    <div data-testid={`skill-step-${props.step.id}`} style={{ alignItems: "center", display: "grid", gap: 9, gridTemplateColumns: "24px 1fr auto", minHeight: 48, padding: "6px 0" }}>
      <span style={{ alignItems: "center", background: props.step.status === "failed" ? "rgba(248,113,113,0.16)" : "rgba(255,255,255,0.07)", borderRadius: 8, color: props.step.status === "succeeded" ? "#86efac" : props.step.status === "failed" ? "#fca5a5" : "#cbd5e1", display: "inline-flex", height: 24, justifyContent: "center", width: 24 }}><Icon size={13} /></span>
      <div style={{ minWidth: 0 }}><div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{props.step.label || actionLabel[props.step.action]}</div><div style={{ color: "#94a3b8", fontSize: 10, lineHeight: 1.3, marginTop: 3 }}>{props.step.status === "waiting_for_approval" ? "等待批准" : props.step.status === "running" ? "执行中" : props.step.status === "succeeded" ? "已完成" : props.step.status === "failed" ? (props.step.error ?? "执行失败") : props.step.status === "cancelled" ? "已取消" : "等待执行"}</div></div>
      {props.step.status === "failed" ? <button aria-label={`重试 ${props.step.label}`} onClick={() => props.onRetry?.(props.step)} style={iconButtonStyle()} title="重试" type="button"><RotateCcw size={13} /></button> : null}
    </div>
  );
}

function iconButtonStyle(): React.CSSProperties { return { alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", height: 28, justifyContent: "center", width: 28 }; }
