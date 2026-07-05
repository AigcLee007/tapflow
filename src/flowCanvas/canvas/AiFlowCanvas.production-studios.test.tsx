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
      cameras: [{ id: 'camera-1', name: '主镜头', position: [0, 2, 6], target: [0, 1, 0], prompt: '俯拍建立空间关系' }],
      shots: [{ id: 'shot-1', cameraId: 'camera-1', startMs: 0, durationMs: 3000, motion: 'static' }],
    },
  },
};

const storyboardNode = {
  id: 'storyboard-node',
  type: 'storyboard',
  position: { x: 80, y: 120 },
  data: {
    kind: 'storyboard',
    title: '故事板',
    width: 360,
    height: 260,
    status: 'idle',
    generationStatus: 'idle',
    createdAt: 1,
    updatedAt: 1,
    storyboard: {
      aspect: '16:9',
      grid: '3x2',
      selectedIndex: 0,
      cells: [
        { id: 'cell-1', shotNo: 1, title: '开场', prompt: '旧提示词' },
        { id: 'cell-2', shotNo: 2 },
      ],
    },
  },
};

const videoNode = {
  id: 'video-node',
  type: 'video_editor',
  position: { x: 180, y: 160 },
  data: {
    kind: 'video_editor',
    title: '剪辑工程',
    width: 360,
    height: 220,
    status: 'idle',
    generationStatus: 'idle',
    createdAt: 1,
    updatedAt: 1,
    videoEditor: {
      version: 1,
      aspect: '16:9',
      resolution: '1920x1080',
      timeline: {
        audio: [],
        clips: [],
        durationMs: 0,
        subtitles: [],
      },
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

  it('persists director actor edits through the canvas store', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '添加角色' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'director-node');
    expect(node?.data.director3d?.actors[0]).toMatchObject({
      kind: 'placeholder_humanoid',
      name: '角色 1',
      visible: true,
    });
    expect(JSON.stringify(node?.data.director3d)).not.toMatch(/blob:|data:/);
  });

  it('persists director camera inspector edits through the canvas store', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '选择对象 主镜头' }));
    fireEvent.change(screen.getByLabelText('镜头提示词'), { target: { value: '俯拍建立空间关系' } });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'director-node');
    expect(node?.data.director3d?.cameras[0]?.prompt).toBe('俯拍建立空间关系');
    expect(JSON.stringify(node?.data.director3d)).not.toMatch(/blob:|data:/);
  });

  it('creates a downstream image node from a director shot through the canvas store', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '合成到画布' }));

    const imageNode = useFlowCanvasStore
      .getState()
      .nodes.find((item) => item.type === 'image' && item.data.params?.director3d);
    expect(imageNode?.position).toEqual({ x: 540, y: 120 });
    expect(imageNode?.selected).toBe(true);
    expect(imageNode?.data).toMatchObject({
      kind: 'image',
      title: '镜头 1 生成图',
      generationMode: 'standard',
      generationPrompt: '俯拍建立空间关系',
      params: {
        director3d: {
          sourceDirectorNodeId: 'director-node',
          cameraId: 'camera-1',
          shotId: 'shot-1',
          camera: {
            name: '主镜头',
            position: [0, 2, 6],
            target: [0, 1, 0],
          },
          durationMs: 3000,
          motion: 'static',
          startMs: 0,
        },
      },
    });
    expect(JSON.stringify(imageNode?.data)).not.toMatch(/blob:|data:/);
  });

  it('persists storyboard prompt edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [storyboardNode as any],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });

    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'storyboard-node', studio: 'storyboard' },
        }),
      );
    });

    fireEvent.change(screen.getByLabelText('分镜提示词'), { target: { value: '新的故事板提示词' } });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'storyboard-node');
    expect(node?.data.storyboard?.cells[0]?.prompt).toBe('新的故事板提示词');
    expect(JSON.stringify(node?.data.storyboard)).not.toMatch(/blob:|data:/);
  });

  it('persists video editor clip edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNode as any],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });

    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'video-node', studio: 'video_editor' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '添加图片片段' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
      kind: 'image',
      assetId: 'placeholder-image-1',
    });
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });
});
