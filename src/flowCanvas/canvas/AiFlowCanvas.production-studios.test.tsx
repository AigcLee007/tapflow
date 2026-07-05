import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiFlowCanvas } from './AiFlowCanvas';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import { OPEN_PRODUCTION_STUDIO_EVENT } from '../studios/productionStudioEvents';

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    MiniMap: () => null,
    ReactFlow: ({ children, onPaneClick, onPaneContextMenu }: any) => (
      <div data-testid="react-flow" onClick={onPaneClick} onContextMenu={onPaneContextMenu}>
        {children}
      </div>
    ),
    SelectionMode: { Partial: 'partial' },
    useReactFlow: () => ({
      fitView: vi.fn(),
      flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      getNode: () => null,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      setCenter: vi.fn(),
      setViewport: vi.fn(async () => undefined),
      zoomTo: vi.fn(async () => undefined),
    }),
  };
});

vi.mock('../nodes/FlowNodes', async () => {
  const React = await import('react');
  const Stub = ({ data }: any) => React.createElement('div', null, data?.title ?? 'node');
  return {
    AudioNodeComponent: Stub,
    GroupNodeComponent: Stub,
    ImageEditorNodeComponent: Stub,
    ImageNodeComponent: Stub,
    TextNodeComponent: Stub,
    UploadNodeComponent: Stub,
    VideoNodeComponent: Stub,
  };
});

vi.mock('../nodes/ProductionNodes', async () => {
  const React = await import('react');
  const Stub = ({ data }: any) => React.createElement('div', null, data?.title ?? 'production-node');
  return {
    Director3dNodeComponent: Stub,
    StoryboardNodeComponent: Stub,
    VideoEditorNodeComponent: Stub,
  };
});

vi.mock('../edges/SmartEdge', () => ({
  SmartEdgeComponent: () => null,
}));

vi.mock('../panels', async () => {
  const React = await import('react');
  return {
    CanvasAssetPanel: () => null,
    CanvasCommentPanel: () => null,
    CanvasDockDrawer: ({ children }: any) => <div>{children}</div>,
    CanvasDockEmptyState: () => null,
    CanvasHistoryPanel: () => null,
    CanvasTemplatePanel: () => null,
  };
});

vi.mock('./ConnectionMenu', () => ({
  ConnectionMenu: () => null,
}));

vi.mock('./FlowContextMenu', () => ({
  FlowContextMenu: () => null,
}));

vi.mock('./FlowLeftAddPanel', () => ({
  FlowLeftAddPanel: () => null,
}));

vi.mock('../agent/CanvasAgentButton', () => ({
  CanvasAgentButton: () => null,
}));

vi.mock('../agent/CanvasAgentPanel', () => ({
  CanvasAgentPanel: () => null,
}));

vi.mock('../../assets/assetApi', () => ({
  getAsset: vi.fn(),
  getAssetVariantUrl: vi.fn(),
  listAssets: vi.fn(async () => ({ items: [], total: 0 })),
}));

vi.mock('../../services/v2FlowTemplatesApi', () => ({
  getFlowTemplate: vi.fn(),
  recordFlowTemplateUsage: vi.fn(async () => undefined),
}));

vi.mock('../../services/v2FlowHistoryApi', () => ({
  listProjectHistory: vi.fn(async () => ({ items: [] })),
}));

vi.mock('../../services/v2FlowCommentsApi', () => ({
  listFlowComments: vi.fn(async () => ({ items: [] })),
}));

vi.mock('../runtime/v2WorkflowRunner', () => ({
  runBackendWorkflow: vi.fn(),
}));

const directorNode = {
  id: 'director-node',
  type: 'director3d',
  position: { x: 120, y: 80 },
  data: {
    kind: 'director3d',
    title: '3D导演台',
    width: 340,
    height: 220,
    status: 'idle',
    generationStatus: 'idle',
    createdAt: 1,
    updatedAt: 1,
    director3d: {
      version: 1,
      scene: { gridVisible: true, units: 'meters' },
      actors: [],
      cameras: [{ id: 'camera-1', name: '主镜头', position: [0, 2, 6], target: [0, 1, 0] }],
      shots: [],
    },
  },
};

describe('AiFlowCanvas production studios', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [directorNode as any],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });
  });

  it('opens and closes a production studio shell from the canvas event', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    expect(screen.getByRole('dialog', { name: '3D导演台' })).toBeTruthy();
    expect(screen.getByText('导演视口')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }));
    expect(screen.queryByRole('dialog', { name: '3D导演台' })).toBeNull();
  });
});
