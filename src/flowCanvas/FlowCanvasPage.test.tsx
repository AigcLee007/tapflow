import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import FlowCanvasPage from './FlowCanvasPage';

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: () => ({
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  }),
}));

vi.mock('./canvas/AiFlowCanvas', () => ({
  AiFlowCanvas: () => <div data-testid="ai-flow-canvas" />,
}));

vi.mock('./canvas/FlowTopToolbar', () => ({
  FlowTopToolbar: () => <div data-testid="flow-top-toolbar" />,
}));

vi.mock('./store/flowCanvasStore', () => ({
  useFlowCanvasStore: (selector: (state: any) => any) =>
    selector({
      addNode: vi.fn(),
      backendFlowId: null,
      closeImageTool: vi.fn(),
      currentRunId: null,
      deleteSelectedEdges: vi.fn(),
      deleteSelectedNodes: vi.fn(),
      deselectAll: vi.fn(),
      duplicateSelectedNodes: vi.fn(),
      edges: [],
      isRunningBackendWorkflow: false,
      nodes: [],
      redo: vi.fn(),
      runError: null,
      runStatus: null,
      selectAll: vi.fn(),
      setBackendFlowBinding: vi.fn(),
      undo: vi.fn(),
    }),
}));

vi.mock('./runtime/v2WorkflowRunner', () => ({
  disposeBackendWorkflowRunStream: vi.fn(),
}));

describe('FlowCanvasPage scale shell', () => {
  test('renders the desktop project shell at 0.8 visual scale', () => {
    render(<FlowCanvasPage />);

    const shell = screen.getByTestId('flow-page-scale-shell');
    expect(shell).toBeTruthy();
    expect((shell as HTMLDivElement).style.transform).toBe('scale(0.8)');
    expect((shell as HTMLDivElement).style.transformOrigin).toBe('top left');
    expect((shell as HTMLDivElement).style.width).toBe('125%');
    expect((shell as HTMLDivElement).style.height).toBe('125%');
  });
});
