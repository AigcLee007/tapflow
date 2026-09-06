import React from "react";
import { History, PanelRightClose, Plus, Send, Sparkles } from "lucide-react";
import { AgentConversationStream } from "./AgentConversationStream";
import type { AgentBlockAction } from "./AgentBlockRenderer";
import type { AgentExecutionMode, AgentV5Phase, ConversationBlock } from "./agentV5Types";

export type AgentWindowProps = {
  blocks?: ConversationBlock[];
  models?: Array<{ key: string; label: string }>;
  phase?: AgentV5Phase;
  sessionTitle?: string;
  mode?: AgentExecutionMode;
  sessions?: Array<{ id: string; title: string; updatedAt?: string }>;
  onAction?: (action: AgentBlockAction) => void;
  onChangeMode?: (mode: AgentExecutionMode) => void;
  onCollapse?: () => void;
  onNewConversation?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onSend?: (prompt: string, modelKey: string | null) => void;
};

export function AgentWindow(props: AgentWindowProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [attachmentOpen, setAttachmentOpen] = React.useState(false);
  const [modelKey, setModelKey] = React.useState(props.models?.[0]?.key ?? "");
  const [draft, setDraft] = React.useState("");
  const mode = props.mode ?? "manual_confirmation";

  const send = () => {
    const value = draft.trim();
    if (!value || props.phase === "executing" || props.phase === "understanding") return;
    props.onSend?.(value, modelKey || null);
    setDraft("");
  };

  return (
    <aside className="agent-v5-window" data-testid="agent-v5-window">
      <header className="agent-v5-window-header">
        <button aria-label="新建对话" className="agent-v5-header-button agent-v5-new-button" onClick={props.onNewConversation} type="button"><Plus size={15} /> 新建对话</button>
        <div className="agent-v5-session-title"><Sparkles size={15} /><span>{props.sessionTitle ?? "新对话"}</span></div>
        <div className="agent-v5-header-actions"><button aria-label="聊天记录" className="agent-v5-header-icon" onClick={() => setHistoryOpen(true)} type="button"><History size={16} /></button><button aria-label="收起 Agent" className="agent-v5-header-icon" onClick={props.onCollapse} type="button"><PanelRightClose size={16} /></button></div>
      </header>

      <div className="agent-v5-window-content"><AgentConversationStream blocks={props.blocks ?? []} onAction={props.onAction ?? (() => undefined)} /></div>

      <footer className="agent-v5-composer">
        <textarea aria-label="Agent 输入" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="输入消息、回答 Agent 问题或继续描述任务" value={draft} />
        <div className="agent-v5-composer-toolbar">
          <div className="agent-v5-composer-left"><button aria-label="添加附件" className="agent-v5-composer-button" onClick={() => setAttachmentOpen((open) => !open)} type="button"><Plus size={16} /></button><button aria-label={mode === "auto" ? "Agent 自动执行" : "用户确认模式"} className="agent-v5-mode-button" onClick={() => props.onChangeMode?.(mode === "auto" ? "manual_confirmation" : "auto")} type="button">{mode === "auto" ? "Agent 自动" : "用户确认"}</button></div><div className="agent-v5-composer-right">{props.models?.length ? <select aria-label="文本模型" onChange={(event) => setModelKey(event.target.value)} value={modelKey}>{props.models.map((model) => <option key={model.key} value={model.key}>{model.label}</option>)}</select> : null}<button aria-label="发送" className="agent-v5-send-button" disabled={!draft.trim()} onClick={send} type="button"><Send size={15} /></button></div>
        </div>
        {attachmentOpen ? <div className="agent-v5-attachment-menu"><button type="button">从画布选择</button><button type="button">上传附件</button><button type="button">Skill</button><button type="button">App</button></div> : null}
      </footer>

      {historyOpen ? <div className="agent-v5-history-overlay" role="presentation" onClick={() => setHistoryOpen(false)}><section aria-label="聊天记录" className="agent-v5-history-drawer" onClick={(event) => event.stopPropagation()}><div className="agent-v5-history-header"><strong>聊天记录</strong><button aria-label="新建历史对话" onClick={props.onNewConversation} type="button"><Plus size={14} /> 新建对话</button></div><div className="agent-v5-history-list">{props.sessions?.length ? props.sessions.map((session) => <button key={session.id} onClick={() => { props.onOpenSession?.(session.id); setHistoryOpen(false); }} type="button">{session.title}</button>) : <span>暂无历史对话</span>}</div></section></div> : null}
    </aside>
  );
}
