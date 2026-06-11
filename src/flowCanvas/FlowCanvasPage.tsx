/**
 * Flow canvas surface used by the authenticated project route.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image as ImageIcon, LayoutList, MousePointerClick, Music, Sparkles, Video } from 'lucide-react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { AiFlowCanvas } from './canvas/AiFlowCanvas';
import { FlowTopToolbar } from './canvas/FlowTopToolbar';
import { useFlowCanvasStore } from './store/flowCanvasStore';
import type { FlowNodeKind } from './types';
import { disposeBackendWorkflowRunStream } from './runtime/v2WorkflowRunner';

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
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
const FLOW_PAGE_DESKTOP_SCALE = 0.8;
const FLOW_PAGE_DESKTOP_SCALE_INVERSE = 1 / FLOW_PAGE_DESKTOP_SCALE;

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
  { icon: <Video size={23} strokeWidth={1.8} />, label: '文字生视频', kind: 'video' },
  { icon: <ImageIcon size={23} strokeWidth={1.8} />, label: '图片换背景', kind: 'image' },
  { icon: <Sparkles size={22} strokeWidth={1.8} />, label: '首帧生成视频', kind: 'video' },
  { icon: <Music size={23} strokeWidth={1.8} />, label: '音频生视频', kind: 'video' },
  { icon: <LayoutList size={22} strokeWidth={1.8} />, label: '模板', kind: 'text' },
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
        <span style={emptyPillStyle}>
          <MousePointerClick size={26} strokeWidth={1.8} color="#38d5ff" />
          双击
        </span>
        <span style={emptyHintTextStyle}>画布自由生成,或者查看模板</span>
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
}> = ({ saveStatus }) => {
  const [cullingEnabled, setCullingEnabled] = useState(true);
  const toggleCulling = useCallback(() => setCullingEnabled((v) => !v), []);

  useFlowShortcuts();
  useFlowViewportLock();
  useBackendFlowBinding();
  useBackendRunCleanup();

  return (
    <div style={pageStyle}>
      <div data-testid="flow-page-scale-shell" style={pageScaleShellStyle}>
        <FlowTopToolbar
          onToggleCulling={toggleCulling}
          cullingEnabled={cullingEnabled}
          saveStatus={saveStatus}
        />
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlowProvider>
            <AiFlowCanvas cullingEnabled={cullingEnabled} />
            {isDebugOverlayEnabled() && <StatsOverlay />}
            {isDebugOverlayEnabled() && <BackendRunOverlay />}
            <EmptyState />
          </ReactFlowProvider>
        </div>
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

const pageScaleShellStyle: React.CSSProperties = {
  width: `${FLOW_PAGE_DESKTOP_SCALE_INVERSE * 100}%`,
  height: `${FLOW_PAGE_DESKTOP_SCALE_INVERSE * 100}%`,
  display: 'flex',
  flexDirection: 'column',
  transform: `scale(${FLOW_PAGE_DESKTOP_SCALE})`,
  transformOrigin: 'top left',
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
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  marginBottom: 18,
};

const emptyPillStyle: React.CSSProperties = {
  minHeight: 48,
  background: 'rgba(39,39,42,0.96)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 15,
  padding: '0 19px',
  fontSize: 25,
  color: '#f8fafc',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  boxShadow: '0 14px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)',
};

const emptyHintTextStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.32)',
  fontSize: 25,
  fontWeight: 720,
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
  height: 56,
  background: 'rgba(18,18,18,0.92)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 17,
  padding: '0 24px',
  fontSize: 21,
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
