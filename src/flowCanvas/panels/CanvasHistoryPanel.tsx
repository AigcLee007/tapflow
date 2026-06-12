import React, { useEffect, useMemo, useState } from 'react';
import { History, LoaderCircle, RotateCcw, Save } from 'lucide-react';

import {
  createProjectHistorySnapshot,
  listProjectHistory,
  restoreProjectHistoryVersion,
  type FlowHistoryItem,
} from '../../services/v2FlowHistoryApi';
import { CanvasDockEmptyState } from './CanvasDockDrawer';

export function CanvasHistoryPanel({
  onHistoryChanged,
  projectId,
  onRestoreSnapshot,
}: {
  onHistoryChanged?: () => void;
  projectId: string;
  onRestoreSnapshot: (graph: {
    edges: Record<string, unknown>[];
    nodes: Record<string, unknown>[];
    viewport: { x: number; y: number; zoom: number };
  }) => void;
}) {
  const [items, setItems] = useState<FlowHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProjectHistory(projectId);
      setItems(result.items);
    } catch (reason) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : '历史记录加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const snapshotCount = useMemo(() => items.filter((item) => item.type === 'snapshot').length, [items]);

  const handleCreateSnapshot = async () => {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      await createProjectHistorySnapshot(projectId);
      await refresh();
      onHistoryChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存快照失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (item: FlowHistoryItem) => {
    if (!item.versionId || !projectId) return;
    if (typeof window !== 'undefined' && !window.confirm(`恢复到“${item.label || item.summary}”吗？当前未同步改动会被覆盖。`)) {
      return;
    }
    setRestoringVersionId(item.versionId);
    setError(null);
    try {
      const draft = await restoreProjectHistoryVersion(projectId, item.versionId);
      onRestoreSnapshot(draft.graph);
      await refresh();
      onHistoryChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复历史失败，请稍后重试。');
    } finally {
      setRestoringVersionId((current) => (current === item.versionId ? null : current));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: 10,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 700 }}>历史快照</div>
          <div style={{ color: '#71717a', fontSize: 11, marginTop: 3 }}>{snapshotCount} 条可恢复记录</div>
        </div>
        <button
          type="button"
          className="nodrag nopan"
          disabled={saving}
          onClick={() => void handleCreateSnapshot()}
          style={primaryButtonStyle(saving)}
        >
          {saving ? <LoaderCircle size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          {saving ? '保存中' : '保存快照'}
        </button>
      </div>

      {loading ? <CanvasDockEmptyState message="正在加载历史记录..." /> : null}
      {error ? <CanvasDockEmptyState message={error} /> : null}
      {!loading && !error && items.length === 0 ? (
        <CanvasDockEmptyState
          message="还没有历史记录。先保存一个快照，后面就可以随时恢复。"
          action={(
            <button type="button" className="nodrag nopan" onClick={() => void handleCreateSnapshot()} style={emptyActionStyle}>
              保存第一个快照
            </button>
          )}
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => {
            const restoring = restoringVersionId === item.versionId;
            return (
              <div
                key={item.eventId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={iconWrapStyle}>
                    {item.type === 'restore' ? <RotateCcw size={15} /> : <History size={15} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f8fafc', fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                      {item.label || item.summary}
                    </div>
                    <div style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 1.5, marginTop: 3 }}>
                      {item.summary}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={metaPillStyle}>{item.type === 'snapshot' ? 'snapshot' : 'restore'}</span>
                    {typeof item.version === 'number' ? <span style={metaPillStyle}>v{item.version}</span> : null}
                    <span style={metaPillStyle}>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  {item.versionId ? (
                    <button
                      type="button"
                      className="nodrag nopan"
                      disabled={restoring}
                      onClick={() => void handleRestore(item)}
                      style={secondaryButtonStyle(restoring)}
                    >
                      {restoring ? <LoaderCircle size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={13} />}
                      {restoring ? '恢复中' : '恢复'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 28,
    minWidth: 88,
    border: 'none',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.92)',
    color: '#09090b',
    fontSize: 12,
    fontWeight: 700,
    padding: '0 12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 28,
    minWidth: 64,
    border: 'none',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.08)',
    color: '#f4f4f5',
    fontSize: 11,
    fontWeight: 700,
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  };
}

const metaPillStyle: React.CSSProperties = {
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.055)',
  color: '#a1a1aa',
  fontSize: 10,
  fontWeight: 650,
  padding: '0 8px',
};

const iconWrapStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.06)',
  color: '#d4d4d8',
  flexShrink: 0,
};

const emptyActionStyle: React.CSSProperties = {
  height: 28,
  border: 'none',
  borderRadius: 9,
  background: 'rgba(255,255,255,0.92)',
  color: '#09090b',
  fontSize: 12,
  fontWeight: 700,
  padding: '0 12px',
  cursor: 'pointer',
};
