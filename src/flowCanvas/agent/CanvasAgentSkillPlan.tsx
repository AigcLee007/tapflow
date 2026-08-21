import React from "react";
import { Ban, Check, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import type { AgentSkillPlan as SkillPlan } from "./canvasAgentSkillTypes";
import { CanvasAgentSkillStepRow } from "./CanvasAgentSkillStepRow";

export function CanvasAgentSkillPlan(props: { plan: SkillPlan; onApprove?: () => void; onCancel?: () => void; onRetry?: (step: SkillPlan["steps"][number]) => void }) {
  const waiting = props.plan.status === "waiting_for_approval";
  const terminal = ["succeeded", "partial_success", "failed", "cancelled"].includes(props.plan.status);
  const StatusIcon = waiting ? ShieldCheck : props.plan.status === "running" ? LoaderCircle : terminal ? (props.plan.status === "failed" ? CircleAlert : Check) : ShieldCheck;
  return <section aria-label="Skill 执行计划" data-testid="agent-skill-plan" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, display: "grid", gap: 7, padding: 12 }}>
    <div style={{ alignItems: "center", display: "flex", gap: 8 }}><StatusIcon size={15} /><strong style={{ color: "#f8fafc", flex: 1, fontSize: 12 }}>执行计划</strong>{props.plan.estimatedCredits !== undefined ? <span style={{ color: "#cbd5e1", fontSize: 10 }}>预计 {props.plan.estimatedCredits} 积分</span> : null}</div>
    <div style={{ color: "#94a3b8", fontSize: 10 }}>{waiting ? "Agent 已拆解任务，请确认后执行" : props.plan.status === "running" ? "正在按步骤执行" : terminal ? "本次 Skill 执行已结束" : "等待输入后生成计划"}</div>
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", paddingTop: 4 }}>{props.plan.steps.map((step) => <CanvasAgentSkillStepRow key={step.id} onRetry={props.onRetry} step={step} />)}</div>
    {waiting ? <div style={{ display: "flex", gap: 7 }}><button onClick={props.onApprove} style={primaryButtonStyle()} type="button"><ShieldCheck size={14} />批准执行</button><button onClick={props.onCancel} style={secondaryButtonStyle()} type="button"><Ban size={14} />取消</button></div> : null}
  </section>;
}

function primaryButtonStyle(): React.CSSProperties { return { alignItems: "center", background: "#f8fafc", border: 0, borderRadius: 10, color: "#09090f", cursor: "pointer", display: "inline-flex", fontSize: 11, fontWeight: 800, gap: 5, height: 34, justifyContent: "center", padding: "0 12px" }; }
function secondaryButtonStyle(): React.CSSProperties { return { alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", fontSize: 11, fontWeight: 700, gap: 5, height: 34, justifyContent: "center", padding: "0 12px" }; }
