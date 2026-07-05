/**
 * TapNow-style right-click context menu.
 */
import React, { memo, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  CheckSquare,
  Copy,
  Film,
  FolderPlus,
  Grid3X3,
  Image as ImageIcon,
  List,
  Lock,
  Music,
  Trash2,
  Unlock,
  Upload,
  Video,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { FlowNodeKind } from '../types';
import {
  MENU_BETA_PILL_STYLE,
  MENU_ITEM_DESC_STYLE,
  MENU_ITEM_GAP,
  MENU_ITEM_HEIGHT,
  MENU_ITEM_ICON_RADIUS,
  MENU_ITEM_ICON_SIZE,
  MENU_ITEM_LABEL_STYLE,
  MENU_ITEM_LABEL_SIZE,
  MENU_ITEM_PADDING,
  MENU_ITEM_RADIUS,
  MENU_SECTION_LABEL_STYLE,
  buildMenuItemIconStyle,
  buildMenuItemStyle,
  buildMenuPanelStyle,
} from './menuTokens';

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: MENU_ITEM_GAP,
  width: '100%',
  minHeight: MENU_ITEM_HEIGHT,
  padding: MENU_ITEM_PADDING,
  background: 'transparent',
  border: 'none',
  color: '#e2e8f0',
  fontSize: MENU_ITEM_LABEL_SIZE,
  fontWeight: 700,
  lineHeight: 1.1,
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: MENU_ITEM_RADIUS,
  transition: 'background 0.12s ease',
};

const dangerItemStyle: React.CSSProperties = { ...menuItemStyle, color: '#fca5a5' };
const separatorStyle: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)', margin: '5px 8px' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#64748b', padding: '8px 12px 5px', userSelect: 'none' };

type PaneAddItem = {
  kind?: FlowNodeKind;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  beta?: boolean;
  disabled?: boolean;
};

const PANE_ADD_ITEMS: PaneAddItem[] = [
  { kind: 'text', icon: <List size={18} strokeWidth={1.75} />, label: '文本', desc: '脚本、广告词、品牌文案' },
  { kind: 'image', icon: <ImageIcon size={18} strokeWidth={1.75} />, label: '图片' },
  { kind: 'video', icon: <Video size={18} strokeWidth={1.75} />, label: '视频' },
  { kind: 'audio', icon: <Music size={18} strokeWidth={1.75} />, label: '音频' },
  { kind: 'director3d', icon: <Box size={18} strokeWidth={1.75} />, label: '3D导演台', desc: '场景、机位和镜头调度', beta: true },
  { kind: 'storyboard', icon: <Grid3X3 size={18} strokeWidth={1.75} />, label: '故事板', desc: '分镜、镜头和素材引用', beta: true },
  { kind: 'video_editor', icon: <Film size={18} strokeWidth={1.75} />, label: '剪辑工程', desc: '时间线、字幕和导出', beta: true },
];

const PANE_RESOURCE_ITEMS: PaneAddItem[] = [
  { kind: 'upload', icon: <Upload size={18} strokeWidth={1.75} />, label: '上传' },
];

const HoverButton: React.FC<{
  style: React.CSSProperties;
  children: React.ReactNode;
  onClick: () => void;
  hoverBg?: string;
}> = ({ style, children, onClick, hoverBg = 'rgba(255,255,255,0.07)' }) => (
  <button
    style={style}
    onClick={onClick}
    onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
  >
    {children}
  </button>
);

const PaneAddMenuItem: React.FC<{
  item: PaneAddItem;
  active?: boolean;
  onClick: () => void;
}> = ({ item, active, onClick }) => (
  <button
    type="button"
    className="nodrag nopan"
    onClick={onClick}
    disabled={item.disabled}
    style={paneAddItemStyle(active === true, item.disabled === true)}
  >
    <span style={paneAddIconStyle(active === true)}>{item.icon}</span>
    <span style={paneAddTextWrapStyle}>
      <span style={paneAddLabelRowStyle}>
        <span style={paneAddLabelStyle}>{item.label}</span>
        {item.beta && <span style={paneBetaPillStyle}>Beta</span>}
      </span>
      {item.desc && <span style={paneAddDescStyle}>{item.desc}</span>}
    </span>
  </button>
);

export const FlowContextMenu: React.FC = memo(function FlowContextMenu() {
  const contextMenu = useFlowCanvasStore((s) => s.contextMenu);
  const closeContextMenu = useFlowCanvasStore((s) => s.closeContextMenu);
  const deleteSelectedNodes = useFlowCanvasStore((s) => s.deleteSelectedNodes);
  const duplicateSelectedNodes = useFlowCanvasStore((s) => s.duplicateSelectedNodes);
  const lockNode = useFlowCanvasStore((s) => s.lockNode);
  const addNode = useFlowCanvasStore((s) => s.addNode);
  const groupSelectedNodes = useFlowCanvasStore((s) => s.groupSelectedNodes);
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const selectAll = useFlowCanvasStore((s) => s.selectAll);
  const ref = useRef<HTMLDivElement>(null);

  let reactFlow: ReturnType<typeof useReactFlow> | null = null;
  try {
    reactFlow = useReactFlow();
  } catch {}

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) closeContextMenu();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const isNodeMenu = !!contextMenu.nodeId;
  const targetNode = contextMenu.nodeId ? nodes.find((n) => n.id === contextMenu.nodeId) : null;
  const isLocked = targetNode?.data?.locked === true;
  const selectedNodes = nodes.filter((n) => n.selected && n.type !== 'group');

  const handleQuickAdd = (kind: FlowNodeKind) => {
    if (reactFlow) {
      const flowPos = reactFlow.screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
      addNode(kind, flowPos);
    }
    closeContextMenu();
  };

  const renderPaneAddItem = (item: PaneAddItem, index: number) => (
    <PaneAddMenuItem
      key={`${item.label}-${index}`}
      item={item}
      active={index === 0 && !item.disabled}
      onClick={() => {
        if (!item.kind || item.disabled) return;
        handleQuickAdd(item.kind);
      }}
    />
  );

  return (
    <div ref={ref} style={isNodeMenu ? { ...menuStyle, left: contextMenu.x, top: contextMenu.y } : getPaneMenuStyle(contextMenu.x, contextMenu.y)}>
      {isNodeMenu ? (
        <>
          <HoverButton style={menuItemStyle} onClick={() => { duplicateSelectedNodes(); closeContextMenu(); }}>
            <Copy size={16} /> 复制节点
          </HoverButton>
          <HoverButton
            style={menuItemStyle}
            onClick={() => {
              if (contextMenu.nodeId) lockNode(contextMenu.nodeId, !isLocked);
              closeContextMenu();
            }}
          >
            {isLocked ? <Unlock size={16} /> : <Lock size={16} />}
            {isLocked ? '解除锁定' : '锁定节点'}
          </HoverButton>
          {selectedNodes.length > 0 && (
            <HoverButton style={menuItemStyle} onClick={() => { groupSelectedNodes(); closeContextMenu(); }}>
              <FolderPlus size={16} /> 创建分组
            </HoverButton>
          )}
          <div style={separatorStyle} />
          <HoverButton style={dangerItemStyle} onClick={() => { deleteSelectedNodes(); closeContextMenu(); }} hoverBg="rgba(239,68,68,0.13)">
            <Trash2 size={16} /> 删除节点
          </HoverButton>
        </>
      ) : (
        <>
          <div style={paneSectionLabelStyle}>添加节点</div>
          {PANE_ADD_ITEMS.map(renderPaneAddItem)}
          <div style={paneSectionLabelStyle}>添加资源</div>
          {PANE_RESOURCE_ITEMS.map(renderPaneAddItem)}
          {nodes.length > 0 && (
            <>
              <div style={paneSeparatorStyle} />
              <HoverButton style={menuItemStyle} onClick={() => { selectAll(); closeContextMenu(); }}>
                <CheckSquare size={16} /> 全选
              </HoverButton>
            </>
          )}
        </>
      )}
    </div>
  );
});

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 200,
  minWidth: 208,
  background: 'rgba(24,24,31,0.97)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 16,
  padding: '7px 5px',
  backdropFilter: 'blur(18px)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.48)',
  maxHeight: '80vh',
  overflow: 'auto',
};

const iconBoxStyle: React.CSSProperties = {
  width: MENU_ITEM_ICON_SIZE,
  height: MENU_ITEM_ICON_SIZE,
  borderRadius: MENU_ITEM_ICON_RADIUS,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.055)',
  color: '#cbd5e1',
};

const getPaneMenuStyle = (x: number, y: number): React.CSSProperties => {
  const width = 224;
  const height = 404;
  const margin = 24;
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const left = Math.max(margin, Math.min(x - 24, viewportWidth - width - margin));
  const top = Math.max(margin, Math.min(y - 24, viewportHeight - height - margin));

  return {
    ...paneAddMenuStyle,
    left,
    top,
  };
};

const paneAddMenuStyle: React.CSSProperties = buildMenuPanelStyle();

const paneSectionLabelStyle: React.CSSProperties = MENU_SECTION_LABEL_STYLE;

const paneAddItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  ...buildMenuItemStyle(active, disabled),
  opacity: disabled ? 0.9 : 1,
});

const paneAddIconStyle = (active: boolean): React.CSSProperties => buildMenuItemIconStyle(active);

const paneAddTextWrapStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const paneAddLabelStyle: React.CSSProperties = MENU_ITEM_LABEL_STYLE;

const paneAddLabelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

const paneAddDescStyle: React.CSSProperties = MENU_ITEM_DESC_STYLE;

const paneBetaPillStyle: React.CSSProperties = MENU_BETA_PILL_STYLE;

const paneSeparatorStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.07)',
  margin: '8px 0 6px',
};
