import React from "react";
import { Eye, Plus, Sparkles } from "lucide-react";
import type { AgentSkillPreview } from "./canvasAgentApi";

const modalityLabel: Record<AgentSkillPreview["modality"], string> = { text: "文本", image: "图片", video: "视频" };

export function CanvasAgentSkillPicker(props: {
  canCreate?: boolean;
  onCreate: () => void;
  onOpenDetail: (skill: AgentSkillPreview) => void;
  onSelect: (skill: AgentSkillPreview) => void;
  selectedId?: string | null;
  skills: AgentSkillPreview[];
}) {
  return (
    <section aria-label="Skill 目录" style={{ display: "grid", gap: 8 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 800 }}>选择 Skill</div>
        {props.canCreate ? <button aria-label="创建 Skill" onClick={props.onCreate} style={iconButtonStyle()} title="创建 Skill" type="button"><Plus size={14} /></button> : null}
      </div>
      {props.skills.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 11, padding: "8px 2px" }}>没有匹配的 Skill</div> : null}
      <div style={{ display: "grid", gap: 6, maxHeight: 210, overflowY: "auto" }}>
        {props.skills.map((skill) => {
          const selected = skill.id === props.selectedId;
          return (
            <div key={skill.id} style={{ alignItems: "center", background: selected ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.035)", border: `1px solid ${selected ? "rgba(56,189,248,0.45)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, display: "grid", gap: 8, gridTemplateColumns: "28px 1fr auto", padding: 8 }}>
              <button aria-label={`选择 ${skill.name}`} onClick={() => props.onSelect(skill)} style={{ ...iconButtonStyle(), background: selected ? "#bae6fd" : "rgba(255,255,255,0.08)", color: selected ? "#0f172a" : "#e2e8f0" }} title={`选择 ${skill.name}`} type="button"><Sparkles size={13} /></button>
              <button onClick={() => props.onSelect(skill)} style={{ background: "none", border: 0, color: "#f8fafc", cursor: "pointer", minWidth: 0, padding: 0, textAlign: "left" }} type="button">
                <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{skill.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 3 }}>{modalityLabel[skill.modality]} · {skill.summary}</div>
              </button>
              <button aria-label={`查看 ${skill.name}`} onClick={() => props.onOpenDetail(skill)} style={iconButtonStyle()} title="查看详情" type="button"><Eye size={13} /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return { alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", height: 28, justifyContent: "center", width: 28 };
}
