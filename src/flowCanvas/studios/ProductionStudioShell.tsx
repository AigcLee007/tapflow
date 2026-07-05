import React, { useEffect } from 'react';
import { Box, Camera, Film, Grid3X3, Layers3, Play, Plus, X } from 'lucide-react';
import type { Node } from '@xyflow/react';

import type { FlowDirector3dData, FlowNodeData, FlowVideoEditorData } from '../types';
import { normalizeStoryboardData } from '../utils/storyboardNodeData';
import type { ProductionStudioKind } from './productionStudioEvents';

type FlowNode = Node<FlowNodeData>;

interface ProductionStudioShellProps {
  node: FlowNode;
  onClose: () => void;
  studio: ProductionStudioKind;
}

const studioTitleByKind: Record<ProductionStudioKind, string> = {
  storyboard: '故事板',
  director3d: '3D导演台',
  video_editor: '剪辑工程',
};

export const ProductionStudioShell: React.FC<ProductionStudioShellProps> = ({ node, onClose, studio }) => {
  const title = node.data.title || studioTitleByKind[studio];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="nodrag nopan nowheel" style={overlayStyle}>
      <section
        aria-label={title}
        aria-modal="true"
        role="dialog"
        style={shellStyle}
      >
        <header style={headerStyle}>
          <div style={headerTitleStyle}>
            {studio === 'director3d' ? <Box size={18} /> : studio === 'video_editor' ? <Film size={18} /> : <Grid3X3 size={18} />}
            <span>{title}</span>
          </div>
          <div style={headerMetaStyle}>
            <span>{node.id}</span>
            <button type="button" aria-label="关闭工作台" style={iconButtonStyle} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {studio === 'director3d' ? (
          <DirectorDeskContent data={node.data.director3d} />
        ) : studio === 'storyboard' ? (
          <StoryboardContent data={node.data.storyboard} />
        ) : (
          <VideoEditorContent data={node.data.videoEditor} />
        )}
      </section>
    </div>
  );
};

function DirectorDeskContent({ data }: { data?: FlowDirector3dData }) {
  const actors = data?.actors ?? [];
  const cameras = data?.cameras ?? [];
  const shots = data?.shots ?? [];

  return (
    <div style={directorLayoutStyle}>
      <aside style={panelStyle}>
        <PanelTitle icon={<Layers3 size={15} />} title="场景对象" />
        <div style={listStyle}>
          {actors.map((actor) => (
            <StudioListItem key={actor.id} label={actor.name} meta={actor.visible ? '可见' : '隐藏'} />
          ))}
          {cameras.map((camera) => (
            <StudioListItem key={camera.id} label={camera.name} meta="镜头" />
          ))}
          {actors.length === 0 && cameras.length === 0 ? <EmptyLine label="暂无对象" /> : null}
        </div>
        <button type="button" style={toolButtonStyle}>
          <Plus size={14} />
          添加对象
        </button>
      </aside>

      <main style={viewportWrapStyle}>
        <div style={viewportHeaderStyle}>
          <PanelTitle icon={<Camera size={15} />} title="导演视口" />
          <span style={pillStyle}>{data?.scene.gridVisible === false ? '网格关闭' : '网格开启'}</span>
        </div>
        <div style={directorViewportStyle}>
          <div style={axisHelperStyle}>XYZ</div>
          <div style={actorMarkerStyle} />
          <div style={cameraMarkerStyle} />
        </div>
      </main>

      <aside style={panelStyle}>
        <PanelTitle icon={<Box size={15} />} title="对象属性" />
        <MetricRow label="角色" value={String(actors.length)} />
        <MetricRow label="镜头" value={String(cameras.length)} />
        <MetricRow label="镜头段" value={String(shots.length)} />
        <MetricRow label="单位" value={data?.scene.units || 'meters'} />
      </aside>

      <div style={bottomRailStyle}>
        <PanelTitle icon={<Play size={15} />} title="镜头轨道" />
        <div style={shotStripStyle}>
          {shots.length ? (
            shots.map((shot, index) => (
              <div key={shot.id} style={shotItemStyle}>
                <strong>镜头 {index + 1}</strong>
                <span>{Math.round(shot.durationMs / 100) / 10}s</span>
              </div>
            ))
          ) : (
            <EmptyLine label="暂无镜头段" />
          )}
        </div>
      </div>
    </div>
  );
}

function StoryboardContent({ data }: { data?: FlowNodeData['storyboard'] }) {
  const storyboard = normalizeStoryboardData(data);
  const selectedCell = storyboard.cells[storyboard.selectedIndex] ?? storyboard.cells[0];

  return (
    <div style={storyboardLayoutStyle}>
      <main style={panelStyle}>
        <PanelTitle icon={<Grid3X3 size={15} />} title="分镜格" />
        <div style={storyGridStyle}>
          {storyboard.cells.map((cell, index) => (
            <div
              key={cell.id}
              style={{
                ...storyCellStyle,
                borderColor: index === storyboard.selectedIndex ? '#38bdf8' : 'rgba(255,255,255,0.11)',
              }}
            >
              <span>镜头 {cell.shotNo}</span>
              <strong>{cell.title || (cell.assetId ? '已绑定素材' : '空镜头')}</strong>
            </div>
          ))}
        </div>
      </main>
      <aside style={panelStyle}>
        <PanelTitle icon={<Camera size={15} />} title="选中分镜" />
        <MetricRow label="编号" value={selectedCell ? `镜头 ${selectedCell.shotNo}` : '-'} />
        <MetricRow label="标题" value={selectedCell?.title || '-'} />
        <MetricRow label="画幅" value={selectedCell?.aspect || storyboard.aspect} />
        <div style={promptPreviewStyle}>{selectedCell?.prompt || '未填写提示词'}</div>
      </aside>
    </div>
  );
}

function VideoEditorContent({ data }: { data?: FlowVideoEditorData }) {
  const timeline = data?.timeline;
  const clips = timeline?.clips ?? [];
  const audio = timeline?.audio ?? [];
  const subtitles = timeline?.subtitles ?? [];

  return (
    <div style={videoLayoutStyle}>
      <aside style={panelStyle}>
        <PanelTitle icon={<Layers3 size={15} />} title="素材箱" />
        <StudioListItem label={`${clips.length} 个画面素材`} meta="clips" />
        <StudioListItem label={`${audio.length} 条音频`} meta="audio" />
        <StudioListItem label={`${subtitles.length} 条字幕`} meta="subtitles" />
      </aside>
      <main style={previewPanelStyle}>
        <PanelTitle icon={<Play size={15} />} title="预览监看" />
        <div style={videoPreviewStyle}>
          <Film size={42} />
        </div>
      </main>
      <aside style={panelStyle}>
        <PanelTitle icon={<Box size={15} />} title="参数检查" />
        <MetricRow label="画幅" value={data?.aspect || '16:9'} />
        <MetricRow label="分辨率" value={data?.resolution || '1920x1080'} />
        <MetricRow label="时长" value={`${Math.round((timeline?.durationMs ?? 0) / 100) / 10}s`} />
      </aside>
      <div style={bottomRailStyle}>
        <PanelTitle icon={<Film size={15} />} title="时间线" />
        <div style={timelineStyle}>
          {clips.length ? (
            clips.map((clip) => (
              <div key={clip.id} style={clipItemStyle}>
                <strong>{clip.id}</strong>
                <span>{clip.kind}</span>
              </div>
            ))
          ) : (
            <EmptyLine label="暂无剪辑片段" />
          )}
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={panelTitleStyle}>
      {icon}
      <span>{title}</span>
    </div>
  );
}

function StudioListItem({ label, meta }: { label: string; meta: string }) {
  return (
    <div style={listItemStyle}>
      <span>{label}</span>
      <small>{meta}</small>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <div style={emptyLineStyle}>{label}</div>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1500,
  background: 'rgba(3,7,18,0.88)',
  backdropFilter: 'blur(14px)',
  padding: 16,
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'grid',
  gridTemplateRows: '54px 1fr',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: '#0b0d12',
  color: '#f8fafc',
  boxShadow: '0 24px 80px rgba(0,0,0,0.48)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 14px 0 18px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: '#101217',
};

const headerTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 15,
  fontWeight: 800,
};

const headerMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: '#94a3b8',
  fontSize: 11,
};

const iconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  color: '#f8fafc',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const directorLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '260px minmax(320px, 1fr) 280px',
  gridTemplateRows: 'minmax(0, 1fr) 112px',
  gap: 10,
  padding: 10,
};

const storyboardLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(420px, 1fr) 320px',
  gap: 10,
  padding: 10,
};

const videoLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '240px minmax(320px, 1fr) 280px',
  gridTemplateRows: 'minmax(0, 1fr) 126px',
  gap: 10,
  padding: 10,
};

const panelStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#14171d',
  padding: 12,
  overflow: 'hidden',
};

const viewportWrapStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#0e1117',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '42px 1fr',
};

const viewportHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const directorViewportStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  backgroundColor: '#0b1020',
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

const axisHelperStyle: React.CSSProperties = {
  position: 'absolute',
  right: 14,
  bottom: 12,
  color: '#f59e0b',
  fontSize: 11,
  fontWeight: 800,
};

const actorMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '45%',
  top: '38%',
  width: 30,
  height: 54,
  borderRadius: 8,
  border: '2px solid #22c55e',
  background: 'rgba(34,197,94,0.18)',
};

const cameraMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '57%',
  top: '48%',
  width: 42,
  height: 28,
  clipPath: 'polygon(0 25%, 62% 25%, 100% 0, 100% 100%, 62% 75%, 0 75%)',
  background: '#38bdf8',
};

const bottomRailStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#14171d',
  padding: 12,
  overflow: 'hidden',
};

const panelTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  color: '#e5e7eb',
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 10,
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  marginBottom: 10,
};

const listItemStyle: React.CSSProperties = {
  minHeight: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.055)',
  padding: '0 9px',
  fontSize: 12,
  color: '#f8fafc',
};

const metricRowStyle: React.CSSProperties = {
  minHeight: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontSize: 12,
  color: '#cbd5e1',
};

const emptyLineStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  padding: '8px 0',
};

const toolButtonStyle: React.CSSProperties = {
  height: 32,
  width: '100%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: '#1f2937',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
};

const pillStyle: React.CSSProperties = {
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 8,
  background: 'rgba(56,189,248,0.13)',
  color: '#7dd3fc',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 800,
};

const shotStripStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  overflow: 'hidden',
};

const shotItemStyle: React.CSSProperties = {
  width: 132,
  height: 52,
  borderRadius: 8,
  background: '#1e293b',
  border: '1px solid rgba(56,189,248,0.22)',
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
};

const storyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
};

const storyCellStyle: React.CSSProperties = {
  minHeight: 112,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.11)',
  background: '#0f172a',
  display: 'grid',
  alignContent: 'space-between',
  gap: 8,
  padding: 10,
  fontSize: 12,
};

const promptPreviewStyle: React.CSSProperties = {
  minHeight: 96,
  borderRadius: 8,
  background: '#0f172a',
  color: '#dbeafe',
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5,
  marginTop: 12,
};

const previewPanelStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#0e1117',
  padding: 12,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
};

const videoPreviewStyle: React.CSSProperties = {
  minHeight: 0,
  borderRadius: 8,
  background: '#020617',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'grid',
  placeItems: 'center',
  color: '#60a5fa',
};

const timelineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  overflow: 'hidden',
};

const clipItemStyle: React.CSSProperties = {
  minWidth: 156,
  height: 52,
  borderRadius: 8,
  background: '#1d4ed8',
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
};
