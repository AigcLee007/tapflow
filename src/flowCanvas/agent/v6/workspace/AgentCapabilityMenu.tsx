import { AppWindow, Boxes, ImagePlus, Layers3, Plus, Sparkles } from "lucide-react";
import type { RefObject } from "react";
import { MenuSurface } from "../../../../components/menu/MenuSurface";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS, MENU_ITEM_SECONDARY_CLASS } from "../../../../components/menu/menuStyles";
import { useDismissibleLayer } from "../../../../components/menu/useDismissibleLayer";

export type AgentCapability = "canvas" | "upload" | "skill" | "app";

const capabilities: Array<{ id: AgentCapability; label: string; description: string; Icon: typeof Layers3 }> = [
  { id: "canvas", label: "画布", description: "引用当前画布节点", Icon: Layers3 },
  { id: "upload", label: "上传", description: "添加图片或文件引用", Icon: ImagePlus },
  { id: "skill", label: "Skill", description: "选择可用的工作技能", Icon: Sparkles },
  { id: "app", label: "App", description: "连接外部应用能力", Icon: AppWindow },
];

export function AgentCapabilityMenu({ onOpenChange, onSelect }: { onOpenChange?: (open: boolean) => void; onSelect: (capability: AgentCapability) => void }) {
  const layer = useDismissibleLayer("agent-v6-capabilities", { onDismiss: () => onOpenChange?.(false) });
  return (
    <div className="agent-v6-capability-layer" data-composer-slot="capability">
      <button ref={layer.triggerRef as RefObject<HTMLButtonElement>} aria-expanded={layer.open} aria-haspopup="menu" aria-label="添加能力" className="agent-v6-composer-icon" type="button" onClick={() => { const nextOpen = !layer.open; layer.toggle(); onOpenChange?.(nextOpen); }}><Plus size={17} /></button>
      {layer.open ? (
        <MenuSurface ref={layer.ref as RefObject<HTMLDivElement>} aria-label="Agent 能力" className="agent-v6-capability-menu" role="menu">
          <div className="agent-v6-menu-heading"><Boxes size={15} /><span>添加能力</span></div>
          {capabilities.map(({ id, label, description, Icon }) => (
            <button key={id} className={`${MENU_ITEM_CLASS} agent-v6-menu-item`} role="menuitem" type="button" onClick={() => { onSelect(id); layer.closeLayer(); onOpenChange?.(false); }}>
              <span className="agent-v6-menu-icon"><Icon size={15} /></span>
              <span><span className={MENU_ITEM_PRIMARY_CLASS}>{label}</span><span className={MENU_ITEM_SECONDARY_CLASS}>{description}</span></span>
            </button>
          ))}
        </MenuSurface>
      ) : null}
    </div>
  );
}
