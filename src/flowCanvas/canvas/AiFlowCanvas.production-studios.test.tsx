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

const storyboardAssetNode = {
  ...storyboardNode,
  data: {
    ...storyboardNode.data,
    storyboard: {
      ...storyboardNode.data.storyboard,
      cells: [
        { id: 'cell-1', shotNo: 1, title: '开场', prompt: '旧提示词', assetId: 'asset-story-1' },
        { id: 'cell-2', shotNo: 2, title: '近景', assetId: 'asset-story-2' },
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

const videoNodeWithClip = {
  ...videoNode,
  data: {
    ...videoNode.data,
    videoEditor: {
      ...videoNode.data.videoEditor,
      timeline: {
        ...videoNode.data.videoEditor.timeline,
        clips: [{ id: 'clip-1', assetId: 'asset-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 }],
        durationMs: 3000,
      },
    },
  },
};

const videoNodeWithSubtitle = {
  ...videoNodeWithClip,
  data: {
    ...videoNodeWithClip.data,
    videoEditor: {
      ...videoNodeWithClip.data.videoEditor,
      timeline: {
        ...videoNodeWithClip.data.videoEditor.timeline,
        subtitles: [{ id: 'sub-1', text: '第一句旁白', startMs: 0, endMs: 1200 }],
      },
    },
  },
};

const videoNodeWithAudio = {
  ...videoNodeWithClip,
  data: {
    ...videoNodeWithClip.data,
    videoEditor: {
      ...videoNodeWithClip.data.videoEditor,
      timeline: {
        ...videoNodeWithClip.data.videoEditor.timeline,
        audio: [{ id: 'audio-1', assetId: 'asset-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 3000, volume: 1 }],
      },
    },
  },
};

const directorNodeWithThreeShots = {
  ...directorNode,
  data: {
    ...directorNode.data,
    director3d: {
      ...directorNode.data.director3d,
      shots: [
        { id: 'shot-1', cameraId: 'camera-1', startMs: 0, durationMs: 3000, motion: 'static' },
        { id: 'shot-2', cameraId: 'camera-1', startMs: 3000, durationMs: 5000, motion: 'dolly' },
        { id: 'shot-3', cameraId: 'camera-1', startMs: 8000, durationMs: 2000, motion: 'pan' },
      ],
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

  it('persists director shot timeline reorder and deletion through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [directorNodeWithThreeShots as any],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });

    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 2' }));
    fireEvent.click(screen.getByRole('button', { name: '镜头前移' }));

    let node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'director-node');
    expect(node?.data.director3d?.shots).toEqual([
      expect.objectContaining({ id: 'shot-2', startMs: 0, durationMs: 5000 }),
      expect.objectContaining({ id: 'shot-1', startMs: 5000, durationMs: 3000 }),
      expect.objectContaining({ id: 'shot-3', startMs: 8000, durationMs: 2000 }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '删除镜头段' }));
    node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'director-node');
    expect(node?.data.director3d?.shots).toEqual([
      expect.objectContaining({ id: 'shot-1', startMs: 0, durationMs: 3000 }),
      expect.objectContaining({ id: 'shot-3', startMs: 3000, durationMs: 2000 }),
    ]);
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

  it('syncs a director shot into an existing storyboard node', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [directorNode as any, storyboardNode as any],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });

    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '同步到故事板' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'storyboard-node');
    expect(node?.data.storyboard?.selectedIndex).toBe(1);
    expect(node?.data.storyboard?.cells[1]).toMatchObject({
      title: '镜头 1 · 主镜头',
      prompt: '俯拍建立空间关系',
      directorCameraId: 'camera-1',
      directorShotId: 'shot-1',
      sourceNodeId: 'director-node',
    });
    expect(JSON.stringify(node?.data.storyboard)).not.toMatch(/blob:|data:/);
  });

  it('creates a storyboard node when syncing a director shot without an existing storyboard', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { nodeId: 'director-node', studio: 'director3d' },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '同步到故事板' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.type === 'storyboard');
    expect(node?.position).toEqual({ x: 540, y: 420 });
    expect(node?.selected).toBe(true);
    expect(node?.data.title).toBe('导演分镜板');
    expect(node?.data.storyboard?.cells[0]).toMatchObject({
      title: '镜头 1 · 主镜头',
      prompt: '俯拍建立空间关系',
      directorCameraId: 'camera-1',
      directorShotId: 'shot-1',
      sourceNodeId: 'director-node',
    });
    expect(JSON.stringify(node?.data.storyboard)).not.toMatch(/blob:|data:/);
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

  it('creates an image node from the selected storyboard cell through the canvas store', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '生成选中镜头' }));

    const imageNode = useFlowCanvasStore
      .getState()
      .nodes.find((item) => item.type === 'image' && item.data.params?.storyboard);
    expect(imageNode?.position).toEqual({ x: 500, y: 160 });
    expect(imageNode?.selected).toBe(true);
    expect(imageNode?.data).toMatchObject({
      kind: 'image',
      title: '镜头 1 · 开场',
      generationMode: 'standard',
      generationPrompt: '旧提示词',
      params: {
        storyboard: {
          sourceStoryboardNodeId: 'storyboard-node',
          cellId: 'cell-1',
          shotNo: 1,
        },
      },
    });
    expect(JSON.stringify(imageNode?.data)).not.toMatch(/blob:|data:/);
  });

  it('creates image nodes from all prompted storyboard cells through the canvas store', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '生成全部镜头' }));

    const imageNodes = useFlowCanvasStore
      .getState()
      .nodes.filter((item) => item.type === 'image' && item.data.params?.storyboard);
    expect(imageNodes).toHaveLength(1);
    expect(imageNodes[0]?.position).toEqual({ x: 500, y: 160 });
    expect(imageNodes[0]?.data.generationPrompt).toBe('旧提示词');
    expect(JSON.stringify(imageNodes.map((node) => node.data))).not.toMatch(/blob:|data:/);
  });

  it('creates a storyboard sheet image node through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [storyboardAssetNode as any],
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

    fireEvent.click(screen.getByRole('button', { name: '合成故事板图' }));

    const sheetNode = useFlowCanvasStore
      .getState()
      .nodes.find((item) => item.type === 'image' && item.data.params?.storyboardSheet);
    expect(sheetNode?.position).toEqual({ x: 500, y: 160 });
    expect(sheetNode?.selected).toBe(true);
    expect(sheetNode?.data).toMatchObject({
      kind: 'image',
      title: '故事板合成图',
      generationMode: 'standard',
      params: {
        storyboardSheet: {
          sourceStoryboardNodeId: 'storyboard-node',
          aspect: '16:9',
          grid: '3x2',
          cells: [
            expect.objectContaining({
              assetId: 'asset-story-1',
              cellId: 'cell-1',
              shotNo: 1,
            }),
            expect.objectContaining({
              assetId: 'asset-story-2',
              cellId: 'cell-2',
              shotNo: 2,
            }),
          ],
        },
      },
    });
    expect(sheetNode?.data.generationPrompt).toContain('将以下分镜合成为一张故事板排版图');
    expect(JSON.stringify(sheetNode?.data)).not.toMatch(/blob:|data:/);
  });

  it('syncs storyboard asset cells into an existing video editor node', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [storyboardAssetNode as any, videoNode as any],
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

    fireEvent.click(screen.getByRole('button', { name: '同步到剪辑工程' }));

    const state = useFlowCanvasStore.getState();
    const videoNodes = state.nodes.filter((item) => item.type === 'video_editor');
    const node = state.nodes.find((item) => item.id === 'video-node');
    expect(videoNodes).toHaveLength(1);
    expect(node?.data.videoEditor?.timeline.clips).toEqual([
      expect.objectContaining({
        assetId: 'asset-story-1',
        kind: 'image',
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-1',
        storyboardShotNo: 1,
      }),
      expect.objectContaining({
        assetId: 'asset-story-2',
        kind: 'image',
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-2',
        storyboardShotNo: 2,
      }),
    ]);
    expect(node?.data.videoEditor?.timeline.durationMs).toBe(6000);
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('creates a video editor node when syncing storyboard assets without an existing editor', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [storyboardAssetNode as any],
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

    fireEvent.click(screen.getByRole('button', { name: '同步到剪辑工程' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.type === 'video_editor');
    expect(node?.position).toEqual({ x: 500, y: 160 });
    expect(node?.selected).toBe(true);
    expect(node?.data.title).toBe('故事板剪辑工程');
    expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
      assetId: 'asset-story-1',
      kind: 'image',
      sourceStoryboardNodeId: 'storyboard-node',
      storyboardCellId: 'cell-1',
    });
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
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

  it('persists selected video clip duration edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithClip as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.change(screen.getByLabelText('片段时长（秒）'), { target: { value: '4.5' } });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
      id: 'clip-1',
      outMs: 4500,
    });
    expect(node?.data.videoEditor?.timeline.durationMs).toBe(4500);
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('persists selected video clip transition edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithClip as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.click(screen.getByRole('button', { name: '淡入淡出' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
      id: 'clip-1',
      transitionOut: { durationMs: 500, type: 'fade' },
    });
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('persists selected video clip audio settings through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithClip as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '片段静音' }));
    fireEvent.change(screen.getByLabelText('片段音量'), { target: { value: '0.55' } });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
      id: 'clip-1',
      muted: true,
      volume: 0.55,
    });
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('persists selected video clip deletion through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithClip as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.click(screen.getByRole('button', { name: '删除片段' }));

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.clips).toEqual([]);
    expect(node?.data.videoEditor?.timeline.durationMs).toBe(0);
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('persists selected video subtitle edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithSubtitle as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择字幕 sub-1' }));
    fireEvent.change(screen.getByLabelText('字幕文本'), { target: { value: '新的字幕文本' } });

    let node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.subtitles[0]).toMatchObject({
      id: 'sub-1',
      text: '新的字幕文本',
    });

    fireEvent.change(screen.getByLabelText('字幕开始（秒）'), { target: { value: '0.8' } });
    node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.subtitles[0]).toMatchObject({
      id: 'sub-1',
      startMs: 800,
      endMs: 2000,
    });

    fireEvent.click(screen.getByRole('button', { name: '删除字幕' }));
    node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.subtitles).toEqual([]);
    expect(node?.data.videoEditor?.timeline.durationMs).toBe(3000);
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('persists video audio track edits through the canvas store', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithAudio as any],
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

    fireEvent.click(screen.getByRole('button', { name: '选择音频 audio-1' }));
    fireEvent.change(screen.getByLabelText('音频开始（秒）'), { target: { value: '1.5' } });

    let node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.audio[0]).toMatchObject({
      id: 'audio-1',
      startMs: 1500,
    });
    expect(node?.data.videoEditor?.timeline.durationMs).toBe(4500);

    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '0.4' } });
    node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
    expect(node?.data.videoEditor?.timeline.audio[0]).toMatchObject({
      id: 'audio-1',
      volume: 0.4,
    });
    expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
  });

  it('creates a runnable video node from the video editor export request', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [videoNodeWithClip as any],
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
    fireEvent.click(screen.getByRole('button', { name: '导出到画布' }));

    const state = useFlowCanvasStore.getState();
    const exported = state.nodes.find((item) => item.type === 'video' && item.data.title === '剪辑工程导出');
    expect(exported).toBeTruthy();
    expect(exported?.position).toEqual({ x: 600, y: 200 });
    expect(exported?.selected).toBe(true);
    expect(exported?.data.routeKey).toBe('video.editor.ffmpeg');
    expect(exported?.data.params).toEqual({
      videoEditor: expect.objectContaining({
        sourceVideoEditorNodeId: 'video-node',
        timeline: expect.objectContaining({
          clips: [expect.objectContaining({ assetId: 'asset-video-1' })],
        }),
      }),
    });
    expect(JSON.stringify(exported?.data)).not.toMatch(/blob:|data:/);
  });
});
