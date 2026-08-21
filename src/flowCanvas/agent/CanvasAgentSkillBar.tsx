import React from "react";
import { ChevronDown, RotateCcw, Sparkles, X } from "lucide-react";
import type { AgentSkillPreview } from "./canvasAgentApi";

const modalityLabel: Record<AgentSkillPreview["modality"], string> = { text: "文本", image: "图片", video: "视频" };

export function CanvasAgentSkillBar(props: {
  enabled: boolean;
  unavailableReason?: string;
  selectedSkill: AgentSkillPreview | null;
  onClear: () => void;
  onOpenPicker: () => void;
  onRetry?: () => void;
}) {
  return (
    <section aria-label="Skill 工作台" data-testid="agent-skill-bar" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "10px 16px" }}>
      <div style={{ alignItems: "center", display: "flex", gap: 9, minHeight: 38 }}>
        <span style={{ alignItems: "center", background: "rgba(167,139,250,0.16)", borderRadius: 10, color: "#c4b5fd", display: "inline-flex", flex: "0 0 auto", height: 30, justifyContent: "center", width: 30 }}><Sparkles size={15} /></span>
        <button aria-label={props.selectedSkill ? "更换 Skill" : "选择一个创作 Skill"} onClick={props.onOpenPicker} style={{ background: "transparent", border: 0, color: "#f8fafc", cursor: "pointer", flex: 1, minWidth: 0, padding: 0, textAlign: "left" }} type="button">
          <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{props.selectedSkill?.name ?? "选择一个创作 Skill"}</div>
          <div style={{ color: props.enabled ? "#94a3b8" : "#fbbf24", fontSize: 10, lineHeight: 1.25, marginTop: 3 }}>{props.enabled ? (props.selectedSkill ? `${modalityLabel[props.selectedSkill.modality]} · v${props.selectedSkill.version}` : "让 Agent 按固定能力执行创作流程") : (props.unavailableReason ?? "Skill 暂不可用 · 当前运行环境未启用")}</div>
        </button>
        <button aria-label="打开 Skill 选择器" onClick={props.onOpenPicker} style={iconButtonStyle()} title="打开 Skill 选择器" type="button"><ChevronDown size={15} /></button>
        {props.selectedSkill ? <button aria-label="移除当前 Skill" onClick={props.onClear} style={iconButtonStyle()} title="移除当前 Skill" type="button"><X size={14} /></button> : null}
        {!props.enabled && props.onRetry ? <button aria-label="重试 Skill" onClick={props.onRetry} style={iconButtonStyle()} title="重试 Skill" type="button"><RotateCcw size={14} /></button> : null}
      </div>
    </section>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return { alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", flex: "0 0 auto", height: 30, justifyContent: "center", width: 30 };
}
