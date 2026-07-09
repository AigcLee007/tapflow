import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import { OPEN_PRODUCTION_STUDIO_EVENT } from '../studios/productionStudioEvents';
import type { FlowNodeKind } from '../types';
import { FlowContextMenu } from './FlowContextMenu';

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    screenToFlowPosition: (value: { x: number; y: number }) => value,
  }),
}));

describe('FlowContextMenu', () => {
  afterEach(() => {
    act(() => {
      useFlowCanvasStore.getState().newProject();
    });
  });

  it.each([
    ['故事板', 'storyboard'],
    ['剪辑工程', 'video_editor'],
  ] as Array<[string, FlowNodeKind]>)('adds %s nodes from the pane menu', (label, kind) => {
    act(() => {
      useFlowCanvasStore.getState().newProject();
      useFlowCanvasStore.setState({ contextMenu: { x: 120, y: 160 } });
    });

    render(<FlowContextMenu />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

    const created = useFlowCanvasStore.getState().nodes.at(-1);
    expect(created?.type).toBe(kind);
    expect(created?.data.kind).toBe(kind);
    expect(useFlowCanvasStore.getState().contextMenu).toBeNull();
  });

  it('opens the project director desk from the pane tools without creating a director node', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_PRODUCTION_STUDIO_EVENT, listener);
    act(() => {
      useFlowCanvasStore.getState().newProject();
      useFlowCanvasStore.setState({ contextMenu: { x: 120, y: 160 } });
    });

    render(<FlowContextMenu />);

    fireEvent.click(screen.getByRole('button', { name: /3D导演台/ }));

    expect(useFlowCanvasStore.getState().nodes).toEqual([]);
    expect(useFlowCanvasStore.getState().contextMenu).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      scope: 'project',
      studio: 'director3d',
    });
    window.removeEventListener(OPEN_PRODUCTION_STUDIO_EVENT, listener);
  });
});
