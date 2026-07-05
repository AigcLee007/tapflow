import React, { memo } from 'react';
import { Box, Film, Grid3X3, Maximize2 } from 'lucide-react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';

import type { FlowNodeData, FlowStoryboardCell } from '../types';
import { openProductionStudio, type ProductionStudioKind } from '../studios/productionStudioEvents';
import { normalizeStoryboardData } from '../utils/storyboardNodeData';

type FlowNode = Node<FlowNodeData>;

const productionCardStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minWidth: 220,
  minHeight: 160,
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(15,23,42,0.96)',
  boxShadow: '0 18px 40px rgba(2,6,23,0.26)',
  color: '#e2e8f0',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 14px 8px',
  fontSize: 14,
  fontWeight: 800,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: '8px 14px 14px',
};

const actionButtonStyle: React.CSSProperties = {
  height: 32,
  border: '1px solid rgba(148,163,184,0.22)',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '0 12px',
};

const previewPanelStyle: React.CSSProperties = {
  height: 92,
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
  marginBottom: 12,
};

function NodeChrome({
  children,
  selected,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <>
      <NodeResizer isVisible={Boolean(selected)} minWidth={220} minHeight={160} />
      <div
        style={{
          ...productionCardStyle,
          outline: selected ? '2px solid rgba(99,102,241,0.7)' : 'none',
        }}
      >
        {children}
      </div>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </>
  );
}

function getStoryboardPreviewCells(cells: FlowStoryboardCell[]) {
  return cells.length
    ? cells
    : Array.from({ length: 6 }, (_, index) => ({
        id: `empty-${index}`,
        shotNo: index + 1,
      }));
}

function handleOpenStudio(
  event: React.MouseEvent<HTMLButtonElement>,
  nodeId: string,
  studio: ProductionStudioKind,
) {
  event.stopPropagation();
  openProductionStudio({ nodeId, studio });
}

export const StoryboardNodeComponent = memo(function StoryboardNodeComponent({
  data,
  id,
  selected,
}: NodeProps<FlowNode>) {
  const storyboard = normalizeStoryboardData(data.storyboard);
  const cells = storyboard.cells;
  const previewCells = getStoryboardPreviewCells(cells);
  const filledCount = cells.filter((cell) => cell.assetId).length;

  return (
    <NodeChrome selected={selected}>
      <div style={headerStyle}>
        <Grid3X3 size={16} />
        <span>{data.title || '故事板'}</span>
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
          {filledCount}/{cells.length || 0}
        </span>
      </div>
      <div style={bodyStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
          {previewCells.map((cell) => (
            <div
              key={cell.id}
              style={{
                aspectRatio: '16 / 9',
                borderRadius: 8,
                background: cell.assetId ? '#334155' : 'rgba(148,163,184,0.12)',
                border: '1px solid rgba(148,163,184,0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {cell.shotNo}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="nodrag nopan"
          style={actionButtonStyle}
          aria-label="打开故事板"
          onClick={(event) => handleOpenStudio(event, id, 'storyboard')}
        >
          <Maximize2 size={13} />
          打开故事板
        </button>
      </div>
    </NodeChrome>
  );
});

export const Director3dNodeComponent = memo(function Director3dNodeComponent({
  data,
  id,
  selected,
}: NodeProps<FlowNode>) {
  return (
    <NodeChrome selected={selected}>
      <div style={headerStyle}>
        <Box size={16} />
        <span>{data.title || '3D导演台'}</span>
      </div>
      <div style={bodyStyle}>
        <div style={previewPanelStyle} />
        <button
          type="button"
          className="nodrag nopan"
          style={actionButtonStyle}
          aria-label="打开导演台"
          onClick={(event) => handleOpenStudio(event, id, 'director3d')}
        >
          打开导演台
        </button>
      </div>
    </NodeChrome>
  );
});

export const VideoEditorNodeComponent = memo(function VideoEditorNodeComponent({
  data,
  id,
  selected,
}: NodeProps<FlowNode>) {
  return (
    <NodeChrome selected={selected}>
      <div style={headerStyle}>
        <Film size={16} />
        <span>{data.title || '剪辑工程'}</span>
      </div>
      <div style={bodyStyle}>
        <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
          <div style={{ height: 12, borderRadius: 8, background: '#2563eb', width: '80%' }} />
          <div style={{ height: 12, borderRadius: 8, background: '#16a34a', width: '62%' }} />
          <div style={{ height: 12, borderRadius: 8, background: '#f59e0b', width: '90%' }} />
        </div>
        <button
          type="button"
          className="nodrag nopan"
          style={actionButtonStyle}
          aria-label="打开剪辑器"
          onClick={(event) => handleOpenStudio(event, id, 'video_editor')}
        >
          <Maximize2 size={13} />
          打开剪辑器
        </button>
      </div>
    </NodeChrome>
  );
});
