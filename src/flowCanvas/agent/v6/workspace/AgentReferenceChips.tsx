import { X } from "lucide-react";
import { MenuSelect } from "../../../../components/menu/MenuSelect";
import type { AgentReferenceRole } from "../../runtime/agentProtocol";

export type AgentReferenceChip = {
  id: string;
  label: string;
  kind?: "artifact" | "canvas_node" | "upload";
  assetId?: string;
  nodeId?: string;
  refId?: string;
  role?: AgentReferenceRole;
};

const roleOptions = [
  { label: "未指定", value: "" },
  { label: "主体", value: "subject" },
  { label: "风格", value: "style" },
  { label: "构图", value: "composition" },
  { label: "布局", value: "layout" },
  { label: "上下文", value: "context" },
];

export function AgentReferenceChips({ references, onRemove, onRoleChange }: { references: readonly AgentReferenceChip[]; onRemove: (id: string) => void; onRoleChange?: (id: string, role: AgentReferenceRole | undefined) => void }) {
  if (references.length === 0) return null;
  return (
    <div className="agent-v6-reference-chips" aria-label="当前引用">
      {references.map((reference) => (
        <span className="agent-v6-reference-chip" key={reference.id}>
          <span>{reference.label}</span>
          {onRoleChange ? <MenuSelect label={`${reference.label}角色`} value={reference.role ?? ""} options={roleOptions} size="compact" onChange={(value) => onRoleChange(reference.id, value ? value as AgentReferenceRole : undefined)} /> : null}
          <button aria-label={`移除${reference.label}引用`} type="button" onClick={() => onRemove(reference.id)}><X size={12} /></button>
        </span>
      ))}
    </div>
  );
}
