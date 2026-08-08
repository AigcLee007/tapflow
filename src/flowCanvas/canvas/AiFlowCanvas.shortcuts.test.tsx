import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiFlowCanvas } from './AiFlowCanvas';
import { useFlowCanvasStore } from '../store/flowCanvasStore';

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => null,
    MiniMap: () => null,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: ({ children, nodeTypes, nodes, onPaneClick }: any) => (
      <div data-testid="react-flow" onClick={onPaneClick}>
        {nodes.map((node: any) => {
          const NodeComponent = nodeTypes[node.type];
          return NodeComponent ? <NodeComponent key={node.id} {...node} /> : null;
        })}
        {children}
      </div>
    ),
    SelectionMode: { Partial: 'partial' },
    addEdge: (edge: Record<string, unknown>, edges: Record<string, unknown>[]) => [...edges, edge],
    useConnection: () => ({ connectionNodeId: null }),
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
    useViewport: () => ({ zoom: 1 }),
  };
});

vi.mock('../nodes/FlowNodes', async () => {
  const React = await import('react');
  const Stub = ({ id, type }: { id: string; type: string }) => (
    <div aria-label={`${type} node ${id}`} role="combobox" contentEditable suppressContentEditableWarning>
      prompt
    </div>
  );
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

vi.mock('../nodes/ProductionNodes', () => ({
  Director3dNodeComponent: () => null,
  StoryboardNodeComponent: () => null,
  VideoEditorNodeComponent: () => null,
}));
vi.mock('../edges/SmartEdge', () => ({ SmartEdgeComponent: () => null }));
vi.mock('../panels', () => ({
  CanvasAssetPanel: () => null,
  CanvasCommentPanel: () => null,
  CanvasDockDrawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CanvasDockEmptyState: () => null,
  CanvasHistoryPanel: () => null,
  CanvasPromptPanel: () => null,
  CanvasTemplatePanel: () => null,
}));
vi.mock('./ConnectionMenu', () => ({ ConnectionMenu: () => null }));
vi.mock('./FlowContextMenu', () => ({ FlowContextMenu: () => null }));
vi.mock('./FlowLeftAddPanel', () => ({ FlowLeftAddPanel: () => null }));
vi.mock('../agent/CanvasAgentButton', () => ({ CanvasAgentButton: () => null }));
vi.mock('../agent/CanvasAgentPanel', () => ({ CanvasAgentPanel: () => null }));
vi.mock('../../assets/assetApi', () => ({ getAsset: vi.fn(), getAssetVariantUrl: vi.fn(), listAssets: vi.fn(async () => ({ total: 0 })) }));
vi.mock('../../services/v2FlowTemplatesApi', () => ({ getFlowTemplate: vi.fn(), recordFlowTemplateUsage: vi.fn() }));
vi.mock('../../services/v2FlowHistoryApi', () => ({ listProjectHistory: vi.fn(async () => ({ items: [] })) }));
vi.mock('../../services/v2FlowCommentsApi', () => ({ listFlowComments: vi.fn(async () => ({ items: [] })) }));
vi.mock('../runtime/v2WorkflowRunner', () => ({ runBackendWorkflow: vi.fn() }));

function loadCanvas(nodes: any[], edges: any[] = []) {
  useFlowCanvasStore.getState().loadProject({
    id: 'project-shortcuts',
    title: 'Shortcut test',
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    version: 1,
    updatedAt: 1,
  });
}

describe('AiFlowCanvas editor shortcut isolation', () => {
  beforeEach(() => {
    loadCanvas([
      { id: 'image-1', type: 'image', selected: true, position: { x: 0, y: 0 }, data: { kind: 'image', title: 'Image' } },
      { id: 'video-1', type: 'video', selected: true, position: { x: 320, y: 0 }, data: { kind: 'video', title: 'Video' } },
    ]);
  });

  it.each(['image-1', 'video-1'])('keeps selected node %s when Backspace/Delete originate in its editor', (nodeId) => {
    render(<AiFlowCanvas cullingEnabled={false} />);
    const editor = screen.getByRole('combobox', { name: new RegExp(nodeId) });

    fireEvent.keyDown(editor, { key: 'Backspace' });
    fireEvent.keyDown(editor, { key: 'Delete' });

    expect(useFlowCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['image-1', 'video-1']);
  });

  it('deletes selected nodes and edges from a non-editable canvas target', () => {
    loadCanvas([
      { id: 'image-1', type: 'image', selected: true, position: { x: 0, y: 0 }, data: { kind: 'image', title: 'Image' } },
      { id: 'video-1', type: 'video', selected: false, position: { x: 320, y: 0 }, data: { kind: 'video', title: 'Video' } },
    ], [{ id: 'image-video', source: 'image-1', target: 'video-1', selected: true }]);
    render(<AiFlowCanvas cullingEnabled={false} />);

    fireEvent.keyDown(screen.getByTestId('react-flow'), { key: 'Delete' });

    expect(useFlowCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['video-1']);
    expect(useFlowCanvasStore.getState().edges).toEqual([]);
  });
});
