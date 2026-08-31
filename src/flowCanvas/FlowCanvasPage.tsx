/**
 * Flow canvas surface used by the authenticated project route.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, LayoutList, Music, Sparkles, Video } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { AiFlowCanvas } from './canvas/AiFlowCanvas';
import { FlowTopToolbar } from './canvas/FlowTopToolbar';
import { useFlowCanvasStore } from './store/flowCanvasStore';
import type { FlowNodeKind } from './types';
import { disposeBackendWorkflowRunStream } from './runtime/v2WorkflowRunner';
import { isEditableElement } from './utils/isEditableElement';
import { CanvasAgentCommandBar } from './agent/v3/CanvasAgentCommandBar';
import { CanvasAgentTaskSheet } from './agent/v3/CanvasAgentTaskSheet';
import { CanvasAgentV4TaskPanel } from './agent/v4/CanvasAgentV4TaskPanel';
import type { CanvasAgentV4Task } from './agent/v4/canvasAgentV4Types';
import type { CanvasAgentV3RuntimeIdentity } from './agent/v3/canvasAgentV3Types';
import { useCanvasAgentTask } from './agent/v3/useCanvasAgentTask';

const useFlowShortcuts = () => {
  const undo = useFlowCanvasStore((s) => s.undo);
  const redo = useFlowCanvasStore((s) => s.redo);
  const deleteSelectedNodes = useFlowCanvasStore((s) => s.deleteSelectedNodes);
  const deleteSelectedEdges = useFlowCanvasStore((s) => s.deleteSelectedEdges);
  const duplicateSelectedNodes = useFlowCanvasStore((s) => s.duplicateSelectedNodes);
  const selectAll = useFlowCanvasStore((s) => s.selectAll);
  const deselectAll = useFlowCanvasStore((s) => s.deselectAll);
  const closeImageTool = useFlowCanvasStore((s) => s.closeImageTool);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedNodes();
      } else if (ctrl && e.key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape') {
        closeImageTool();
        deselectAll();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedNodes();
        deleteSelectedEdges();
      }
    };

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [undo, redo, deleteSelectedNodes, deleteSelectedEdges, duplicateSelectedNodes, selectAll, deselectAll, closeImageTool]);
};

const FLOW_VIEWPORT_META = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

function isDebugOverlayEnabled() {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1';
}

const useFlowViewportLock = () => {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]') || document.createElement('meta');
    const createdMeta = !viewportMeta.parentElement;
    const previousViewport = viewportMeta.getAttribute('content');

    if (createdMeta) {
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }

    viewportMeta.setAttribute('content', FLOW_VIEWPORT_META);
    html.classList.add('flow-viewport-lock');
    body.classList.add('flow-viewport-lock');

    return () => {
      html.classList.remove('flow-viewport-lock');
      body.classList.remove('flow-viewport-lock');
      if (createdMeta) {
        viewportMeta.remove();
      } else if (previousViewport !== null) {
        viewportMeta.setAttribute('content', previousViewport);
      } else {
        viewportMeta.removeAttribute('content');
      }
    };
  }, []);
};

const useBackendFlowBinding = () => {
  const setBackendFlowBinding = useFlowCanvasStore((s) => s.setBackendFlowBinding);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const backendFlowId = params.get('backendFlowId') || params.get('flowId');
    const backendProjectId = params.get('backendProjectId') || params.get('projectId');
    const backendCurrentVersionId = params.get('backendCurrentVersionId') || params.get('currentVersionId');

    if (!backendFlowId && !backendProjectId && !backendCurrentVersionId) {
      return;
    }

    setBackendFlowBinding({
      backendCurrentVersionId,
      backendFlowId,
      backendProjectId,
    });
  }, [setBackendFlowBinding]);
};

const useBackendRunCleanup = () => {
  useEffect(() => () => {
    disposeBackendWorkflowRunStream();
  }, []);
};

const StatsOverlay: React.FC = React.memo(() => {
  const nodeCount = useFlowCanvasStore((s) => s.nodes.length);
  const edgeCount = useFlowCanvasStore((s) => s.edges.length);

  if (nodeCount === 0 && edgeCount === 0) return null;

  return (
    <div style={statsStyle}>
      <span>节点 <span style={{ color: '#60a5fa' }}>{nodeCount}</span></span>
      <span>连线 <span style={{ color: '#34d399' }}>{edgeCount}</span></span>
    </div>
  );
});

const BackendRunOverlay: React.FC = React.memo(() => {
  const backendFlowId = useFlowCanvasStore((s) => s.backendFlowId);
  const currentRunId = useFlowCanvasStore((s) => s.currentRunId);
  const isRunningBackendWorkflow = useFlowCanvasStore((s) => s.isRunningBackendWorkflow);
  const runError = useFlowCanvasStore((s) => s.runError);
  const runStatus = useFlowCanvasStore((s) => s.runStatus);

  if (!backendFlowId && !runError) {
    return null;
  }

  return (
    <div style={backendRunOverlayStyle}>
      <span>
        {backendFlowId ? `v2 画布 ${backendFlowId}` : '未绑定 v2 画布'}
      </span>
      {currentRunId && <span>任务 {currentRunId}</span>}
      {runStatus && <span>状态 {runStatus}</span>}
      {isRunningBackendWorkflow && <span>后端运行中</span>}
      {runError && <span style={{ color: '#fca5a5' }}>{runError}</span>}
    </div>
  );
});

const QUICK_TEMPLATES: { icon: React.ReactNode; label: string; kind: FlowNodeKind }[] = [
  { icon: <Video size={21} strokeWidth={1.8} />, label: '文生视频', kind: 'video' },
  { icon: <ImageIcon size={21} strokeWidth={1.8} />, label: '图片生成', kind: 'image' },
  { icon: <Sparkles size={20} strokeWidth={1.8} />, label: '首帧视频', kind: 'video' },
  { icon: <Music size={21} strokeWidth={1.8} />, label: '音频视频', kind: 'video' },
  { icon: <LayoutList size={20} strokeWidth={1.8} />, label: '打开模板', kind: 'text' },
];

const EmptyState: React.FC = React.memo(() => {
  const nodeCount = useFlowCanvasStore((s) => s.nodes.length);
  const addNode = useFlowCanvasStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  if (nodeCount > 0) return null;

  const handleTemplateClick = (kind: FlowNodeKind) => {
    addNode(kind, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
  };

  return (
    <div style={emptyStyle}>
      <div style={emptyHintStyle}>
        <span style={emptyPillStyle}>今天想创作什么？</span>
        <span style={emptyHintTextStyle}>从一个节点开始，或打开模板快速搭建你的 AI Flow。</span>
      </div>

      <div style={templateRowStyle}>
        {QUICK_TEMPLATES.map((t, i) => (
          <button key={i} onClick={() => handleTemplateClick(t.kind)} style={templateButtonStyle}>
            <span style={templateIconStyle}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
});

export type CanvasSaveStatusView = {
  error?: string | null;
  icon?: React.ReactNode;
  label: string;
  onRetry?: () => void;
  status: string;
};

const FlowCanvasPage: React.FC<{
  enableLocalPersistence?: boolean;
  saveStatus?: CanvasSaveStatusView;
  onServerDraftApplied?: () => void | Promise<void>;
  agentV3RuntimeIdentity?: CanvasAgentV3RuntimeIdentity;
  agentV3SessionId?: string;
  agentV4Task?: CanvasAgentV4Task;
  onAgentV4Approve?: () => void;
  onAgentV4Cancel?: () => void;
  onAgentV4Retry?: (itemId: string) => void;
}> = ({ onServerDraftApplied, saveStatus, agentV3RuntimeIdentity = 'unavailable', agentV3SessionId, agentV4Task, onAgentV4Approve, onAgentV4Cancel, onAgentV4Retry }) => {
  const [cullingEnabled, setCullingEnabled] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const v3 = useCanvasAgentTask({ sessionId: agentV3SessionId, runtimeIdentity: agentV3RuntimeIdentity });
  const toggleCulling = useCallback(() => setCullingEnabled((v) => !v), []);

  useFlowShortcuts();
  useFlowViewportLock();
  useBackendFlowBinding();
  useBackendRunCleanup();

  return (
    <div style={pageStyle}>
      <FlowTopToolbar
        onToggleCulling={toggleCulling}
        cullingEnabled={cullingEnabled}
        hideUtilityActions={agentOpen}
        saveStatus={saveStatus}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlowProvider>
          <AiFlowCanvas
            cullingEnabled={cullingEnabled}
            onAgentOpenChange={setAgentOpen}
            onServerDraftApplied={onServerDraftApplied}
          />
          {isDebugOverlayEnabled() && <StatsOverlay />}
          {isDebugOverlayEnabled() && <BackendRunOverlay />}
          <EmptyState />
          {agentV3RuntimeIdentity === 'v3_real' && <>
            <CanvasAgentCommandBar runtimeIdentity={agentV3RuntimeIdentity} task={v3.task ?? undefined} onSubmit={(prompt) => void v3.sendPrompt(prompt)} onCancel={() => void v3.cancel()} />
            <CanvasAgentTaskSheet task={v3.task ?? undefined} onApprove={() => void v3.approve(true)} />
          </>}
          {agentV4Task && <CanvasAgentV4TaskPanel task={agentV4Task} onApprove={onAgentV4Approve} onCancel={onAgentV4Cancel} onRetry={onAgentV4Retry} />}
        </ReactFlowProvider>
      </div>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#09090f',
  color: '#e2e8f0',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const statsStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 18,
  left: 366,
  zIndex: 20,
  background: 'rgba(18,18,28,0.82)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '6px 13px',
  fontSize: 11,
  color: '#64748b',
  fontFamily: 'monospace',
  pointerEvents: 'none',
  display: 'flex',
  gap: 12,
  transition: 'left 0.22s ease',
};

const backendRunOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 18,
  right: 24,
  zIndex: 20,
  maxWidth: 'min(560px, calc(100vw - 48px))',
  background: 'rgba(18,18,28,0.88)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '8px 12px',
  fontSize: 11,
  color: '#cbd5e1',
  fontFamily: 'monospace',
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
};

const emptyStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 10,
  width: 'min(1068px, calc(100vw - 420px))',
  minWidth: 'min(680px, calc(100vw - 48px))',
  textAlign: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
};

const emptyHintStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  marginBottom: 22,
};

const emptyPillStyle: React.CSSProperties = {
  minHeight: 48,
  background: 'rgba(39,39,42,0.96)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 18,
  padding: '0 24px',
  fontSize: 28,
  color: '#f8fafc',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  boxShadow: '0 14px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)',
};

const emptyHintTextStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.42)',
  fontSize: 15,
  fontWeight: 560,
  whiteSpace: 'nowrap',
};

const templateRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  justifyContent: 'center',
  pointerEvents: 'auto',
};

const templateButtonStyle: React.CSSProperties = {
  height: 48,
  background: 'rgba(18,18,18,0.92)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 15,
  padding: '0 18px',
  fontSize: 15,
  fontWeight: 720,
  color: 'rgba(255,255,255,0.48)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
  transition: 'all 0.15s',
};

const templateIconStyle: React.CSSProperties = {
  display: 'flex',
  color: 'rgba(255,255,255,0.44)',
};

export default FlowCanvasPage;
