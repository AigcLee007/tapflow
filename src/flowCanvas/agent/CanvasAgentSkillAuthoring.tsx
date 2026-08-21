import React from "react";
import { ArrowLeft, Bot, Loader2, Save, Send, X } from "lucide-react";
import { createSkillDraft, authorSkillTurn, type SkillSourceDraft } from "./skillApi";

const emptyDraft: SkillSourceDraft = { askWhen: "缺少必要输入时追问", inputs: "", method: "分析需求\n完成创作\n检查输出", modality: "text", name: "", outputs: "", summary: "", usageScenarios: "" };

export function CanvasAgentSkillAuthoring(props: { onBack: () => void; onCreated?: (draft: { id: string; source: SkillSourceDraft }) => void }) {
  const [draft, setDraft] = React.useState<SkillSourceDraft>(emptyDraft);
  const [message, setMessage] = React.useState("");
  const [reply, setReply] = React.useState<string | null>(null);
  const [questions, setQuestions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"ask" | "save" | null>(null);
  const ask = async () => { if (!message.trim()) return; setPending("ask"); setError(null); try { const result = await authorSkillTurn({ draft, userMessage: message }); setDraft((current) => ({ ...current, ...result.sourcePatch })); setReply(result.assistantReply); setQuestions(result.missingQuestions); setMessage(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "生成 Skill 草稿失败"); } finally { setPending(null); } };
  const save = async () => { setPending("save"); setError(null); try { const result = await createSkillDraft(draft); props.onCreated?.({ id: result.id, source: result.source }); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存 Skill 草稿失败"); } finally { setPending(null); } };
  return <section aria-label="创建 Skill" style={{ display: "grid", gap: 10, minHeight: 0, overflowY: "auto" }}>
    <div style={{ alignItems: "center", display: "flex", gap: 8 }}><button aria-label="放弃创建" onClick={props.onBack} style={iconButtonStyle()} title="放弃创建" type="button"><ArrowLeft size={14} /></button><div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>创建 Skill</div></div>
    <div style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.16)", borderRadius: 10, color: "#bae6fd", fontSize: 11, lineHeight: 1.5, padding: 10 }}><Bot size={14} style={{ marginRight: 5, verticalAlign: "-2px" }} />描述你想重复使用的创作流程，Agent 会整理成可编辑草稿。</div>
    {reply ? <div role="status" style={{ color: "#cbd5e1", fontSize: 11, lineHeight: 1.5 }}>{reply}</div> : null}
    {questions.length > 0 ? <div style={{ color: "#fcd34d", fontSize: 11 }}>还需要：{questions.join("；")}</div> : null}
    <textarea aria-label="描述 Skill" disabled={pending !== null} onChange={(event) => setMessage(event.target.value)} placeholder="例如：把产品卖点整理成 30 秒短视频脚本" style={{ ...textAreaStyle, minHeight: 80 }} value={message} />
    <button disabled={pending !== null || !message.trim()} onClick={() => void ask()} style={actionStyle()} type="button">{pending === "ask" ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}整理草稿</button>
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gap: 8, paddingTop: 10 }}><label style={labelStyle}>名称<input aria-label="Skill 名称" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} style={inputStyle} value={draft.name} /></label><label style={labelStyle}>简介<textarea aria-label="Skill 简介" onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} style={textAreaStyle} value={draft.summary} /></label><label style={labelStyle}>执行方法<textarea aria-label="Skill 执行方法" onChange={(event) => setDraft((current) => ({ ...current, method: event.target.value }))} style={{ ...textAreaStyle, minHeight: 80 }} value={draft.method} /></label><label style={labelStyle}>输出<textarea aria-label="Skill 输出" onChange={(event) => setDraft((current) => ({ ...current, outputs: event.target.value }))} style={textAreaStyle} value={draft.outputs} /></label></div>
    {error ? <div role="alert" style={{ color: "#fca5a5", fontSize: 11 }}>{error}</div> : null}
    <div style={{ display: "flex", gap: 8 }}><button disabled={pending !== null} onClick={props.onBack} style={actionStyle(false)} type="button"><X size={13} />放弃创建</button><button disabled={pending !== null || !draft.name.trim()} onClick={() => void save()} style={{ ...actionStyle(), background: "#bae6fd", color: "#0f172a" }} type="button">{pending === "save" ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}保存草稿</button></div>
  </section>;
}

const labelStyle: React.CSSProperties = { color: "#cbd5e1", display: "grid", fontSize: 10, fontWeight: 700, gap: 5 };
const inputStyle: React.CSSProperties = { background: "rgba(15,23,42,0.54)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 8, color: "#f8fafc", fontSize: 12, height: 34, outline: "none", padding: "0 9px" };
const textAreaStyle: React.CSSProperties = { ...inputStyle, height: 56, padding: "8px 9px", resize: "vertical" };
function iconButtonStyle(): React.CSSProperties { return { alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", cursor: "pointer", display: "inline-flex", height: 28, justifyContent: "center", width: 28 }; }
function actionStyle(primary = true): React.CSSProperties { return { alignItems: "center", background: primary ? "rgba(255,255,255,0.07)" : "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, color: "#f8fafc", cursor: "pointer", display: "inline-flex", fontSize: 11, fontWeight: 800, gap: 6, justifyContent: "center", minHeight: 34, padding: "0 10px" }; }
