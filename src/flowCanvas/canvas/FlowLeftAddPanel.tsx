/**
 * TapNow-style left dock and add-node flyout.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
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

type AddEntry = {
  kind: FlowNodeKind | 'world3d' | 'playlist';
  label: string;
  desc?: string;
  icon: React.ReactNode;
  beta?: boolean;
  disabled?: boolean;
};

const PRIMARY_ITEMS: AddEntry[] = [
  { kind: 'text', label: '文本', desc: '脚本、提示词和文案', icon: <List size={26} strokeWidth={1.75} /> },
  { kind: 'image', label: '图片', icon: <ImageIcon size={26} strokeWidth={1.75} /> },
  { kind: 'video', label: '视频', icon: <PlaySquare size={25} strokeWidth={1.8} /> },
  { kind: 'audio', label: '音频', icon: <Music size={25} strokeWidth={1.8} /> },
  { kind: 'world3d', label: '3D 世界', icon: <Box size={25} strokeWidth={1.75} />, beta: true, disabled: true },
];

const TOOL_ITEMS: AddEntry[] = [
  { kind: 'playlist', label: '播放列表', icon: <LayoutList size={25} strokeWidth={1.75} />, beta: true, disabled: true },
  { kind: 'image_editor', label: '图片编辑节点', icon: <Wand2 size={25} strokeWidth={1.8} /> },
];

const RESOURCE_ITEMS: AddEntry[] = [
  { kind: 'upload', label: '上传', icon: <Upload size={25} strokeWidth={1.85} /> },
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
}> = ({ icon, label, active, badge, large, onClick, onMouseEnter, onMouseLeave }) => {
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

const AddNodeFlyout: React.FC<{
  onAdd: (kind: FlowNodeKind) => void;
}> = ({ onAdd }) => {
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
    <div className="nodrag nopan nowheel" style={flyoutStyle}>
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
}> = ({ authenticated, loading, onLogout, user }) => {
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
    <div className="nodrag nopan nowheel" style={userMenuStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={userAvatarLargeStyle}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{displayName}</div>
          <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 18, fontWeight: 600, marginTop: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
      </div>
      <div style={userDividerStyle} />
      <UserMenuItem icon={<User size={22} />} label={authenticated ? '账号' : '登录'} onClick={() => navigateTo(authenticated ? '/account' : '/login')} />
      <UserMenuItem icon={<Wallet size={22} />} label="计费" onClick={() => navigateTo('/billing')} />
      <UserMenuItem icon={<Bell size={22} />} label="工作区" onClick={() => navigateTo('/workspace')} />
      <div style={userDividerStyle} />
      <UserMenuItem icon={<CircleHelp size={22} />} label="帮助" />
      {authenticated ? (
        <UserMenuItem icon={<LogOut size={22} />} label="退出登录" onClick={onLogout} />
      ) : (
        <UserMenuItem icon={<LogOut size={22} />} label="前往登录" onClick={() => navigateTo('/login')} />
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
  const [addOpen, setAddOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
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
    <div style={dockHostStyle} onMouseLeave={() => setUserOpen(false)}>
      <div style={dockStyle}>
        <DockButton
          icon={addOpen ? <X size={31} strokeWidth={1.7} /> : <Plus size={38} strokeWidth={1.75} />}
          label="添加节点"
          large
          active={addOpen}
          onMouseEnter={openAdd}
          onClick={() => (addOpen ? setAddOpen(false) : openAdd())}
        />
        <DockButton icon={<Folder size={25} strokeWidth={1.8} />} label="模板" badge />
        <DockButton icon={<LayoutList size={25} strokeWidth={1.85} />} label="模板列表" />
        <DockButton icon={<MessageCircle size={26} strokeWidth={1.85} />} label="评论" />
        <DockButton icon={<Clock3 size={26} strokeWidth={1.85} />} label="历史记录" onClick={undo} />
        <div style={dockDividerStyle} />
        <DockButton
          icon={<span style={userAvatarSmallStyle}>{(user?.displayName || user?.email || 'L').charAt(0).toUpperCase()}</span>}
          label="用户"
          active={userOpen}
          onClick={() => {
            setAddOpen(false);
            setUserOpen((open) => !open);
          }}
        />
      </div>

      {addOpen && (
        <div onMouseEnter={openAdd} onMouseLeave={scheduleCloseAdd}>
          <AddNodeFlyout onAdd={handleAdd} />
        </div>
      )}
      {userOpen && (
        <UserFlyout
          authenticated={authenticated}
          loading={userLoading}
          onLogout={handleLogout}
          user={user}
        />
      )}
    </div>
  );
});

const dockHostStyle: React.CSSProperties = {
  position: 'absolute',
  left: 23,
  top: 164,
  zIndex: 1000,
};

const dockStyle: React.CSSProperties = {
  width: 80,
  minHeight: 432,
  padding: '9px 9px 10px',
  boxSizing: 'border-box',
  borderRadius: 40,
  background: 'rgba(31,31,31,0.96)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 22px 56px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.05)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  backdropFilter: 'blur(18px)',
};

const addButtonStyle = (active?: boolean): React.CSSProperties => ({
  width: 60,
  height: 60,
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
  width: 56,
  height: 56,
  borderRadius: 15,
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
  width: 12,
  height: 12,
  borderRadius: '50%',
  right: 6,
  top: 8,
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
  left: 'calc(100% + 10px)',
  top: '50%',
  transform: 'translateY(-50%)',
  padding: '10px 17px',
  borderRadius: 20,
  background: 'rgba(49,49,49,0.96)',
  color: '#fff',
  fontSize: 18,
  fontWeight: 820,
  whiteSpace: 'nowrap',
  boxShadow: '0 12px 28px rgba(0,0,0,0.38)',
};

const flyoutStyle: React.CSSProperties = {
  position: 'absolute',
  left: 91,
  top: -126,
  width: 360,
  maxHeight: 'calc(100vh - 40px)',
  overflow: 'auto',
  padding: '16px 18px 18px',
  boxSizing: 'border-box',
  borderRadius: 22,
  background: 'linear-gradient(150deg, rgba(31,31,31,0.98), rgba(25,28,32,0.98))',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 24px 70px rgba(0,0,0,0.58)',
  backdropFilter: 'blur(22px)',
};

const flyoutSectionTitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.42)',
  fontSize: 20,
  fontWeight: 760,
  margin: '0 0 9px',
};

const flyoutItemStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 62,
  border: 'none',
  borderRadius: 18,
  background: active ? 'rgba(255,255,255,0.105)' : 'transparent',
  color: disabled ? 'rgba(255,255,255,0.78)' : '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '9px 12px',
  cursor: disabled ? 'default' : 'pointer',
  textAlign: 'left',
});

const flyoutIconStyle = (active: boolean): React.CSSProperties => ({
  width: 54,
  height: 54,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  background: active ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.065)',
  color: '#f4f4f5',
  flexShrink: 0,
});

const flyoutLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#fff',
  fontSize: 23,
  fontWeight: 850,
  lineHeight: 1.15,
};

const flyoutDescStyle: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.38)',
  fontSize: 17,
  fontWeight: 650,
  marginTop: 7,
};

const betaPillStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.22)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 820,
};

const userAvatarSmallStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: 'rgba(255,255,255,0.64)',
  background: 'rgba(255,255,255,0.065)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 28,
  fontWeight: 500,
};

const userMenuStyle: React.CSSProperties = {
  position: 'absolute',
  left: 89,
  bottom: -228,
  width: 360,
  padding: '22px 20px 18px',
  boxSizing: 'border-box',
  borderRadius: 24,
  background: 'linear-gradient(150deg, rgba(34,34,34,0.98), rgba(27,30,34,0.98))',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 24px 70px rgba(0,0,0,0.58)',
  backdropFilter: 'blur(22px)',
};

const userAvatarLargeStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  color: 'rgba(255,255,255,0.72)',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.44)',
  fontSize: 30,
  fontWeight: 500,
  flexShrink: 0,
};

const userDividerStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.12)',
  margin: '22px 0 14px',
};

const userMenuItemStyle: React.CSSProperties = {
  width: '100%',
  height: 64,
  border: 'none',
  background: 'transparent',
  color: '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontSize: 24,
  fontWeight: 820,
  cursor: 'pointer',
  padding: '0 2px',
};

const userMenuIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 11,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.065)',
  color: '#f4f4f5',
  flexShrink: 0,
};
