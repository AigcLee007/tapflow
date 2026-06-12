import React from 'react';
import { X } from 'lucide-react';

import type { CanvasDockDrawerLayout } from '../utils/canvasDockPanel';

export function CanvasDockDrawer({
  children,
  count,
  layout,
  onClose,
  title,
}: {
  children: React.ReactNode;
  count?: number;
  layout: CanvasDockDrawerLayout;
  onClose: () => void;
  title: string;
}) {
  return (
    <aside
      className="nodrag nopan nowheel"
      style={{
        position: 'fixed',
        left: layout.left,
        top: layout.top,
        width: layout.width,
        maxHeight: layout.maxHeight,
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(38,38,38,0.98)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.46)',
        backdropFilter: 'blur(18px)',
        overflow: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 9px' }}>
        <div style={{ flex: 1, minWidth: 0, color: '#f8fafc', fontSize: 14, fontWeight: 760 }}>{title}</div>
        {typeof count === 'number' ? (
          <span style={{ color: '#a1a1aa', fontSize: 11, fontWeight: 650 }}>{count}</span>
        ) : null}
        <button
          type="button"
          className="nodrag nopan"
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: 9,
            background: 'rgba(255,255,255,0.06)',
            color: '#d4d4d8',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={15} />
        </button>
      </header>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <div className="sleek-scroll-y" style={{ overflowY: 'auto', padding: 10 }}>
        {children}
      </div>
    </aside>
  );
}

export function CanvasDockEmptyState({
  action,
  message,
}: {
  action?: React.ReactNode;
  message: string;
}) {
  return (
    <div
      style={{
        padding: '28px 12px',
        textAlign: 'center',
        color: '#a1a1aa',
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <div>{message}</div>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}
