import { ArrowUp, Check, Hand, MousePointerClick, RefreshCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CanvasAgentMode } from "./canvasAgentTypes";

const MODES: Array<{ description: string; icon: typeof Hand; label: string; value: CanvasAgentMode }> = [
  { description: "Agent 在执行生成前都会寻求您的确认", icon: Hand, label: "手动确认", value: "manual" },
  { description: "Agent 会自主规划生成任务并自动执行", icon: RefreshCw, label: "自动生成", value: "auto" },
];

function ModeMenu({ mode, onChange }: { mode: CanvasAgentMode; onChange: (mode: CanvasAgentMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = MODES.find((entry) => entry.value === mode) ?? MODES[0]!;
  const Icon = current.icon;
  return (
    <div className="agent-loop-mode" ref={ref}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={`执行模式：${current.label}`} className="agent-loop-icon" title={current.label} type="button" onClick={() => setOpen((value) => !value)}>
        <Icon size={16} />
      </button>
      {open ? (
        <div className="agent-loop-mode-menu" role="menu">
          {MODES.map((entry) => {
            const EntryIcon = entry.icon;
            return (
              <button aria-checked={entry.value === mode} className="agent-loop-mode-item" key={entry.value} role="menuitemradio" type="button" onClick={() => { onChange(entry.value); setOpen(false); }}>
                <EntryIcon aria-hidden size={15} />
                <span><strong>{entry.label}</strong><span>{entry.description}</span></span>
                {entry.value === mode ? <Check aria-hidden size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AgentLoopComposer({ busy, mode, onModeChange, onSend, onStop, prompt, selectedCount, setPrompt }: {
  busy: boolean;
  mode: CanvasAgentMode;
  onModeChange: (mode: CanvasAgentMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  prompt: string;
  selectedCount: number;
  setPrompt: (value: string) => void;
}) {
  const canSend = prompt.trim().length > 0 && !busy;
  const send = () => { if (canSend) onSend(prompt.trim()); };
  return (
    <footer className="agent-loop-composer">
      {selectedCount > 0 ? (
        <div className="agent-loop-chips" aria-label="已选画布节点">
          <span className="agent-loop-chip"><MousePointerClick aria-hidden size={13} />已选 {selectedCount} 个画布节点</span>
        </div>
      ) : null}
      <textarea
        aria-label="Agent 输入"
        className="agent-loop-input"
        placeholder="随心输入"
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter adds a line; never send while an IME is composing.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
        }}
      />
      <div className="agent-loop-composer-row">
        <ModeMenu mode={mode} onChange={onModeChange} />
        <span className="agent-loop-composer-spacer" />
        {busy
          ? <button aria-label="停止" className="agent-loop-send is-stop" type="button" onClick={onStop}><Square size={13} /></button>
          : <button aria-label="发送" className="agent-loop-send" disabled={!canSend} type="button" onClick={send}><ArrowUp size={16} /></button>}
      </div>
    </footer>
  );
}
