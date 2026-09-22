import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { ConversationStream } from "../protocol/ConversationStream";
import type { AgentExecutionMode, AgentV6Phase, ConversationBlock } from "../protocol/conversationTypes";
import { AgentCapabilityMenu, type AgentCapability } from "./AgentCapabilityMenu";
import { AgentComposer } from "./AgentComposer";
import { AgentHeader } from "./AgentHeader";
import { AgentHistory, type AgentHistoryItem } from "./AgentHistory";
import type { AgentReferenceChip } from "./AgentReferenceChips";
import type { AgentReferenceRole } from "../runtime/agentProtocol";

export type AgentWorkspaceHistoryItem = AgentHistoryItem;
export type AgentWorkspaceReference = AgentReferenceChip;
export type AgentWorkspaceProps = {
  blocks: readonly ConversationBlock[];
  title: string;
  phase: AgentV6Phase;
  prompt: string;
  references: readonly AgentWorkspaceReference[];
  history: readonly AgentWorkspaceHistoryItem[];
  historyLoading?: boolean;
  historyNow?: Date;
  model: string;
  modelOptions: readonly { label: string; value: string }[];
  mode?: AgentExecutionMode;
  busy?: boolean;
  error?: string | null;
  onNewConversation: () => void;
  onRename: (title: string) => void;
  onHistorySelect: (id: string) => void;
  onPromptChange: (prompt: string) => void;
  onRemoveReference: (id: string) => void;
  onRoleChange?: (id: string, role: AgentReferenceRole | undefined) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onCapability: (capability: AgentCapability) => void;
  onModeChange?: (mode: AgentExecutionMode) => void;
  onModelChange?: (model: string) => void;
  onCollapse?: () => void;
  onBlockAction?: ComponentProps<typeof ConversationStream>["onAction"];
};

type AgentWorkspaceLayer = "history" | "capability" | "mode" | "model" | null;

const phaseLabels: Record<AgentV6Phase, string> = { idle: "准备中", understanding: "理解中", waiting_for_input: "等待补充", waiting_for_choice: "等待选择", drafting_brief: "整理 Brief", waiting_for_confirmation: "等待确认", executing: "执行中", verifying: "校验中", presenting_results: "展示结果", refining: "优化中", failed: "需要处理", recoverable_error: "需要处理" };

export function AgentWorkspace({ blocks, title, phase, prompt, references, history, historyLoading, historyNow, model, modelOptions, mode = "auto", busy = false, error, onNewConversation, onRename, onHistorySelect, onPromptChange, onRemoveReference, onRoleChange, onSend, onCancel, onCapability, onModeChange, onModelChange, onCollapse, onBlockAction = () => undefined }: AgentWorkspaceProps) {
  const [activeLayer, setActiveLayer] = useState<AgentWorkspaceLayer>(null);
  const [mountedHistoryNow] = useState(() => new Date());
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const stableHistoryNow = historyNow ?? mountedHistoryNow;

  const setLayer = (layer: Exclude<AgentWorkspaceLayer, "history" | null>, open: boolean) => {
    setActiveLayer((currentLayer) => {
      if (open) return layer;
      return currentLayer === layer ? null : currentLayer;
    });
  };

  return (
    <section className="agent-v6-workspace agent-v6-workspace-responsive" data-testid="agent-v6-workspace">
      <AgentHeader historyTriggerRef={historyTriggerRef} title={title} phase={phaseLabels[phase]} onNewConversation={onNewConversation} onRename={onRename} onHistoryToggle={() => setActiveLayer((layer) => layer === "history" ? null : "history")} onCollapse={onCollapse} />
      <div className="agent-v6-workspace-body">
        <main className="agent-v6-message-stream" data-testid="agent-v6-message-stream" aria-label="Agent 消息流"><ConversationStream blocks={blocks} onAction={onBlockAction} />{error ? <p className="agent-v6-paragraph" role="alert">{error}</p> : null}</main>
        <AgentComposer prompt={prompt} references={references} mode={mode} model={model} modelOptions={modelOptions} busy={busy} onPromptChange={onPromptChange} onModeChange={onModeChange} onModelChange={onModelChange} onLayerChange={setLayer} onSend={onSend} onCancel={onCancel} onCapability={onCapability} onRemoveReference={onRemoveReference} onRoleChange={onRoleChange} />
        {activeLayer === "history" ? <AgentHistory items={history} loading={historyLoading} now={stableHistoryNow} onSelect={onHistorySelect} onClose={() => setActiveLayer((layer) => layer === "history" ? null : layer)} triggerRef={historyTriggerRef} /> : null}
      </div>
    </section>
  );
}

export { AgentCapabilityMenu };
