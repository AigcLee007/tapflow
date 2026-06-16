import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { FlowMultiImageDisplayMode } from '../types';

export const MULTI_IMAGE_MODE_TRIGGER_MIN_WIDTH = 104;
export const MULTI_IMAGE_MODE_TRIGGER_HEIGHT = 32;

const MODE_LABELS: Record<FlowMultiImageDisplayMode, string> = {
  combined: '合并显示',
  split_nodes: '多节点显示',
};

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minWidth: MULTI_IMAGE_MODE_TRIGGER_MIN_WIDTH,
  height: MULTI_IMAGE_MODE_TRIGGER_HEIGHT,
  padding: '0 9px',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  color: '#f4f4f5',
  fontSize: 13,
  fontWeight: 650,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  flexShrink: 0,
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  bottom: 'calc(100% + 10px)',
  minWidth: MULTI_IMAGE_MODE_TRIGGER_MIN_WIDTH,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(28,28,38,0.98)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  zIndex: 1000,
};

const buildOptionStyle = (active: boolean): React.CSSProperties => ({
  minHeight: 34,
  padding: '0 10px',
  border: 'none',
  borderRadius: 10,
  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
  color: active ? '#fff' : '#94a3b8',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  textAlign: 'center',
  cursor: 'pointer',
});

export function MultiImageDisplayModeToggle({
  mode,
  onChange,
}: {
  mode: FlowMultiImageDisplayMode;
  onChange: (mode: FlowMultiImageDisplayMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', flex: '0 0 auto' }}>
      {open ? (
        <div data-testid="multi-image-display-mode-menu" style={menuStyle}>
          {(Object.keys(MODE_LABELS) as FlowMultiImageDisplayMode[]).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              onClick={() => {
                onChange(nextMode);
                setOpen(false);
              }}
              style={buildOptionStyle(mode === nextMode)}
            >
              {MODE_LABELS[nextMode]}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        data-testid="multi-image-display-mode-trigger"
        onClick={() => setOpen((value) => !value)}
        style={triggerStyle}
        title="选择多图显示方式"
      >
        <span>{MODE_LABELS[mode]}</span>
        <ChevronDown size={14} color="#a1a1aa" />
      </button>
    </div>
  );
}
