import { X } from "lucide-react";

export type AgentReferenceChip = { id: string; label: string };

export function AgentReferenceChips({ references, onRemove }: { references: readonly AgentReferenceChip[]; onRemove: (id: string) => void }) {
  if (references.length === 0) return null;
  return (
    <div className="agent-v6-reference-chips" aria-label="当前引用">
      {references.map((reference) => (
        <span className="agent-v6-reference-chip" key={reference.id}>
          <span>{reference.label}</span>
          <button aria-label={`移除${reference.label}引用`} type="button" onClick={() => onRemove(reference.id)}><X size={12} /></button>
        </span>
      ))}
    </div>
  );
}
