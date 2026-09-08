import { useState } from "react";
import type { BriefField } from "../conversationTypes";
import type { AgentBlockAction } from "../BlockRenderer";
export function BriefBlock({ block, onAction }: { block: { id?: string; title?: string; fields: BriefField[]; editable: boolean }; onAction: (action: AgentBlockAction) => void }) {
  const blockId = block.id ?? "brief";
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(block.fields);
  const update = (index: number, value: string) => setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, value } : field));
  return <section className="agent-v6-brief" aria-label={block.title ?? "Brief"}>
    <span className="agent-v6-eyebrow">Brief</span><h3>{block.title ?? "共创 Brief"}</h3>
    <div className="agent-v6-brief-fields">{fields.map((field, index) => <label key={field.label}><span>{field.label}</span>{editing ? <input aria-label={field.label} value={field.value} onChange={(event) => update(index, event.target.value)} /> : <strong>{field.value}</strong>}</label>)}</div>
    {block.editable ? <div className="agent-v6-actions">
      <button type="button" onClick={() => { setEditing(true); onAction({ type: "edit_brief", blockId }); }}>编辑 Brief</button>
      <button type="button" onClick={() => { setEditing(false); onAction({ type: "submit_brief", blockId, fields }); }}>提交 Brief</button>
      <button type="button" onClick={() => onAction({ type: "revise_brief", blockId })}>修改 Brief</button>
    </div> : null}
  </section>;
}
