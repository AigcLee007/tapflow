import React from "react";
import { ArrowLeft, Loader2, Save, Send, X } from "lucide-react";
import { MenuSelect } from "../../components/menu/MenuSelect";
import type { AgentSkillPreview } from "./canvasAgentApi";
import { createSkillDraft, getSkillDraft, publishSkill, updateSkillDraft, type SkillSourceDraft } from "./skillApi";

const emptySource: SkillSourceDraft = { askWhen: "缺少必要输入时追问", inputs: "", method: "分析需求\n完成创作\n检查输出", modality: "text", name: "", outputs: "", summary: "", usageScenarios: "" };

export function CanvasAgentSkillDetail(props: { onBack: () => void; onSaved?: (skill: AgentSkillPreview) => void; skill: AgentSkillPreview }) {
  const [source, setSource] = React.useState<SkillSourceDraft>({ ...emptySource, modality: props.skill.modality, name: props.skill.name, summary: props.skill.summary });
  const [revision, setRevision] = React.useState(0);
  const [skillId, setSkillId] = React.useState(props.skill.visibility === "private" ? props.skill.id : null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"load" | "save" | "publish" | null>("load");

  React.useEffect(() => {
    let active = true;
    void getSkillDraft(props.skill.id).then((draft) => { if (active) { setSource(draft.source); setRevision(draft.revision); setSkillId(props.skill.visibility === "private" ? draft.id : null); } }).catch(() => { if (active) setError("无法读取 Skill 草稿"); }).finally(() => { if (active) setPending(null); });
    return () => { active = false; };
  }, [props.skill.id, props.skill.visibility]);

  const setField = (field: keyof SkillSourceDraft, value: string) => setSource((current) => ({ ...current, [field]: value }));
  const save = async (publish = false) => {
    setError(null); setStatus(null); setPending(publish ? "publish" : "save");
    try {
      const draft = skillId ? await updateSkillDraft(skillId, source, revision) : await createSkillDraft(source);
      setSkillId(draft.id); setRevision(draft.revision);
      if (publish) props.onSaved?.(await publishSkill(draft.id, source));
      setStatus(publish ? "已发布新版本" : "草稿已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setPending(null); }
  };

  return <section aria-label="Skill 详情" style={{ display: "grid", gap: 10, minHeight: 0, overflowY: "auto" }}>
    <div style={{ alignItems: "center", display: "flex", gap: 8 }}><button aria-label="放弃编辑" onClick={props.onBack} style={iconButtonStyle()} title="放弃编辑" type="button"><ArrowLeft size={14} /></button><div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>Skill 详情</div><span style={{ color: "#94a3b8", fontSize: 10 }}>v{props.skill.version} · {props.skill.visibility === "official" ? "官方" : "私有"}</span></div>
    {pending === "load" ? <div style={{ alignItems: "center", color: "#94a3b8", display: "flex", gap: 6, fontSize: 11 }}><Loader2 className="animate-spin" size={14} />读取草稿</div> : null}
    <label style={labelStyle}>名称<input aria-label="Skill 名称" disabled={pending !== null} onChange={(event) => setField("name", event.target.value)} style={inputStyle} value={source.name} /></label>
    <MenuSelect disabled={pending !== null} fullWidth label="类型" onChange={(value) => setSource((current) => ({ ...current, modality: value as SkillSourceDraft["modality"] }))} options={[{ label: "文本", value: "text" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }]} size="compact" value={source.modality} />
    <label style={labelStyle}>简介<textarea aria-label="Skill 简介" disabled={pending !== null} onChange={(event) => setField("summary", event.target.value)} style={textAreaStyle} value={source.summary} /></label>
    <label style={labelStyle}>输入<textarea aria-label="Skill 输入" disabled={pending !== null} onChange={(event) => setField("inputs", event.target.value)} style={textAreaStyle} value={source.inputs} /></label>
    <label style={labelStyle}>执行方法<textarea aria-label="Skill 执行方法" disabled={pending !== null} onChange={(event) => setField("method", event.target.value)} style={{ ...textAreaStyle, minHeight: 92 }} value={source.method} /></label>
    <label style={labelStyle}>输出<textarea aria-label="Skill 输出" disabled={pending !== null} onChange={(event) => setField("outputs", event.target.value)} style={textAreaStyle} value={source.outputs} /></label>
    <label style={labelStyle}>使用场景<textarea aria-label="Skill 使用场景" disabled={pending !== null} onChange={(event) => setField("usageScenarios", event.target.value)} style={textAreaStyle} value={source.usageScenarios} /></label>
    <label style={labelStyle}>追问条件<textarea aria-label="Skill 追问条件" disabled={pending !== null} onChange={(event) => setField("askWhen", event.target.value)} style={textAreaStyle} value={source.askWhen} /></label>
    {error ? <div role="alert" style={{ color: "#fca5a5", fontSize: 11 }}>{error}</div> : null}
    {status ? <div role="status" style={{ color: "#86efac", fontSize: 11 }}>{status}</div> : null}
    <div style={{ display: "flex", gap: 8 }}><button disabled={pending !== null} onClick={props.onBack} style={actionStyle(false)} type="button"><X size={13} />放弃编辑</button><button disabled={pending !== null || !source.name.trim()} onClick={() => void save(false)} style={actionStyle()} type="button">{pending === "save" ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}保存草稿</button><button disabled={pending !== null || !source.name.trim()} onClick={() => void save(true)} style={{ ...actionStyle(), background: "#bae6fd", color: "#0f172a" }} type="button">{pending === "publish" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}发布</button></div>
  </section>;
}

const labelStyle: React.CSSProperties = { color: "#cbd5e1", display: "grid", fontSize: 10, fontWeight: 700, gap: 5 };
const inputStyle: React.CSSProperties = { background: "rgba(15,23,42,0.54)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 8, color: "#f8fafc", fontSize: 12, height: 34, outline: "none", padding: "0 9px" };
const textAreaStyle: React.CSSProperties = { ...inputStyle, height: 56, padding: "8px 9px", resize: "vertical" };
function iconButtonStyle(): React.CSSProperties { return { alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", height: 28, justifyContent: "center", width: 28 }; }
function actionStyle(primary = true): React.CSSProperties { return { alignItems: "center", background: primary ? "rgba(255,255,255,0.07)" : "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#f8fafc", cursor: "pointer", display: "inline-flex", fontSize: 11, fontWeight: 800, gap: 6, minHeight: 34, padding: "0 10px" }; }
