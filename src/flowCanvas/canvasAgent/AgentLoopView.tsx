import { FileText, History, MessageSquarePlus, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { AgentHistory } from "../agent/v6/workspace/AgentHistory";
import { AgentLoopComposer } from "./AgentLoopComposer";
import { AgentLoopFiles } from "./AgentLoopFiles";
import { AgentLoopGenerationCard } from "./AgentLoopGenerationCard";
import { AgentLoopMarkdown } from "./AgentLoopMarkdown";
import { AgentLoopQuestionCard } from "./AgentLoopQuestionCard";
import { AgentLoopStatus, AgentLoopSteps } from "./AgentLoopSteps";
import type { CanvasAgentImageModel } from "./canvasAgentTypes";
import type { CanvasAgentController } from "./useCanvasAgent";
import "./canvasAgent.css";

const EXAMPLES = [
  "我要做一套男童羽绒服的淘宝详情页，3 张主图 + 5 张详情页",
  "根据画布上选中的产品图，出 4 张不同场景的电商海报",
];

export type AgentLoopViewProps = {
  agent: CanvasAgentController;
  /** Phase 3 wires a canvas executor; until then approved batches show a waiting note. */
  executorReady?: boolean;
  flowId: string | null;
  models: CanvasAgentImageModel[];
  onClose: () => void;
  selectedCount: number;
};

export function AgentLoopView({ agent, executorReady = false, flowId, models, onClose, selectedCount }: AgentLoopViewProps) {
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow new output only while the user is already at the bottom.
  useEffect(() => {
    const element = scrollRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [agent.items, agent.phase]);

  const send = (text: string) => { setPrompt(""); void agent.send(text); };
  const title = agent.session?.title ?? "新建对话";

  return (
    <section aria-label="画布 Agent" className="agent-loop">
      <header className="agent-loop-header">
        <button aria-label="对话历史" className="agent-loop-icon" ref={historyTrigger} type="button" onClick={() => setHistoryOpen((value) => !value)}><History size={16} /></button>
        <strong className="agent-loop-title" title={title}>{title}</strong>
        <span className="agent-loop-header-spacer" />
        {flowId ? (
          <button aria-label={`项目文件（${agent.files.length}）`} className="agent-loop-icon" type="button" onClick={() => setFilesOpen(true)}>
            <FileText size={16} />
            {agent.files.length ? <span className="agent-loop-badge">{agent.files.length}</span> : null}
          </button>
        ) : null}
        <button aria-label="新建对话" className="agent-loop-icon" disabled={agent.busy} type="button" onClick={agent.newConversation}><MessageSquarePlus size={16} /></button>
        <button aria-label="收起 Agent" className="agent-loop-icon" type="button" onClick={onClose}><Minimize2 size={16} /></button>
      </header>

      <div
        aria-busy={agent.busy}
        aria-label="Agent 对话"
        className="agent-loop-scroll"
        ref={scrollRef}
        role="log"
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {!flowId ? <p className="agent-loop-empty">先保存画布，再使用 Agent。</p> : agent.items.length === 0 ? (
          <div className="agent-loop-empty">
            <h2>今天一起创作点什么？</h2>
            {EXAMPLES.map((example) => <button className="agent-loop-example" key={example} type="button" onClick={() => setPrompt(example)}>{example}</button>)}
          </div>
        ) : agent.items.map((item) => {
          switch (item.kind) {
            case "user": return <div className="agent-loop-user" key={item.id}>{item.text}</div>;
            case "assistant": return <div className="agent-loop-assistant" key={item.id}><AgentLoopMarkdown text={item.text} /></div>;
            case "steps": return <AgentLoopSteps key={item.id} steps={item.steps} />;
            case "questions": return <AgentLoopQuestionCard disabled={agent.busy} item={item} key={item.id} onSubmit={(payload) => void agent.answerQuestions(item.callId, item.questions, payload)} />;
            case "generation": return <AgentLoopGenerationCard disabled={agent.busy} item={item} key={item.id} models={models} waitingForExecutor={!executorReady} onDecide={(payload) => void agent.decideGeneration(item.callId, payload)} />;
            case "error": return <p className="agent-loop-error" key={item.id} role="alert">{item.message}</p>;
            default: return null;
          }
        })}
        <AgentLoopStatus phase={agent.phase} startedAt={agent.startedAt} />
      </div>

      <AgentLoopComposer
        busy={agent.busy}
        mode={agent.mode}
        prompt={prompt}
        selectedCount={selectedCount}
        setPrompt={setPrompt}
        onModeChange={(mode) => void agent.setMode(mode)}
        onSend={send}
        onStop={() => void agent.stop()}
      />

      {historyOpen ? (
        <AgentHistory
          items={agent.history.map((entry) => ({ date: entry.updatedAt.slice(0, 10), id: entry.id, selected: entry.id === agent.session?.id, title: entry.title }))}
          triggerRef={historyTrigger as RefObject<HTMLButtonElement>}
          onClose={() => setHistoryOpen(false)}
          onSelect={(id) => { setHistoryOpen(false); void agent.openSession(id); }}
        />
      ) : null}
      {filesOpen && flowId ? (
        <AgentLoopFiles files={agent.files} flowId={flowId} onClose={() => setFilesOpen(false)} onDiscuss={(path) => setPrompt(`关于 ${path}：`)} />
      ) : null}
    </section>
  );
}
