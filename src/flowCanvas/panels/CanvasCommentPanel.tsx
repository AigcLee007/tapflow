import React, { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import {
  createFlowComment,
  listFlowComments,
  updateFlowComment,
  type FlowComment,
} from '../../services/v2FlowCommentsApi';
import { CanvasDockEmptyState } from './CanvasDockDrawer';

export function CanvasCommentPanel({
  flowId,
  onFocusNode,
  onRefreshCount,
  projectId,
  selectedNodeId,
}: {
  flowId: string | null;
  onFocusNode: (nodeId: string) => void;
  onRefreshCount?: () => void;
  projectId: string;
  selectedNodeId: string | null;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<FlowComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved'>('open');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listFlowComments(projectId);
      setComments(result.items);
    } catch (reason) {
      setComments([]);
      setError(reason instanceof Error ? reason.message : '评论加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const visibleComments = useMemo(
    () => comments.filter((comment) => comment.status === statusFilter),
    [comments, statusFilter],
  );

  const handleSubmit = async () => {
    const content = body.trim();
    if (!content || !projectId) return;
    setSubmitting(true);
    try {
      const created = await createFlowComment(projectId, {
        anchor: selectedNodeId ? { nodeId: selectedNodeId } : undefined,
        body: content,
        flowId: flowId || undefined,
        nodeId: selectedNodeId || undefined,
      });
      setComments((current) => [created, ...current]);
      setBody('');
      setStatusFilter('open');
      onRefreshCount?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评论提交失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      const updated = await updateFlowComment(projectId, commentId, { status: 'resolved' });
      setComments((current) => current.map((item) => (item.id === commentId ? updated : item)));
      onRefreshCount?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '评论状态更新失败，请稍后重试。');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" className="nodrag nopan" onClick={() => setStatusFilter('open')} style={statusChip(statusFilter === 'open')}>
          Open
        </button>
        <button type="button" className="nodrag nopan" onClick={() => setStatusFilter('resolved')} style={statusChip(statusFilter === 'resolved')}>
          Resolved
        </button>
      </div>

      {selectedNodeId ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            height: 24,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            color: '#e4e4e7',
            fontSize: 11,
            fontWeight: 650,
            padding: '0 10px',
          }}
        >
          当前节点: {selectedNodeId}
        </div>
      ) : null}

      <div
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
        <textarea
          className="nodrag nopan"
          placeholder={selectedNodeId ? '给当前节点留一条评论...' : '给当前项目留一条评论...'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          style={{
            width: '100%',
            minHeight: 86,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.05)',
            color: '#f8fafc',
            fontSize: 12,
            lineHeight: 1.5,
            padding: '10px 12px',
            outline: 'none',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ color: '#71717a', fontSize: 11 }}>
            {user?.displayName || user?.email || '当前用户'}
          </div>
          <button
            type="button"
            className="nodrag nopan"
            disabled={submitting || !body.trim()}
            onClick={() => void handleSubmit()}
            style={{
              height: 28,
              minWidth: 72,
              border: 'none',
              borderRadius: 9,
              background: 'rgba(255,255,255,0.92)',
              color: '#09090b',
              fontSize: 12,
              fontWeight: 700,
              padding: '0 12px',
              cursor: submitting || !body.trim() ? 'default' : 'pointer',
              opacity: submitting || !body.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? '提交中' : '提交'}
          </button>
        </div>
      </div>

      {loading ? <CanvasDockEmptyState message="正在加载评论..." /> : null}
      {error ? <CanvasDockEmptyState message={error} /> : null}
      {!loading && !error && visibleComments.length === 0 ? (
        <CanvasDockEmptyState message={statusFilter === 'open' ? '还没有打开中的评论。' : '还没有已解决的评论。'} />
      ) : null}

      {!loading && !error && visibleComments.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleComments.map((comment) => (
            <div
              key={comment.id}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={metaPillStyle}>{comment.status}</span>
                  {comment.nodeId ? <span style={metaPillStyle}>node</span> : <span style={metaPillStyle}>project</span>}
                </div>
                <div style={{ color: '#71717a', fontSize: 10 }}>{new Date(comment.createdAt).toLocaleString()}</div>
              </div>

              <div style={{ color: '#f4f4f5', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {comment.body}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ color: '#71717a', fontSize: 11 }}>{comment.authorUserId}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {comment.nodeId ? (
                    <button
                      type="button"
                      className="nodrag nopan"
                      onClick={() => onFocusNode(comment.nodeId!)}
                      style={secondaryButtonStyle}
                    >
                      定位
                    </button>
                  ) : null}
                  {comment.status === 'open' ? (
                    <button
                      type="button"
                      className="nodrag nopan"
                      onClick={() => void handleResolve(comment.id)}
                      style={secondaryButtonStyle}
                    >
                      解决
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function statusChip(active: boolean): React.CSSProperties {
  return {
    height: 26,
    border: 'none',
    borderRadius: 999,
    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.055)',
    color: active ? '#fff' : '#a1a1aa',
    fontSize: 11,
    fontWeight: 650,
    padding: '0 10px',
    cursor: 'pointer',
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

const secondaryButtonStyle: React.CSSProperties = {
  height: 26,
  border: 'none',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.08)',
  color: '#f4f4f5',
  fontSize: 11,
  fontWeight: 700,
  padding: '0 10px',
  cursor: 'pointer',
};
