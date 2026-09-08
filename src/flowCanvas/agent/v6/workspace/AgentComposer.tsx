import { Send, Square } from "lucide-react";
import { MenuSelect } from "../../../../components/menu/MenuSelect";
import type { AgentExecutionMode } from "../protocol/conversationTypes";
import { AgentCapabilityMenu, type AgentCapability } from "./AgentCapabilityMenu";
import { AgentReferenceChips, type AgentReferenceChip } from "./AgentReferenceChips";

export type AgentComposerProps = {
  prompt: string;
  references: readonly AgentReferenceChip[];
  mode: AgentExecutionMode;
  model: string;
  modelOptions: readonly { label: string; value: string }[];
  busy?: boolean;
  onPromptChange: (prompt: string) => void;
  onModeChange?: (mode: AgentExecutionMode) => void;
  onModelChange?: (model: string) => void;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onCapability: (capability: AgentCapability) => void;
  onRemoveReference: (id: string) => void;
};

export function AgentComposer({ prompt, references, mode, model, modelOptions, busy = false, onPromptChange, onModeChange, onModelChange, onSend, onCancel, onCapability, onRemoveReference }: AgentComposerProps) {
  const canSend = prompt.trim().length > 0 && !busy;
  return (
    <footer className="agent-v6-composer agent-v6-composer-fixed" data-testid="agent-v6-composer">
      <AgentReferenceChips references={references} onRemove={onRemoveReference} />
      <div className="agent-v6-composer-toolbar">
        <AgentCapabilityMenu onSelect={onCapability} />
        <div className="agent-v6-mode" data-composer-slot="mode"><MenuSelect label="执行模式" value={mode} options={[{ label: "Agent 自动执行", value: "auto" }, { label: "用户确认", value: "manual_confirmation" }]} onChange={(value) => onModeChange?.(value as AgentExecutionMode)} size="compact" /></div>
        <textarea aria-label="Agent 输入" data-composer-slot="input" value={prompt} placeholder="描述你想在画布上完成的事" onChange={(event) => onPromptChange(event.target.value)} />
        <div className="agent-v6-model" data-composer-slot="model"><MenuSelect label="模型" value={model} options={[...modelOptions]} onChange={(value) => onModelChange?.(value)} size="compact" /></div>
        {busy ? <button aria-label="取消执行" className="agent-v6-send-button is-cancel" data-composer-slot="send" type="button" onClick={onCancel}><Square size={15} /></button> : <button aria-label="发送" className="agent-v6-send-button" data-composer-slot="send" disabled={!canSend} type="button" onClick={() => onSend(prompt.trim())}><Send size={15} /></button>}
      </div>
    </footer>
  );
}
