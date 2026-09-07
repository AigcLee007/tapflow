import React from "react";
import { History, PanelRightClose, Plus, Send, Sparkles } from "lucide-react";
import { MenuSelect } from "../../../components/menu/MenuSelect";
import { CanvasAgentReferenceUploadButton } from "../CanvasAgentReferenceUploadButton";
import type { AgentReferenceChip } from "../CanvasAgentWorkspaceTypes";
import { AgentConversationStream } from "./AgentConversationStream";
import type { AgentBlockAction } from "./AgentBlockRenderer";
import type { AgentExecutionMode, AgentV5Phase, ConversationBlock } from "./agentV5Types";

const discoveryDirections = [
  { id: "comfort", label: "陪伴与情绪安抚", description: "让孩子获得安定感" },
  { id: "learning", label: "互动学习与启蒙", description: "把认知和习惯融进互动" },
  { id: "story", label: "故事与角色扮演", description: "形成可持续的玩耍内容" },
];
const discoveryAges = ["0-3 岁", "3-6 岁", "6-9 岁"];

export type AgentWindowProps = {
  blocks?: ConversationBlock[];
  models?: Array<{ key: string; label: string }>;
  skills?: Array<{ id: string; name: string; summary: string }>;
  phase?: AgentV5Phase;
  sessionTitle?: string;
  mode?: AgentExecutionMode;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onAction?: (action: AgentBlockAction) => void;
  onAttachmentAction?: (kind: "canvas" | "upload" | "skill" | "app") => void;
  onUploadError?: (message: string) => void;
  onUploadReferences?: (chips: AgentReferenceChip[]) => void;
  projectId?: string | null;
  referenceCount?: number;
  onChangeMode?: (mode: AgentExecutionMode) => void;
  onCollapse?: () => void;
  onNewConversation?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onSend?: (prompt: string, modelKey: string | null) => void;
  onSelectModel?: (modelKey: string) => void;
  onSelectSkill?: (skillId: string) => void;
};

export function AgentWindow(props: AgentWindowProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [attachmentOpen, setAttachmentOpen] = React.useState(false);
  const [modelKey, setModelKey] = React.useState(props.models?.[0]?.key ?? "");
  const [draft, setDraft] = React.useState("");
  const [discoveryPhase, setDiscoveryPhase] = React.useState<"idle" | "direction" | "age" | "brief" | "executing">("idle");
  const [discoveryDirection, setDiscoveryDirection] = React.useState<string | null>(null);
  const [discoveryAge, setDiscoveryAge] = React.useState<string | null>(null);
  const [localBlocks, setLocalBlocks] = React.useState<ConversationBlock[]>([]);
  const [capabilityPanel, setCapabilityPanel] = React.useState<"skill" | "app" | null>(null);
  const mode = props.mode ?? "manual_confirmation";
  const displayBlocks = props.blocks && props.blocks.length > 0 ? props.blocks : localBlocks;
  const selectedDirection = discoveryDirections.find((item) => item.id === discoveryDirection);
  const discoveryBrief = `基于参考形象设计一款${discoveryAge ?? "适龄"}儿童陪伴玩具，核心方向为“${selectedDirection?.label ?? "陪伴体验"}”。保留角色识别度，补充材质、交互方式、安全边界和可落地的产品细节。`;
  const resetConversation = () => { setDiscoveryPhase("idle"); setDiscoveryDirection(null); setDiscoveryAge(null); setLocalBlocks([]); props.onNewConversation?.(); };

  const send = () => {
    const value = draft.trim();
    if (!value || props.phase === "executing" || props.phase === "understanding") return;
    if (discoveryPhase === "idle" && (!props.blocks || props.blocks.length === 0)) {
      setDiscoveryPhase("direction");
      setLocalBlocks([
        { type: "paragraph", text: value },
        { type: "heading", level: 2, text: "先把方向定清楚" },
        { type: "paragraph", text: "我不会直接替你生成，先确认两个会影响结果的关键选择。" },
        { type: "choice_grid", id: "direction", title: "你更想优先解决哪件事？", selectionMode: "single", options: discoveryDirections },
      ]);
      setDraft("");
      return;
    }
    props.onSend?.(value, modelKey || null);
    setDraft("");
  };

  const handleAction = (action: AgentBlockAction) => {
    if (action.type === "select_choice" && discoveryPhase === "direction" && action.blockId === "direction") {
      setDiscoveryDirection(action.optionId);
      setDiscoveryPhase("age");
      setLocalBlocks((current) => [...current, { type: "heading", level: 2, text: "主要陪伴哪个年龄段？" }, { type: "choice_grid", id: "age", title: "选择年龄段", selectionMode: "single", options: discoveryAges.map((age) => ({ id: age, label: age })) }]);
      return;
    }
    if (action.type === "select_choice" && discoveryPhase === "age" && action.blockId === "age") {
      setDiscoveryAge(action.optionId);
      setDiscoveryPhase("brief");
      setLocalBlocks((current) => [...current, { type: "brief_card", title: "共创 Brief", editable: true, fields: [{ label: "目标", value: selectedDirection?.label ?? "儿童陪伴玩具" }, { label: "使用人群", value: action.optionId }, { label: "参考策略", value: "保留角色识别度，探索 3 个产品化方向" }] }, { type: "confirmation_card", title: "确认并开始设计", text: "确认后将生成 3 个方向并整理为可比较的结果组。", plan: { costCredits: 12 } }]);
      return;
    }
    if (action.type === "confirm" && discoveryPhase === "brief") {
      setDiscoveryPhase("executing");
      props.onSend?.(discoveryBrief, modelKey || null);
      return;
    }
    props.onAction?.(action);
  };

  return (
    <aside className="agent-v5-window" data-testid="agent-v5-window">
      <header className="agent-v5-window-header">
        <button aria-label="新建对话" className="agent-v5-header-button agent-v5-new-button" onClick={resetConversation} type="button"><Plus size={15} /> 新建对话</button>
        <div className="agent-v5-session-title"><Sparkles size={15} /><span>{props.sessionTitle ?? "新对话"}</span></div>
        <div className="agent-v5-header-actions"><button aria-label="聊天记录" className="agent-v5-header-icon" onClick={() => setHistoryOpen(true)} type="button"><History size={16} /></button><button aria-label="收起 Agent" className="agent-v5-header-icon" onClick={props.onCollapse} type="button"><PanelRightClose size={16} /></button></div>
      </header>

      <div className="agent-v5-window-content"><AgentConversationStream blocks={displayBlocks} onAction={handleAction} /></div>

      <footer className="agent-v5-composer">
        <textarea aria-label="Agent 输入" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="输入消息、回答 Agent 问题或继续描述任务" value={draft} />
        <div className="agent-v5-composer-toolbar">
          <div className="agent-v5-composer-left"><button aria-label="添加附件" className="agent-v5-composer-button" onClick={() => setAttachmentOpen((open) => !open)} type="button"><Plus size={16} /></button><button aria-label={mode === "auto" ? "Agent 自动执行" : "用户确认模式"} className="agent-v5-mode-button" onClick={() => props.onChangeMode?.(mode === "auto" ? "manual_confirmation" : "auto")} type="button">{mode === "auto" ? "Agent 自动" : "用户确认"}</button></div><div className="agent-v5-composer-right">{props.models?.length ? <MenuSelect label="文本模型" onChange={(value) => { setModelKey(value); props.onSelectModel?.(value); }} options={props.models.map((model) => ({ label: model.label, value: model.key }))} size="compact" value={modelKey} /> : null}<button aria-label="发送" className="agent-v5-send-button" disabled={!draft.trim()} onClick={send} type="button"><Send size={15} /></button></div>
        </div>
        {attachmentOpen ? <div className="agent-v5-attachment-menu"><button onClick={() => { props.onAttachmentAction?.("canvas"); setAttachmentOpen(false); }} type="button">从画布选择</button><div className="agent-v5-upload-menu-row"><span>上传附件</span><CanvasAgentReferenceUploadButton ariaLabel="上传附件" existingCount={props.referenceCount} onError={props.onUploadError} onUploaded={(chips) => { props.onUploadReferences?.(chips); setAttachmentOpen(false); }} projectId={props.projectId} /></div><button onClick={() => { props.onAttachmentAction?.("skill"); setCapabilityPanel("skill"); setAttachmentOpen(false); }} type="button">Skill</button><button onClick={() => { props.onAttachmentAction?.("app"); setCapabilityPanel("app"); setAttachmentOpen(false); }} type="button">App</button></div> : null}
        {capabilityPanel ? <div className="agent-v5-capability-popover"><div className="agent-v5-capability-popover-header"><strong>{capabilityPanel === "skill" ? "选择 Skill" : "应用管理"}</strong><button aria-label="关闭能力面板" onClick={() => setCapabilityPanel(null)} type="button">×</button></div>{capabilityPanel === "skill" ? <>{props.skills?.length ? props.skills.map((skill) => <button className="agent-v5-capability-option" key={skill.id} onClick={() => { props.onSelectSkill?.(skill.id); setCapabilityPanel(null); }} type="button"><strong>{skill.name}</strong><small>{skill.summary}</small></button>) : <span className="agent-v5-capability-empty">暂无可用 Skill</span>}<button className="agent-v5-capability-manage" onClick={() => props.onAttachmentAction?.("skill")} type="button">管理 Skill</button></> : <><span className="agent-v5-capability-empty">应用管理入口已保留，连接应用后会显示在这里。</span><button className="agent-v5-capability-manage" onClick={() => props.onAttachmentAction?.("app")} type="button">管理 App</button></>}</div> : null}
      </footer>

      {historyOpen ? <div className="agent-v5-history-overlay" role="presentation" onClick={() => setHistoryOpen(false)}><section aria-label="聊天记录" className="agent-v5-history-drawer" onClick={(event) => event.stopPropagation()}><div className="agent-v5-history-header"><strong>聊天记录</strong><button aria-label="新建历史对话" onClick={resetConversation} type="button"><Plus size={14} /> 新建对话</button></div><div className="agent-v5-history-list">{props.sessions?.length ? props.sessions.map((session) => <button key={session.id} onClick={() => { props.onOpenSession?.(session.id); setHistoryOpen(false); }} type="button">{session.title}</button>) : <span>暂无历史对话</span>}</div></section></div> : null}
    </aside>
  );
}
