import { useState } from "react";
import type { BriefField } from "../conversationTypes";
import type { AgentBlockAction } from "../BlockRenderer";
export function BriefBlock({ block, onAction }: { block: { id?: string; title?: string; fields: BriefField[]; editable: boolean; locked?: boolean }; onAction: (action: AgentBlockAction) => void }) {
  const blockId = block.id ?? "brief";
  const locked = block.locked === true;
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(block.fields);
  const update = (index: number, value: string) => setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, value } : field));
  return <section className={`agent-v6-brief ${locked ? "is-locked" : ""}`} aria-label={block.title ?? "Brief"} aria-disabled={locked} data-state={locked ? "locked" : "interactive"}>
    <span className="agent-v6-eyebrow">Brief</span><h3>{block.title ?? "共创 Brief"}</h3>
    <div className="agent-v6-brief-fields">{fields.map((field, index) => <label key={field.label}><span>{field.label}</span>{editing ? <input aria-label={field.label} disabled={locked} aria-disabled={locked} value={field.value} onChange={(event) => { if (!locked) update(index, event.target.value); }} /> : <strong>{field.value}</strong>}</label>)}</div>
    {block.editable ? <div className="agent-v6-actions">
      <button type="button" disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) { setEditing(true); onAction({ type: "edit_brief", blockId }); } }}>编辑 Brief</button>
      <button type="button" disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) { setEditing(false); onAction({ type: "submit_brief", blockId, fields }); } }}>提交 Brief</button>
      <button type="button" disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) onAction({ type: "revise_brief", blockId }); }}>修改 Brief</button>
    </div> : null}
  </section>;
}
