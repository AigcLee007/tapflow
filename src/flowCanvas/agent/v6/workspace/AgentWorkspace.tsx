import type { ComponentProps } from "react";
import { useState } from "react";
import { ConversationStream } from "../protocol/ConversationStream";
import type { AgentExecutionMode, AgentV6Phase, ConversationBlock } from "../protocol/conversationTypes";
import { AgentCapabilityMenu, type AgentCapability } from "./AgentCapabilityMenu";
import { AgentComposer } from "./AgentComposer";
import { AgentHeader } from "./AgentHeader";
import { AgentHistory, type AgentHistoryItem } from "./AgentHistory";
import type { AgentReferenceChip } from "./AgentReferenceChips";

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
  model: string;
  modelOptions: readonly { label: string; value: string }[];
  mode?: AgentExecutionMode;
  busy?: boolean;
  onNewConversation: () => void;
  onRename: (title: string) => void;
  onHistorySelect: (id: string) => void;
  onPromptChange: (prompt: string) => void;
  onRemoveReference: (id: string) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onCapability: (capability: AgentCapability) => void;
  onModeChange?: (mode: AgentExecutionMode) => void;
  onModelChange?: (model: string) => void;
  onCollapse?: () => void;
  onBlockAction?: ComponentProps<typeof ConversationStream>["onAction"];
};

const phaseLabels: Record<AgentV6Phase, string> = { idle: "准备中", understanding: "理解中", waiting_for_choice: "等待选择", drafting_brief: "整理 Brief", waiting_for_confirmation: "等待确认", executing: "执行中", verifying: "校验中", presenting_results: "展示结果", refining: "优化中", failed: "需要处理" };

export function AgentWorkspace({ blocks, title, phase, prompt, references, history, historyLoading, model, modelOptions, mode = "auto", busy = false, onNewConversation, onRename, onHistorySelect, onPromptChange, onRemoveReference, onSend, onCancel, onCapability, onModeChange, onModelChange, onCollapse, onBlockAction = () => undefined }: AgentWorkspaceProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <section className="agent-v6-workspace agent-v6-workspace-responsive" data-testid="agent-v6-workspace">
      <AgentHeader title={title} phase={phaseLabels[phase]} onNewConversation={onNewConversation} onRename={onRename} onHistoryToggle={() => setHistoryOpen((open) => !open)} onCollapse={onCollapse} />
      <div className="agent-v6-workspace-body">
        <main className="agent-v6-message-stream" data-testid="agent-v6-message-stream" aria-label="Agent 消息流"><ConversationStream blocks={blocks} onAction={onBlockAction} /></main>
        <AgentComposer prompt={prompt} references={references} mode={mode} model={model} modelOptions={modelOptions} busy={busy} onPromptChange={onPromptChange} onModeChange={onModeChange} onModelChange={onModelChange} onSend={onSend} onCancel={onCancel} onCapability={onCapability} onRemoveReference={onRemoveReference} />
        {historyOpen ? <AgentHistory items={history} loading={historyLoading} onSelect={onHistorySelect} onClose={() => setHistoryOpen(false)} /> : null}
      </div>
    </section>
  );
}

export { AgentCapabilityMenu };
