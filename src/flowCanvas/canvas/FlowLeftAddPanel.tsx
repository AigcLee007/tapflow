/**
 * TapNow-style left dock and add-node flyout.
 */
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Bell,
  Box,
  CircleHelp,
  Clock3,
  Folder,
  Image as ImageIcon,
  LayoutList,
  List,
  LogOut,
  MessageCircle,
  Music,
  PlaySquare,
  Plus,
  Upload,
  User,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useAuth } from '../../auth/useAuth';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { FlowNodeKind } from '../types';
import { getAnchoredFlyoutPosition, type FlyoutPosition } from '../utils/flyoutLayout';

const LEFT_DOCK_VISUAL_SCALE = 0.7;

type AddEntry = {
  kind: FlowNodeKind | 'world3d' | 'playlist';
  label: string;
  desc?: string;
  icon: React.ReactNode;
  beta?: boolean;
  disabled?: boolean;
};

const PRIMARY_ITEMS: AddEntry[] = [
  { kind: 'text', label: '文本', desc: '脚本、提示词和文案', icon: <List size={18} strokeWidth={1.75} /> },
  { kind: 'image', label: '图片', icon: <ImageIcon size={18} strokeWidth={1.75} /> },
  { kind: 'video', label: '视频', icon: <PlaySquare size={18} strokeWidth={1.8} /> },
  { kind: 'audio', label: '音频', icon: <Music size={18} strokeWidth={1.8} /> },
  { kind: 'world3d', label: '3D 世界', icon: <Box size={18} strokeWidth={1.75} />, beta: true, disabled: true },
];

const TOOL_ITEMS: AddEntry[] = [
  { kind: 'playlist', label: '播放列表', icon: <LayoutList size={18} strokeWidth={1.75} />, beta: true, disabled: true },
  { kind: 'image_editor', label: '图片编辑节点', icon: <Wand2 size={18} strokeWidth={1.8} /> },
];

const RESOURCE_ITEMS: AddEntry[] = [
  { kind: 'upload', label: '上传', icon: <Upload size={18} strokeWidth={1.85} /> },
];

const isFlowNodeKind = (kind: AddEntry['kind']): kind is FlowNodeKind =>
  ['text', 'image', 'video', 'audio', 'upload', 'image_editor', 'group'].includes(kind);

const navigateTo = (path: string) => {
  window.location.href = path;
};

const DockTooltip: React.FC<{ label: string; visible: boolean }> = ({ label, visible }) => {
  if (!visible) return null;
  return <div style={dockTooltipStyle}>{label}</div>;
};

const DockButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: boolean;
  large?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}> = ({ icon, label, active, badge, large, onClick, onMouseEnter, onMouseLeave, buttonRef }) => {
  const [hovered, setHovered] = useState(false);
  const showTooltip = hovered && !active && !large;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => {
        setHovered(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        setHovered(false);
        onMouseLeave?.();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="nodrag nopan"
        onClick={onClick}
        style={large ? addButtonStyle(active) : dockButtonStyle(active || hovered)}
        title={label}
      >
        {icon}
        {badge && <span style={dockBadgeStyle} />}
      </button>
      <DockTooltip label={label} visible={showTooltip} />
    </div>
  );
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const AddNodeFlyout: React.FC<{
  onAdd: (kind: FlowNodeKind) => void;
  position: FlyoutPosition;
}> = ({ onAdd, position }) => {
  const [hoveredKind, setHoveredKind] = useState<string>('text');

  const renderItem = (item: AddEntry) => {
    const active = hoveredKind === item.kind;
    return (
      <button
        key={item.kind}
        type="button"
        className="nodrag nopan"
        onClick={() => {
          if (!item.disabled && isFlowNodeKind(item.kind)) onAdd(item.kind);
        }}
        onMouseEnter={() => setHoveredKind(String(item.kind))}
        style={flyoutItemStyle(active, !!item.disabled)}
      >
        <span style={flyoutIconStyle(active)}>{item.icon}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={flyoutLabelStyle}>{item.label}</span>
          {item.desc && active && <span style={flyoutDescStyle}>{item.desc}</span>}
        </span>
        {item.beta && <span style={betaPillStyle}>Beta</span>}
      </button>
    );
  };

  return (
    <div className="nodrag nopan nowheel" style={flyoutStyle(position)}>
      <div style={flyoutSectionTitleStyle}>添加节点</div>
      {PRIMARY_ITEMS.map(renderItem)}
      <div style={flyoutSectionTitleStyle}>工具</div>
      {TOOL_ITEMS.map(renderItem)}
      <div style={flyoutSectionTitleStyle}>资源</div>
      {RESOURCE_ITEMS.map(renderItem)}
    </div>
  );
};

const UserFlyout: React.FC<{
  authenticated: boolean;
  loading: boolean;
  onLogout: () => void;
  user: { displayName: string | null; email: string } | null;
  position: FlyoutPosition;
}> = ({ authenticated, loading, onLogout, user, position }) => {
  const displayName = loading
    ? '加载中...'
    : user?.displayName || user?.email?.split('@')[0] || '访客';
  const email = loading ? '正在同步账号信息' : user?.email || '登录后查看账号信息';
  const initial = user
    ? (displayName.trim().charAt(0).toUpperCase() || 'U')
    : loading
      ? '...'
      : 'L';

  return (
    <div className="nodrag nopan nowheel" style={userMenuStyle(position)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={userAvatarLargeStyle}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 760, lineHeight: 1.1 }}>{displayName}</div>
          <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, fontWeight: 560, marginTop: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
      </div>
      <div style={userDividerStyle} />
      <UserMenuItem icon={<User size={19} />} label={authenticated ? '账号' : '登录'} onClick={() => navigateTo(authenticated ? '/account' : '/login')} />
      <UserMenuItem icon={<Wallet size={19} />} label="计费" onClick={() => navigateTo('/billing')} />
      <UserMenuItem icon={<Bell size={19} />} label="工作区" onClick={() => navigateTo('/workspace')} />
      <div style={userDividerStyle} />
      <UserMenuItem icon={<CircleHelp size={19} />} label="帮助" />
      {authenticated ? (
        <UserMenuItem icon={<LogOut size={19} />} label="退出登录" onClick={onLogout} />
      ) : (
        <UserMenuItem icon={<LogOut size={19} />} label="前往登录" onClick={() => navigateTo('/login')} />
      )}
    </div>
  );
};

const UserMenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void }> = ({ icon, label, onClick }) => (
  <button type="button" className="nodrag nopan" onClick={onClick} style={userMenuItemStyle}>
    <span style={userMenuIconStyle}>{icon}</span>
    <span>{label}</span>
  </button>
);

export const FlowLeftAddPanel: React.FC = memo(function FlowLeftAddPanel() {
  const addNode = useFlowCanvasStore((s) => s.addNode);
  const undo = useFlowCanvasStore((s) => s.undo);
  const { authenticated, loading: userLoading, logout, user } = useAuth();
  const reactFlow = useReactFlow();
  const dockHostRef = useRef<HTMLDivElement | null>(null);
  const userButtonRef = useRef<HTMLButtonElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [flyoutPosition, setFlyoutPosition] = useState<FlyoutPosition>({
    left: 88,
    top: 88,
    maxHeight: 560,
  });
  const [userFlyoutPosition, setUserFlyoutPosition] = useState<FlyoutPosition>({
    left: 88,
    top: 88,
    maxHeight: 520,
  });
  const closeTimerRef = useRef<number | null>(null);

  const openAdd = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setUserOpen(false);
    setAddOpen(true);
  };

  const scheduleCloseAdd = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setAddOpen(false), 140);
  };

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!addOpen && !userOpen) return;

    const updateFloatingPositions = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 24;

      const hostRect = dockHostRef.current?.getBoundingClientRect();
      if (hostRect && addOpen) {
        setFlyoutPosition(
          getAnchoredFlyoutPosition({
            anchorRect: { top: hostRect.top, right: hostRect.right },
            viewportWidth,
            viewportHeight,
            panelWidth: 224,
            panelMaxHeight: 560,
            offsetLeft: 8,
            offsetTop: -12,
            margin,
          }),
        );
      }

      const userRect = userButtonRef.current?.getBoundingClientRect();
      if (userRect && userOpen) {
        const maxHeight = Math.max(280, Math.min(372, viewportHeight - margin * 2));
        setUserFlyoutPosition(
          getAnchoredFlyoutPosition({
            anchorRect: { top: userRect.bottom, right: hostRect?.right || userRect.right },
            viewportWidth,
            viewportHeight,
            panelWidth: 252,
            panelMaxHeight: maxHeight,
            offsetLeft: 8,
            offsetTop: -maxHeight + 52,
            margin,
          }),
        );
      }
    };

    updateFloatingPositions();
    window.addEventListener('resize', updateFloatingPositions);
    return () => window.removeEventListener('resize', updateFloatingPositions);
  }, [addOpen, userOpen]);

  const handleLogout = useCallback(() => {
    void logout().finally(() => {
      window.location.href = '/login';
    });
  }, [logout]);

  const handleAdd = useCallback(
    (kind: FlowNodeKind) => {
      const rect = document.querySelector('.react-flow')?.getBoundingClientRect();
      const center = reactFlow.screenToFlowPosition({
        x: (rect?.left || 0) + (rect?.width || window.innerWidth) / 2,
        y: (rect?.top || 0) + (rect?.height || window.innerHeight) / 2,
      });
      addNode(kind, center, undefined, { selected: true });
      setAddOpen(false);
    },
    [addNode, reactFlow],
  );

  return (
    <div ref={dockHostRef} style={dockHostStyle} onMouseLeave={() => setUserOpen(false)}>
      <div style={dockScaleShellStyle}>
        <div style={dockStyle}>
        <DockButton
          icon={addOpen ? <X size={20} strokeWidth={1.7} /> : <Plus size={26} strokeWidth={1.75} />}
          label="添加节点"
          large
          active={addOpen}
          onMouseEnter={openAdd}
          onClick={() => (addOpen ? setAddOpen(false) : openAdd())}
        />
        <DockButton icon={<Folder size={18} strokeWidth={1.8} />} label="素材库" badge />
        <DockButton icon={<LayoutList size={18} strokeWidth={1.85} />} label="模板列表" />
        <DockButton icon={<MessageCircle size={19} strokeWidth={1.85} />} label="评论" />
        <DockButton icon={<Clock3 size={19} strokeWidth={1.85} />} label="历史记录" onClick={undo} />
        <div style={dockDividerStyle} />
        <DockButton
          icon={<span style={userAvatarSmallStyle}>{(user?.displayName || user?.email || 'L').charAt(0).toUpperCase()}</span>}
          label="用户"
          active={userOpen}
          buttonRef={userButtonRef}
          onClick={() => {
            setAddOpen(false);
            setUserOpen((open) => !open);
          }}
        />
        </div>
      </div>

      {addOpen && (
        <div onMouseEnter={openAdd} onMouseLeave={scheduleCloseAdd}>
          <AddNodeFlyout onAdd={handleAdd} position={flyoutPosition} />
        </div>
      )}
      {userOpen && (
        <UserFlyout
          authenticated={authenticated}
          loading={userLoading}
          onLogout={handleLogout}
          position={userFlyoutPosition}
          user={user}
        />
      )}
    </div>
  );
});

const dockHostStyle: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  top: 166,
  zIndex: 1000,
};

const dockScaleShellStyle: React.CSSProperties = {
  transform: `scale(${LEFT_DOCK_VISUAL_SCALE})`,
  transformOrigin: 'top left',
};

const dockStyle: React.CSSProperties = {
  width: 60,
  minHeight: 348,
  padding: '5px 6px 8px',
  boxSizing: 'border-box',
  borderRadius: 30,
  background: 'rgba(31,31,31,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 22px 56px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  backdropFilter: 'blur(18px)',
};

const addButtonStyle = (active?: boolean): React.CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: active ? '1px solid rgba(255,255,255,0.1)' : 'none',
  background: active ? 'rgba(255,255,255,0.095)' : '#f7f7f7',
  color: active ? 'rgba(255,255,255,0.52)' : '#0b0b0d',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 140ms ease, color 140ms ease',
});

const dockButtonStyle = (active?: boolean): React.CSSProperties => ({
  position: 'relative',
  width: 40,
  height: 40,
  borderRadius: 12,
  border: 'none',
  background: active ? 'rgba(255,255,255,0.085)' : 'transparent',
  color: '#f4f4f5',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
  transition: 'background 140ms ease',
});

const dockBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  width: 10,
  height: 10,
  borderRadius: '50%',
  right: 4,
  top: 6,
  background: '#24a9ff',
  boxShadow: '0 0 0 2px rgba(31,31,31,0.96)',
};

const dockDividerStyle: React.CSSProperties = {
  width: 24,
  height: 1,
  background: 'rgba(255,255,255,0.14)',
  margin: '1px 0 4px',
};

const dockTooltipStyle: React.CSSProperties = {
  position: 'absolute',
  left: 'calc(100% + 8px)',
  top: '50%',
  transform: 'translateY(-50%)',
  padding: '7px 12px',
  borderRadius: 14,
  background: 'rgba(49,49,49,0.96)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 760,
  whiteSpace: 'nowrap',
  boxShadow: '0 12px 28px rgba(0,0,0,0.38)',
};

const flyoutStyle = (position: FlyoutPosition): React.CSSProperties => ({
  position: 'fixed',
  left: position.left,
  top: position.top,
  width: 224,
  maxHeight: position.maxHeight,
  overflow: 'auto',
  padding: '8px 10px 10px',
  boxSizing: 'border-box',
  borderRadius: 16,
  background: 'linear-gradient(155deg, rgba(28,28,29,0.985), rgba(23,25,28,0.985))',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.52)',
  backdropFilter: 'blur(18px)',
  zIndex: 1100,
});

const flyoutSectionTitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.34)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0,
  margin: '6px 0 4px',
};

const flyoutItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 38,
  border: 'none',
  borderRadius: 10,
  background: active ? 'rgba(255,255,255,0.088)' : 'transparent',
  color: disabled ? 'rgba(255,255,255,0.56)' : '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '5px 6px',
  cursor: disabled ? 'default' : 'pointer',
  textAlign: 'left',
});

const flyoutIconStyle = (active: boolean): React.CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.055)',
  color: '#f4f4f5',
  flexShrink: 0,
});

const flyoutLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.1,
};

const flyoutDescStyle: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.4)',
  fontSize: 9,
  fontWeight: 500,
  marginTop: 2,
  lineHeight: 1.25,
};

const betaPillStyle: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.18)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 9,
  fontWeight: 760,
};

const userAvatarSmallStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: 'rgba(255,255,255,0.64)',
  background: 'rgba(255,255,255,0.065)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 18,
  fontWeight: 500,
};

const userMenuStyle = (position: FlyoutPosition): React.CSSProperties => ({
  position: 'fixed',
  left: position.left,
  top: position.top,
  width: 252,
  maxHeight: position.maxHeight,
  overflowY: 'auto',
  padding: '13px 14px 12px',
  boxSizing: 'border-box',
  borderRadius: 16,
  background: 'linear-gradient(155deg, rgba(28,28,29,0.985), rgba(23,25,28,0.985))',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.52)',
  backdropFilter: 'blur(18px)',
  zIndex: 1100,
});

const userAvatarLargeStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: 'rgba(255,255,255,0.72)',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.22)',
  fontSize: 20,
  fontWeight: 500,
  flexShrink: 0,
};

const userDividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.12)',
  margin: '14px 0 9px',
};

const userMenuItemStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  border: 'none',
  background: 'transparent',
  color: '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 760,
  cursor: 'pointer',
  padding: '0 2px',
};

const userMenuIconStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.065)',
  color: '#f4f4f5',
  flexShrink: 0,
};
