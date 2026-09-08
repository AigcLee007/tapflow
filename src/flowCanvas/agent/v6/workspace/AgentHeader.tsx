import { Check, ChevronDown, Edit3, History, Minimize2, Plus, X } from "lucide-react";
import { useState, type RefObject } from "react";

export type AgentHeaderProps = {
  title: string;
  phase: string;
  onNewConversation: () => void;
  onRename: (title: string) => void;
  onHistoryToggle: () => void;
  historyTriggerRef?: RefObject<HTMLButtonElement>;
  onCollapse?: () => void;
};

export function AgentHeader({ title, phase, onNewConversation, onRename, onHistoryToggle, historyTriggerRef, onCollapse }: AgentHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function saveTitle() {
    const next = draft.trim();
    if (next) onRename(next);
    setEditing(false);
  }

  return (
    <header className="agent-v6-header">
      <div className="agent-v6-header-title">
        {editing ? (
          <div className="agent-v6-title-edit">
            <input aria-label="对话标题" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button aria-label="保存标题" type="button" onClick={saveTitle}><Check size={15} /></button>
            <button aria-label="取消重命名" type="button" onClick={() => setEditing(false)}><X size={15} /></button>
          </div>
        ) : (
          <>
            <strong title={title}>{title}</strong>
            <button aria-label="重命名" className="agent-v6-icon-button" type="button" onClick={() => { setDraft(title); setEditing(true); }}><Edit3 size={14} /></button>
          </>
        )}
        <span className="agent-v6-phase"><span>{phase}</span><ChevronDown size={13} /></span>
      </div>
      <div className="agent-v6-header-actions">
        <button aria-label="新建对话" className="agent-v6-icon-button" type="button" onClick={onNewConversation}><Plus size={16} /></button>
        <button ref={historyTriggerRef} aria-label="历史" className="agent-v6-icon-button" type="button" onClick={onHistoryToggle}><History size={16} /></button>
        {onCollapse ? <button aria-label="收起 Agent" className="agent-v6-icon-button" type="button" onClick={onCollapse}><Minimize2 size={16} /></button> : null}
      </div>
    </header>
  );
}
