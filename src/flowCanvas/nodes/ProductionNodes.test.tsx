import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Director3dNodeComponent,
  StoryboardNodeComponent,
  VideoEditorNodeComponent,
} from './ProductionNodes';

const baseProps = {
  dragging: false,
  id: 'node-1',
  isConnectable: true,
  selected: false,
  type: 'storyboard',
  xPos: 0,
  yPos: 0,
  zIndex: 0,
} as any;

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<any>('@xyflow/react');
  return {
    ...actual,
    Handle: () => <div data-testid="handle" />,
    NodeResizer: () => null,
  };
});

describe('production suite nodes', () => {
  it('renders storyboard filled count from cells', () => {
    render(
      <StoryboardNodeComponent
        {...baseProps}
        data={{
          kind: 'storyboard',
          title: '故事板',
          width: 360,
          height: 260,
          status: 'idle',
          storyboard: {
            aspect: '16:9',
            grid: '3x2',
            selectedIndex: 0,
            cells: [
              { id: 'cell-1', shotNo: 1, assetId: 'asset-1' },
              { id: 'cell-2', shotNo: 2 },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('故事板')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('renders director desk and video editor open actions', () => {
    render(
      <Director3dNodeComponent
        {...baseProps}
        data={{ kind: 'director3d', title: '3D导演台', width: 340, height: 220, status: 'idle' }}
      />,
    );
    render(
      <VideoEditorNodeComponent
        {...baseProps}
        data={{ kind: 'video_editor', title: '剪辑工程', width: 360, height: 220, status: 'idle' }}
      />,
    );

    expect(screen.getByRole('button', { name: '打开导演台' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开剪辑器' })).toBeTruthy();
  });
});
