import { useState } from "react";
import type { AgentBlockAction } from "../BlockRenderer";
type ChoiceBlock = { id?: string; title?: string; options: { id: string; label: string; description?: string }[]; selectionMode: "single" | "multiple"; selectedOptionIds?: string[]; locked?: boolean };
export function ChoiceGridBlock({ block, onAction }: { block: ChoiceBlock; onAction: (action: AgentBlockAction) => void }) {
  const [selected, setSelected] = useState(block.selectedOptionIds ?? []);
  const blockId = block.id ?? "choice";
  const choose = (id: string) => {
    if (block.locked) return;
    const next = block.selectionMode === "single" ? [id] : selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    setSelected(next);
    onAction({ type: "select_choice", blockId, optionIds: next });
  };
  return <section className={`agent-v6-choice ${block.locked ? "is-locked" : ""}`} aria-label={block.title ?? "请选择"}>
    {block.title ? <h3>{block.title}</h3> : null}
    <div className="agent-v6-choice-grid" role="group" aria-label={block.title ?? "选项"}>
      {block.options.map((option) => <button key={option.id} type="button" aria-pressed={selected.includes(option.id)} disabled={block.locked} onClick={() => choose(option.id)}>
        <strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}
      </button>)}
    </div>
    {block.locked ? <p className="agent-v6-muted">已锁定</p> : null}
  </section>;
}
