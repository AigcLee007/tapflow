import { useState } from "react";
import type { AgentRuntimeSession } from "./agentRuntimeApi";
import type { AgentDecisionType, AgentTurnResponse } from "./agentProtocol";
import { ConversationRenderer } from "./ConversationRenderer";
import { modelDisplayName } from "./modelDisplayName";
import "./agentRuntime.css";

export function AgentWorkspace(props: {
  session: AgentRuntimeSession | null;
  response: AgentTurnResponse | null;
  turns?: readonly AgentTurnResponse[];
  history?: readonly AgentRuntimeSession[];
  busy?: boolean;
  decisionBusy?: boolean;
  error?: Error | null;
  onNewConversation: () => void;
  onOpenSession: (id: string) => void;
  onSubmitTurn: (prompt: string) => Promise<unknown>;
  onDecision: (input: { blockId: string; type: AgentDecisionType; payload: Record<string, unknown>; graphRevision?: number; decisionId?: string }) => Promise<unknown>;
  onModeChange?: (mode: "auto" | "manual_confirmation") => void;
  onCollapse?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const canSend = prompt.trim().length > 0 && !props.busy;
  return <aside className="agent-runtime-workspace" data-testid="agent-runtime-workspace">
    <header className="agent-runtime-header"><div><strong>TapFlow Agent</strong><span>{props.response?.phase ?? props.session?.phase ?? "idle"}{modelDisplayName(props.response?.contextSnapshot.modelKey) ? ` · ${modelDisplayName(props.response?.contextSnapshot.modelKey)}` : ""}</span></div><nav><button aria-label="历史" onClick={() => setHistoryOpen((open) => !open)} type="button">历史</button><button aria-label="新建对话" onClick={props.onNewConversation} type="button">新建</button>{props.onCollapse ? <button aria-label="收起 Agent" onClick={props.onCollapse} type="button">收起</button> : null}</nav></header>
    {historyOpen ? <div className="agent-runtime-history" role="dialog"><strong>历史会话</strong>{props.history?.map((item) => <button key={item.id} onClick={() => { setHistoryOpen(false); props.onOpenSession(item.id); }} type="button">{item.title}</button>)}</div> : null}
    <main className="agent-runtime-message-stream" aria-label="Agent 消息流">{(props.turns?.length ? props.turns : props.response ? [props.response] : []).map((turn) => <ConversationRenderer key={turn.turnId} blocks={turn.blocks} pendingDecision={turn.pendingDecision} submitting={props.decisionBusy} onDecision={props.onDecision} />)}{props.error ? <p className="agent-runtime-inline-error">{props.error.message}</p> : null}</main>
    <form className="agent-runtime-composer" onSubmit={(event) => { event.preventDefault(); if (!canSend) return; const value = prompt.trim(); setPrompt(""); void props.onSubmitTurn(value); }}><textarea aria-label="发送新任务" disabled={props.busy} onChange={(event) => setPrompt(event.target.value)} placeholder="描述一个新的画布任务…" value={prompt} /><button disabled={!canSend} type="submit">发送新任务</button></form>
  </aside>;
}
