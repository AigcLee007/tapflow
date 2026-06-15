import React from 'react';

import type { FlowMultiImageDisplayMode } from '../types';

export const MULTI_IMAGE_TOGGLE_MIN_WIDTH = 208;
export const MULTI_IMAGE_TOGGLE_HEIGHT = 42;
export const MULTI_IMAGE_TOGGLE_SEGMENT_HEIGHT = 34;

const rootStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: 4,
  minWidth: MULTI_IMAGE_TOGGLE_MIN_WIDTH,
  minHeight: MULTI_IMAGE_TOGGLE_HEIGHT,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 13,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
};

const buildSegmentStyle = (active: boolean): React.CSSProperties => ({
  flex: '1 1 0',
  minHeight: MULTI_IMAGE_TOGGLE_SEGMENT_HEIGHT,
  padding: '0 16px',
  border: 'none',
  borderRadius: 10,
  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
  boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.045)' : 'none',
  color: active ? '#f8fafc' : '#94a3b8',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.1,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease',
});

export function MultiImageDisplayModeToggle({
  mode,
  onChange,
}: {
  mode: FlowMultiImageDisplayMode;
  onChange: (mode: FlowMultiImageDisplayMode) => void;
}) {
  return (
    <div data-testid="multi-image-display-mode-toggle" style={rootStyle}>
      <button
        type="button"
        onClick={() => onChange('combined')}
        style={buildSegmentStyle(mode === 'combined')}
      >
        合并显示
      </button>
      <button
        type="button"
        onClick={() => onChange('split_nodes')}
        style={buildSegmentStyle(mode === 'split_nodes')}
      >
        多节点显示
      </button>
    </div>
  );
}
