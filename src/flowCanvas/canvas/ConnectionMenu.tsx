/**
 * Floating menu shown when a connection is dropped on empty canvas.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { Box, Globe2, Image as ImageIcon, List, PlaySquare, Wand2 } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { FlowNodeKind } from '../types';
import { getConnectionActionsForSource, getConnectionAction } from '../rules/connectionRules';
import {
  MENU_ITEM_DESC_STYLE,
  MENU_ITEM_LABEL_STYLE,
  MENU_SECTION_LABEL_STYLE,
  buildMenuItemIconStyle,
  buildMenuItemStyle,
  buildMenuPanelStyle,
} from './menuTokens';

interface ConnectionMenuProps {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
  sourceNodeId: string;
  onClose: () => void;
}

const ICON_BY_KIND: Record<string, React.ReactNode> = {
  text: <List size={18} strokeWidth={1.75} />,
  image: <ImageIcon size={18} strokeWidth={1.75} />,
  video: <PlaySquare size={18} strokeWidth={1.8} />,
  image_editor: <Wand2 size={18} strokeWidth={1.8} />,
  panorama_viewer: <Globe2 size={18} strokeWidth={1.8} />,
  world3d: <Box size={18} strokeWidth={1.75} />,
};

export const ConnectionMenu: React.FC<ConnectionMenuProps> = memo(function ConnectionMenu({
  x,
  y,
  flowX,
  flowY,
  sourceNodeId,
  onClose,
}) {
  const addNodeAndEdge = useFlowCanvasStore((s) => s.addNodeAndEdge);
  const sourceNode = useFlowCanvasStore((s) => s.nodes.find((node) => node.id === sourceNodeId));
  const ref = useRef<HTMLDivElement>(null);
  const actions = getConnectionActionsForSource(sourceNode);
  const [hoveredKind, setHoveredKind] = useState<string>(actions[0]?.kind || '');

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {}

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    setHoveredKind((current) => (actions.some((action) => action.kind === current) ? current : actions[0]?.kind || ''));
  }, [actions]);

  const handleSelect = (kind: FlowNodeKind) => {
    const flowPos = reactFlow
      ? reactFlow.screenToFlowPosition({ x: x + 28, y: y + 88 })
      : { x: flowX, y: flowY };
    const action = getConnectionAction(sourceNode, kind);

    addNodeAndEdge(kind, flowPos, sourceNodeId, 'out', 'in', {
      generationPrompt: action?.promptSeed || '',
    });
    onClose();
  };

  return (
    <div ref={ref} style={{ ...menuStyle, left: x, top: y }}>
      <div style={headerStyle}>引用该节点生成</div>
      {actions.map((item) => (
        <button
          key={item.kind}
          type="button"
          style={menuItemStyle(hoveredKind === item.kind, false)}
          onClick={() => handleSelect(item.kind)}
          onMouseEnter={() => setHoveredKind(String(item.kind))}
        >
          <span style={iconBoxStyle(hoveredKind === item.kind)}>{ICON_BY_KIND[item.kind]}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={labelStyle}>{item.label}</div>
            {item.desc && hoveredKind === item.kind && <div style={descStyle}>{item.desc}</div>}
          </div>
        </button>
      ))}
      {actions.length === 0 && (
        <div style={emptyStyle}>该节点暂不支持继续生成</div>
      )}
    </div>
  );
});

const menuStyle: React.CSSProperties = buildMenuPanelStyle();

const headerStyle: React.CSSProperties = MENU_SECTION_LABEL_STYLE;

const menuItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  ...buildMenuItemStyle(active, disabled),
  transition: 'background 140ms ease',
});

const iconBoxStyle = (active: boolean): React.CSSProperties => buildMenuItemIconStyle(active);

const labelStyle: React.CSSProperties = MENU_ITEM_LABEL_STYLE;

const descStyle: React.CSSProperties = {
  ...MENU_ITEM_DESC_STYLE,
  marginTop: 2,
};

const emptyStyle: React.CSSProperties = {
  minHeight: 72,
  display: 'grid',
  placeItems: 'center',
  color: 'rgba(255,255,255,0.44)',
  fontSize: 12,
  fontWeight: 650,
};
