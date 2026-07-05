import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductionStudioShell } from './ProductionStudioShell';

const directorNode = {
  id: 'director-node',
  type: 'director3d',
  position: { x: 0, y: 0 },
  data: {
    kind: 'director3d',
    title: '3D导演台',
    width: 340,
    height: 220,
    status: 'idle',
    director3d: {
      version: 1,
      scene: { gridVisible: true, units: 'meters' },
      actors: [{ id: 'actor-1', name: '角色 A', kind: 'placeholder_humanoid', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, locked: false }],
      cameras: [{ id: 'camera-1', name: '主镜头', position: [0, 2, 6], target: [0, 1, 0] }],
      shots: [{ id: 'shot-1', cameraId: 'camera-1', startMs: 0, durationMs: 3000, motion: 'static' }],
    },
  },
};

const storyboardNode = {
  id: 'storyboard-node',
  type: 'storyboard',
  position: { x: 0, y: 0 },
  data: {
    kind: 'storyboard',
    title: '故事板',
    width: 360,
    height: 260,
    status: 'idle',
    storyboard: {
      aspect: '16:9',
      grid: '3x2',
      selectedIndex: 1,
      cells: [
        { id: 'cell-1', shotNo: 1, title: '开场', prompt: '城市远景', assetId: 'asset-1' },
        { id: 'cell-2', shotNo: 2, title: '近景', prompt: '角色回头' },
      ],
    },
  },
};

const videoNode = {
  id: 'video-node',
  type: 'video_editor',
  position: { x: 0, y: 0 },
  data: {
    kind: 'video_editor',
    title: '剪辑工程',
    width: 360,
    height: 220,
    status: 'idle',
    videoEditor: {
      version: 1,
      aspect: '16:9',
      resolution: '1920x1080',
      timeline: {
        audio: [],
        clips: [{ id: 'clip-1', assetId: 'asset-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 }],
        durationMs: 3000,
        subtitles: [{ id: 'sub-1', text: '第一句旁白', startMs: 0, endMs: 1200 }],
      },
    },
  },
};

describe('ProductionStudioShell', () => {
  it('renders the 3D director desk shell with scene panels', () => {
    const onClose = vi.fn();
    render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '3D导演台' })).toBeTruthy();
    expect(screen.getByText('场景对象')).toBeTruthy();
    expect(screen.getByText('导演视口')).toBeTruthy();
    expect(screen.getByText('对象属性')).toBeTruthy();
    expect(screen.getByText('镜头轨道')).toBeTruthy();
    expect(screen.getByText('角色 A')).toBeTruthy();
    expect(screen.getByText('主镜头')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('emits structured director patches for actor, camera, and shot actions', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加角色' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            kind: 'placeholder_humanoid',
            name: '角色 2',
            visible: true,
          }),
        ]),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '添加镜头' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-2', name: '镜头 2' })]),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '捕获镜头段' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([
          expect.objectContaining({
            cameraId: 'camera-1',
            motion: 'static',
          }),
        ]),
      }),
    });

    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:/);
  });

  it('renders storyboard shell with selected shot context', () => {
    render(<ProductionStudioShell studio="storyboard" node={storyboardNode as any} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: '故事板' })).toBeTruthy();
    expect(screen.getByText('分镜格')).toBeTruthy();
    expect(screen.getByText('镜头 1')).toBeTruthy();
    expect(screen.getAllByText('镜头 2').length).toBeGreaterThan(0);
    expect(screen.getByText('选中分镜')).toBeTruthy();
    expect(screen.getByText('角色回头')).toBeTruthy();
  });

  it('emits safe storyboard patches for cell selection and selected-cell edits', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头 1' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('storyboard-node', {
      storyboard: expect.objectContaining({ selectedIndex: 0 }),
    });

    fireEvent.change(screen.getByLabelText('分镜标题'), { target: { value: '新的开场' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('storyboard-node', {
      storyboard: expect.objectContaining({
        cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-2', title: '新的开场' })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('分镜提示词'), { target: { value: '新的镜头提示词' } });
    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(latestPatch).toMatchObject({
      storyboard: expect.objectContaining({
        cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-2', prompt: '新的镜头提示词' })]),
      }),
    });
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:/);
  });

  it('renders video editor shell and closes on Escape', () => {
    const onClose = vi.fn();
    render(<ProductionStudioShell studio="video_editor" node={videoNode as any} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '剪辑工程' })).toBeTruthy();
    expect(screen.getByText('素材箱')).toBeTruthy();
    expect(screen.getByText('预览监看')).toBeTruthy();
    expect(screen.getByText('时间线')).toBeTruthy();
    expect(screen.getByText('参数检查')).toBeTruthy();
    expect(screen.getByText('clip-1')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
