import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NodeProps } from '@xyflow/react';

import { GroupNodeComponent } from './FlowNodes';
import { useFlowCanvasStore } from '../store/flowCanvasStore';

const runner = vi.hoisted(() => ({ runBackendWorkflow: vi.fn() }));

vi.mock('../runtime/v2WorkflowRunner', () => ({
  markBackendRunLaunchFailed: vi.fn(),
  runBackendWorkflow: (...args: unknown[]) => runner.runBackendWorkflow(...args),
}));
vi.mock('../text/useTextGenerationCatalog', () => ({ useTextGenerationCatalog: () => ({ error: null, loading: false, models: [], retry: vi.fn() }) }));
vi.mock('../video/useVideoGenerationCatalog', () => ({ useVideoGenerationCatalog: () => ({ error: null, loading: false, models: [], retry: vi.fn() }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return { Handle: () => null, NodeResizer: () => null, Position: { Left: 'left', Right: 'right' }, useConnection: () => ({ connectionNodeId: null }), useReactFlow: () => ({ flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }), getNode: () => null }), useViewport: () => ({ zoom: 1 }) };
});

describe('GroupNodeComponent execution', () => {
  beforeEach(() => {
    runner.runBackendWorkflow.mockReset();
    runner.runBackendWorkflow.mockResolvedValue(undefined);
    useFlowCanvasStore.getState().newProject();
  });

  test('opens confirmation and only starts a scoped group run after confirmation', () => {
    const group = useFlowCanvasStore.getState().addNode('group', { x: 0, y: 0 }, { kind: 'group', title: 'Batch' } as any, { selected: true });
    useFlowCanvasStore.getState().addNode('image', { x: 10, y: 10 }, { kind: 'image', generationPrompt: 'shoe', routeKey: 'image.default', title: 'Image' } as any, { parentId: group.id });
    const groupNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === group.id)!;
    render(<GroupNodeComponent {...({ data: groupNode.data, id: group.id, selected: true } as NodeProps<any>)} />);

    fireEvent.click(screen.getByRole('button', { name: /整组执行/ }));
    expect(screen.getByRole('dialog', { name: 'Confirm group execution' })).toBeTruthy();
    expect(runner.runBackendWorkflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start execution' }));
    expect(runner.runBackendWorkflow).toHaveBeenCalledWith({ runMode: 'group', groupId: group.id });
  });
});
