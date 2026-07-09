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

vi.mock('../studios/StoryAiDirectorDesk', () => ({
  StoryAiDirectorDesk: (props: any) => (
    <div>
      <button
        type="button"
        onClick={() =>
          props.onUpdateNodeData?.(props.nodeId, {
            director3d: {
              version: 1,
              scene: { gridVisible: true, units: 'meters' },
              actors: [
                {
                  id: 'actor-1',
                  kind: 'placeholder_humanoid',
                  locked: false,
                  name: '角色 1',
                  position: [0, 0, 0],
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1],
                  visible: true,
                },
              ],
              cameras: [],
              shots: [],
              storyAiProject: {
                version: 1,
                scene: {
                  backgroundColor: '#203040',
                  showLabels: false,
                  snapToGrid: true,
                  showGround: false,
                  groundOpacity: 0.18,
                  groundHeight: -1.25,
                  panoramaYaw: 45,
                  panoramaRadius: 90,
                },
                assets: [
                  {
                    id: 'asset_1',
                    kind: 'panorama',
                    sourceType: 'image',
                    fileName: 'studio.png',
                    url: 'blob:live-panorama',
                    projectionMode: 'equirectangular',
                  },
                ],
                objects: [
                  {
                    id: 'char_default_a',
                    name: '角色01',
                    kind: 'character',
                    color: '#ff3355',
                    visible: true,
                    locked: false,
                    transform: {
                      position: [0, 0, 0],
                      rotation: [0, 0, 0],
                      scale: [1, 1, 1],
                    },
                  },
                  {
                    id: 'cam_object_1',
                    name: '机位01',
                    kind: 'camera',
                    visible: false,
                    locked: false,
                    linkedCameraId: 'cam_1',
                    transform: {
                      position: [0, 2.2, 9],
                      rotation: [0, 0, 0],
                      scale: [1, 1, 1],
                    },
                  },
                ],
                cameras: [
                  {
                    id: 'cam_1',
                    name: '机位01',
                    fov: 50,
                    transform: {
                      position: [0, 2.2, 9],
                      rotation: [0, 0, 0],
                      scale: [1, 1, 1],
                    },
                    targetMode: 'manual',
                    target: [0, 1.2, 0],
                    lastCaptureUrl: 'data:image/png;base64,live',
                    captures: [{ id: 'capture_1', dataUrl: 'data:image/png;base64,live' }],
                  },
                ],
                activeCameraId: 'cam_1',
                panoramaAssetId: 'asset_1',
              },
            },
          })
        }
      >
        mock add actor
      </button>
      <button type="button" onClick={props.onClose}>
        mock close
      </button>
    </div>
  ),
}));

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
  listAssets: vi.fn(() => new Promise(() => undefined)),
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
  runBackendWorkflow: vi.fn(async () => undefined),
}));

describe('AiFlowCanvas project director desk', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().loadProject({
      id: 'project-1',
      title: '项目',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      version: 1,
      updatedAt: 1,
    });
  });

  it('opens the default project director desk without adding a director canvas node', () => {
    render(<AiFlowCanvas cullingEnabled={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
          detail: { scope: 'project', studio: 'director3d' },
        }),
      );
    });

    expect(screen.getByRole('dialog', { name: '3D导演台' })).toBeTruthy();
    expect(useFlowCanvasStore.getState().nodes).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'mock add actor' }));

    const state = useFlowCanvasStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.projectStudios.director3d?.actors[0]).toMatchObject({
      kind: 'placeholder_humanoid',
      name: '角色 1',
      visible: true,
    });
    expect(state.projectStudios.director3d?.storyAiProject).toMatchObject({
      scene: {
        backgroundColor: '#203040',
        showLabels: false,
        snapToGrid: true,
        showGround: false,
        groundOpacity: 0.18,
        groundHeight: -1.25,
        panoramaYaw: 45,
        panoramaRadius: 90,
      },
      assets: [
        {
          id: 'asset_1',
          kind: 'panorama',
          sourceType: 'image',
          fileName: 'studio.png',
          projectionMode: 'equirectangular',
        },
      ],
      objects: [
        {
          id: 'char_default_a',
          color: '#ff3355',
        },
        {
          id: 'cam_object_1',
          visible: false,
        },
      ],
      activeCameraId: 'cam_1',
      panoramaAssetId: 'asset_1',
    });
    expect(JSON.stringify(state.projectStudios.director3d)).not.toMatch(/blob:|data:|https?:\/\//);
  });
});
