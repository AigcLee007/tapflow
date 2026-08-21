import React from "react";
import { Eye, Loader2, Plus, Sparkles } from "lucide-react";
import { MenuSurface } from "../../components/menu/MenuSurface";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS, MENU_ITEM_SECONDARY_CLASS } from "../../components/menu/menuStyles";
import type { AgentSkillPreview } from "./canvasAgentApi";

const modalityLabel: Record<AgentSkillPreview["modality"], string> = { text: "文本", image: "图片", video: "视频" };

export function CanvasAgentSkillPicker(props: {
  canCreate?: boolean;
  loading?: boolean;
  onCreate: () => void;
  onClose?: () => void;
  onOpenDetail: (skill: AgentSkillPreview) => void;
  onRetry?: () => void;
  onSelect: (skill: AgentSkillPreview) => void;
  selectedId?: string | null;
  skills: AgentSkillPreview[];
  unavailableReason?: string;
}) {
  React.useEffect(() => {
    if (!props.onClose) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  const grouped = ["text", "image", "video"].map((modality) => ({
    modality: modality as AgentSkillPreview["modality"],
    skills: props.skills.filter((skill) => skill.modality === modality),
  })).filter((group) => group.skills.length > 0);
  return (
    <MenuSurface aria-label="Skill 目录" style={{ display: "grid", gap: 8, padding: 10 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 800 }}>选择 Skill</div>
        {props.canCreate ? <button aria-label="创建 Skill" onClick={props.onCreate} style={iconButtonStyle()} title="创建 Skill" type="button"><Plus size={14} /></button> : null}
      </div>
      {props.loading ? <div role="status" style={{ alignItems: "center", color: "#94a3b8", display: "flex", fontSize: 11, gap: 6, minHeight: 38 }}><Loader2 className="animate-spin" size={14} />正在加载 Skill</div> : null}
      {props.unavailableReason ? <div role="alert" style={{ color: "#fbbf24", display: "grid", fontSize: 11, gap: 8, padding: "8px 2px" }}><span>{props.unavailableReason}</span>{props.onRetry ? <button onClick={props.onRetry} style={retryButtonStyle} type="button">重试</button> : null}</div> : null}
      {!props.loading && !props.unavailableReason && props.skills.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 11, padding: "8px 2px" }}>没有匹配的 Skill</div> : null}
      {!props.loading && !props.unavailableReason ? <div style={{ display: "grid", gap: 10, maxHeight: 240, overflowY: "auto" }}>
        {grouped.map((group) => <section aria-label={modalityLabel[group.modality]} key={group.modality} style={{ display: "grid", gap: 4 }}>
          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 800 }}>{modalityLabel[group.modality]}</div>
          {group.skills.map((skill) => {
            const selected = skill.id === props.selectedId;
            return (
              <div className={`${MENU_ITEM_CLASS} ${selected ? "bg-sky-400/10" : "bg-white/[0.035]"} border border-white/10`} key={skill.id} style={{ minHeight: 38 }}>
                <button aria-label={`选择 ${skill.name}`} onClick={() => props.onSelect(skill)} style={{ ...iconButtonStyle(), background: selected ? "#bae6fd" : "rgba(255,255,255,0.08)", color: selected ? "#0f172a" : "#e2e8f0" }} title={`选择 ${skill.name}`} type="button"><Sparkles size={13} /></button>
                <button className="min-w-0 flex-1" onClick={() => props.onSelect(skill)} style={{ background: "none", border: 0, color: "#f8fafc", cursor: "pointer", minWidth: 0, padding: 0, textAlign: "left" }} type="button">
                  <div className={MENU_ITEM_PRIMARY_CLASS}>{skill.name}</div>
                  <div className={MENU_ITEM_SECONDARY_CLASS}>{skill.summary}</div>
                </button>
                <button aria-label={`查看 ${skill.name}`} onClick={() => props.onOpenDetail(skill)} style={iconButtonStyle()} title="查看详情" type="button"><Eye size={13} /></button>
              </div>
            );
          })}
        </section>)}
      </div> : null}
    </MenuSurface>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return { alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", height: 28, justifyContent: "center", width: 28 };
}

const retryButtonStyle: React.CSSProperties = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#f8fafc", cursor: "pointer", fontSize: 11, fontWeight: 800, minHeight: 32, padding: "0 10px", width: "fit-content" };
