import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionStudioShell } from './ProductionStudioShell';

const listAssetsMock = vi.hoisted(() => vi.fn());

vi.mock('../../assets/assetApi', () => ({
  listAssets: (...args: unknown[]) => listAssetsMock(...args),
}));

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
  beforeEach(() => {
    listAssetsMock.mockReset();
    listAssetsMock.mockImplementation(() => new Promise(() => undefined));
  });

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
    expect(screen.getByTestId('director-three-viewport').getAttribute('data-actor-count')).toBe('1');
    expect(screen.getByTestId('director-three-viewport').getAttribute('data-camera-count')).toBe('1');
    expect(screen.getByTestId('director-three-viewport').getAttribute('data-shot-count')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('feeds selected director shots into the 3D viewport', () => {
    render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-shot-count')).toBe('1');
    expect(viewport.getAttribute('data-selected-shot-id')).toBe('shot-1');
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

  it('captures a new shot from the selected director camera', () => {
    const onUpdateNodeData = vi.fn();
    const nodeWithTwoCameras = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          cameras: [
            directorNode.data.director3d.cameras[0],
            {
              id: 'camera-2',
              name: '侧面跟拍',
              position: [2, 1.6, 4],
              target: [0, 1, 0],
              durationMs: 5200,
              focalMm: 70,
              prompt: '从侧面跟拍角色穿过场景',
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithTwoCameras as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 侧面跟拍' }));
    fireEvent.click(screen.getByRole('button', { name: '捕获镜头段' }));

    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([
          expect.objectContaining({
            cameraId: 'camera-2',
            cameraSnapshot: expect.objectContaining({
              focalMm: 70,
              name: '侧面跟拍',
              position: [2, 1.6, 4],
              target: [0, 1, 0],
            }),
            durationMs: 5200,
            id: 'shot-2',
            motion: 'static',
            prompt: '从侧面跟拍角色穿过场景',
            startMs: 3000,
          }),
        ]),
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls.at(-1)?.[1])).not.toMatch(/blob:|data:/);
  });

  it('uses the captured camera snapshot when synthesizing a director shot', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    const nodeWithSnapshotShot = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          cameras: [
            {
              ...directorNode.data.director3d.cameras[0],
              focalMm: 28,
              position: [9, 9, 9],
              target: [1, 1, 1],
            },
          ],
          shots: [
            {
              ...directorNode.data.director3d.shots[0],
              cameraSnapshot: {
                focalMm: 55,
                name: '捕获时主镜头',
                position: [0.5, 2.2, 5.5],
                target: [0, 1.1, 0],
              },
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithSnapshotShot as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '合成到画布' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
      kind: 'image',
      position: { x: 420, y: 40 },
      data: expect.objectContaining({
        params: expect.objectContaining({
          director3d: expect.objectContaining({
            camera: expect.objectContaining({
              focalMm: 55,
              name: '捕获时主镜头',
              position: [0.5, 2.2, 5.5],
              target: [0, 1.1, 0],
            }),
          }),
        }),
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
  });

  it('emits structured director patches for selected actor inspector edits', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 角色 A' }));
    fireEvent.change(screen.getByLabelText('对象名称'), { target: { value: '主角 A' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', name: '主角 A' })]),
      }),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '对象可见' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', visible: false })]),
      }),
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '对象锁定' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', locked: true })]),
      }),
    });

    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:/);
  });

  it('binds selected director actors to image assets without persisting preview URLs', async () => {
    listAssetsMock.mockResolvedValueOnce({
      items: [{ id: 'asset-actor-image-2', kind: 'image', title: '角色参考图' }],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 角色 A' }));

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
        includePreviewUrls: false,
        kind: 'image',
        page: 1,
        pageSize: 6,
      }));
    });

    fireEvent.click(await screen.findByRole('button', { name: '绑定素材 asset-actor-image-2' }));

    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(latestPatch).toEqual({
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            assetId: 'asset-actor-image-2',
            id: 'actor-1',
            kind: 'image_plane',
          }),
        ]),
      }),
    });
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('binds the director scene background to an image asset id', async () => {
    listAssetsMock.mockResolvedValueOnce({
      items: [{ id: 'asset-scene-bg-1', kind: 'image', title: '摄影棚背景' }],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 场景背景' }));

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
        includePreviewUrls: false,
        kind: 'image',
        page: 1,
        pageSize: 6,
      }));
    });

    fireEvent.click(await screen.findByRole('button', { name: '绑定素材 asset-scene-bg-1' }));

    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(latestPatch).toEqual({
      director3d: expect.objectContaining({
        scene: expect.objectContaining({
          backgroundAssetId: 'asset-scene-bg-1',
        }),
      }),
    });
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('feeds asset-backed director scene metadata into the 3D viewport', () => {
    const assetBackedDirectorNode = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          scene: {
            ...directorNode.data.director3d.scene,
            backgroundAssetId: 'asset-scene-bg-1',
          },
          actors: [
            {
              ...directorNode.data.director3d.actors[0],
              assetId: 'asset-actor-image-1',
              kind: 'image_plane',
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={assetBackedDirectorNode as any}
        onClose={vi.fn()}
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-asset-actor-count')).toBe('1');
    expect(viewport.getAttribute('data-scene-background-asset-id')).toBe('asset-scene-bg-1');
  });

  it('emits safe transform patches for selected director actors', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 角色 A' }));
    fireEvent.change(screen.getByLabelText('位置 X'), { target: { value: '1.25' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', position: [1.25, 0, 0] })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('旋转 Y'), { target: { value: '45' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', rotation: [0, 45, 0] })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('缩放 Z'), { target: { value: '2.5' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', scale: [1, 1, 2.5] })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('位置 X'), { target: { value: 'Infinity' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', position: [0, 0, 0] })]),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('falls back to safe actor transform values for malformed director drafts', () => {
    const onUpdateNodeData = vi.fn();
    const malformedDirectorNode = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          actors: [
            {
              ...directorNode.data.director3d.actors[0],
              position: undefined,
              rotation: ['bad', 10, null],
              scale: undefined,
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={malformedDirectorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 角色 A' }));
    expect((screen.getByLabelText('位置 X') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('旋转 Y') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('缩放 Z') as HTMLInputElement).value).toBe('1');

    fireEvent.change(screen.getByLabelText('位置 X'), { target: { value: '3' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', position: [3, 0, 0] })]),
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('emits structured director patches for selected camera and shot prompt edits', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 主镜头' }));
    fireEvent.change(screen.getByLabelText('镜头提示词'), { target: { value: '低机位环绕主角' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', prompt: '低机位环绕主角' })]),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.change(screen.getByLabelText('镜头段提示词'), { target: { value: '镜头缓慢推进' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([expect.objectContaining({ id: 'shot-1', prompt: '镜头缓慢推进' })]),
      }),
    });
  });

  it('emits safe pose patches for selected director cameras', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择对象 主镜头' }));
    fireEvent.change(screen.getByLabelText('镜头位置 Z'), { target: { value: '7.5' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', position: [0, 2, 7.5] })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('注视目标 Y'), { target: { value: '1.4' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', target: [0, 1.4, 0] })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('焦距 mm'), { target: { value: '85' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', focalMm: 85 })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('焦距 mm'), { target: { value: 'nope' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', focalMm: 35 })]),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('emits safe timing and motion patches for selected director shots', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.change(screen.getByLabelText('镜头段时长（秒）'), { target: { value: '4.8' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([expect.objectContaining({ id: 'shot-1', durationMs: 4800 })]),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '环绕' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([expect.objectContaining({ id: 'shot-1', motion: 'orbit' })]),
      }),
    });

    fireEvent.change(screen.getByLabelText('镜头段时长（秒）'), { target: { value: '-2' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: expect.arrayContaining([expect.objectContaining({ id: 'shot-1', durationMs: 0 })]),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('reorders and deletes selected director shots while recalculating start times', () => {
    const onUpdateNodeData = vi.fn();
    const nodeWithThreeShots = {
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

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithThreeShots as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 2' }));
    fireEvent.click(screen.getByRole('button', { name: '镜头前移' }));

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: [
          expect.objectContaining({ id: 'shot-2', startMs: 0, durationMs: 5000 }),
          expect.objectContaining({ id: 'shot-1', startMs: 5000, durationMs: 3000 }),
          expect.objectContaining({ id: 'shot-3', startMs: 8000, durationMs: 2000 }),
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '镜头后移' }));
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: [
          expect.objectContaining({ id: 'shot-1', startMs: 0, durationMs: 3000 }),
          expect.objectContaining({ id: 'shot-3', startMs: 3000, durationMs: 2000 }),
          expect.objectContaining({ id: 'shot-2', startMs: 5000, durationMs: 5000 }),
        ],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '删除镜头段' }));
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: [
          expect.objectContaining({ id: 'shot-1', startMs: 0, durationMs: 3000 }),
          expect.objectContaining({ id: 'shot-3', startMs: 3000, durationMs: 2000 }),
        ],
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('recalculates following director shot start times when a shot duration changes', () => {
    const onUpdateNodeData = vi.fn();
    const nodeWithThreeShots = {
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

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithThreeShots as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.change(screen.getByLabelText('镜头段时长（秒）'), { target: { value: '4.5' } });

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('director-node', {
      director3d: expect.objectContaining({
        shots: [
          expect.objectContaining({ id: 'shot-1', startMs: 0, durationMs: 4500 }),
          expect.objectContaining({ id: 'shot-2', startMs: 4500, durationMs: 5000 }),
          expect.objectContaining({ id: 'shot-3', startMs: 9500, durationMs: 2000 }),
        ],
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('requests a safe downstream image node from the selected director shot', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    const nodeWithPromptedShot = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          cameras: [
            {
              ...directorNode.data.director3d.cameras[0],
              focalMm: 50,
              fov: 38,
              prompt: '低机位环绕主角',
            },
          ],
          shots: [
            {
              ...directorNode.data.director3d.shots[0],
              durationMs: 4200,
              motion: 'dolly',
              prompt: '镜头缓慢推进',
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithPromptedShot as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '合成到画布' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
      kind: 'image',
      position: { x: 420, y: 40 },
      data: expect.objectContaining({
        title: '镜头 1 生成图',
        generationPrompt: '镜头缓慢推进',
        generationMode: 'standard',
        params: expect.objectContaining({
          director3d: expect.objectContaining({
            sourceDirectorNodeId: 'director-node',
            cameraId: 'camera-1',
            shotId: 'shot-1',
            motion: 'dolly',
            durationMs: 4200,
            camera: expect.objectContaining({
              focalMm: 50,
              fov: 38,
              name: '主镜头',
              position: [0, 2, 6],
              target: [0, 1, 0],
            }),
          }),
        }),
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
  });

  it('requests storyboard sync from the selected director shot', () => {
    const onSyncDirectorShotToStoryboard = vi.fn();
    const nodeWithPromptedShot = {
      ...directorNode,
      data: {
        ...directorNode.data,
        director3d: {
          ...directorNode.data.director3d,
          cameras: [
            {
              ...directorNode.data.director3d.cameras[0],
              prompt: '低机位环绕主角',
            },
          ],
          shots: [
            {
              ...directorNode.data.director3d.shots[0],
              prompt: '镜头缓慢推进',
            },
          ],
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="director3d"
        node={nodeWithPromptedShot as any}
        onClose={vi.fn()}
        onSyncDirectorShotToStoryboard={onSyncDirectorShotToStoryboard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
    fireEvent.click(screen.getByRole('button', { name: '同步到故事板' }));

    expect(onSyncDirectorShotToStoryboard).toHaveBeenCalledWith({
      camera: expect.objectContaining({ id: 'camera-1', prompt: '低机位环绕主角' }),
      shot: expect.objectContaining({ id: 'shot-1', prompt: '镜头缓慢推进' }),
      shotIndex: 0,
      sourceDirectorNodeId: 'director-node',
      sourceDirectorNodePosition: { x: 0, y: 0 },
    });
    expect(JSON.stringify(onSyncDirectorShotToStoryboard.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
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

  it('binds a selected storyboard cell to a library image asset id', async () => {
    listAssetsMock.mockResolvedValueOnce({
      items: [{ id: 'asset-image-2', kind: 'image', title: '替换分镜图' }],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
        includePreviewUrls: false,
        kind: 'image',
        page: 1,
        pageSize: 6,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: '绑定素材 asset-image-2' }));

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('storyboard-node', {
      storyboard: expect.objectContaining({
        cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-2', assetId: 'asset-image-2' })]),
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('requests an image node from the selected storyboard cell', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '生成选中镜头' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
      kind: 'image',
      position: { x: 420, y: 40 },
      data: expect.objectContaining({
        title: '镜头 2 · 近景',
        generationMode: 'standard',
        generationPrompt: '角色回头',
        params: expect.objectContaining({
          storyboard: expect.objectContaining({
            cellId: 'cell-2',
            shotNo: 2,
            sourceStoryboardNodeId: 'storyboard-node',
          }),
        }),
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
  });

  it('requests image nodes for all prompted storyboard cells', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '生成全部镜头' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledTimes(2);
    expect(onCreateCanvasNodeFromStudio).toHaveBeenNthCalledWith(1, {
      kind: 'image',
      position: { x: 420, y: 40 },
      data: expect.objectContaining({
        title: '镜头 1 · 开场',
        generationPrompt: '城市远景',
      }),
    });
    expect(onCreateCanvasNodeFromStudio).toHaveBeenNthCalledWith(2, {
      kind: 'image',
      position: { x: 420, y: 360 },
      data: expect.objectContaining({
        title: '镜头 2 · 近景',
        generationPrompt: '角色回头',
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('requests a storyboard sheet image node from asset-backed cells', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '合成故事板图' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
      kind: 'image',
      position: { x: 420, y: 40 },
      data: expect.objectContaining({
        title: '故事板合成图',
        generationMode: 'standard',
        generationPrompt: expect.stringContaining('将以下分镜合成为一张故事板排版图'),
        params: expect.objectContaining({
          storyboardSheet: expect.objectContaining({
            sourceStoryboardNodeId: 'storyboard-node',
            aspect: '16:9',
            grid: '3x2',
            cells: [
              expect.objectContaining({
                assetId: 'asset-1',
                cellId: 'cell-1',
                prompt: '城市远景',
                shotNo: 1,
                title: '开场',
              }),
            ],
          }),
        }),
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
  });

  it('requests video editor sync from storyboard asset cells', () => {
    const onSyncStoryboardToVideoEditor = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onSyncStoryboardToVideoEditor={onSyncStoryboardToVideoEditor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '同步到剪辑工程' }));

    expect(onSyncStoryboardToVideoEditor).toHaveBeenCalledWith({
      sourceStoryboardNodeId: 'storyboard-node',
      sourceStoryboardNodePosition: { x: 0, y: 0 },
      storyboard: expect.objectContaining({
        cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-1', assetId: 'asset-1' })]),
      }),
    });
    expect(JSON.stringify(onSyncStoryboardToVideoEditor.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
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

  it('emits safe video editor patches for clips, subtitles, and duration edits', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加图片片段' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({ id: 'clip-2', assetId: 'placeholder-image-2', kind: 'image' }),
          ]),
        }),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '添加视频片段' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({ id: 'clip-2', assetId: 'placeholder-video-2', kind: 'video' }),
          ]),
        }),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '添加字幕' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          subtitles: expect.arrayContaining([
            expect.objectContaining({ id: 'subtitle-2', text: '字幕 2' }),
          ]),
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('工程时长（秒）'), { target: { value: '12.5' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({ durationMs: 12500 }),
      }),
    });

    const latestPatch = onUpdateNodeData.mock.calls.at(-1)?.[1];
    expect(JSON.stringify(latestPatch)).not.toMatch(/blob:|data:/);
  });

  it('emits safe video editor patches for selected clip timing and deletion', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));

    fireEvent.change(screen.getByLabelText('片段开始（秒）'), { target: { value: '1.5' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', startMs: 1500 })]),
          durationMs: 4500,
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('片段时长（秒）'), { target: { value: '4.2' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', outMs: 4200 })]),
          durationMs: 4200,
        }),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '删除片段' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: [],
          durationMs: 1200,
        }),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('emits safe video editor patches for selected video clip audio settings', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '片段静音' }));
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', muted: true })]),
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('片段音量'), { target: { value: '0.65' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', volume: 0.65 })]),
        }),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('binds a selected video clip to a library asset id', async () => {
    listAssetsMock.mockResolvedValueOnce({
      items: [{ id: 'asset-video-2', kind: 'video', title: '替换视频' }],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
        includePreviewUrls: false,
        kind: 'video',
        page: 1,
        pageSize: 6,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: '绑定素材 asset-video-2' }));

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', assetId: 'asset-video-2' })]),
        }),
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('emits safe video editor patches for selected subtitle editing and deletion', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择字幕 sub-1' }));

    fireEvent.change(screen.getByLabelText('字幕文本'), { target: { value: '新的字幕文本' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          subtitles: expect.arrayContaining([expect.objectContaining({ id: 'sub-1', text: '新的字幕文本' })]),
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('字幕开始（秒）'), { target: { value: '1.1' } });
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          durationMs: 3000,
          subtitles: expect.arrayContaining([expect.objectContaining({ id: 'sub-1', startMs: 1100, endMs: 2300 })]),
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('字幕结束（秒）'), { target: { value: '0.4' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          durationMs: 3000,
          subtitles: expect.arrayContaining([expect.objectContaining({ id: 'sub-1', startMs: 0, endMs: 400 })]),
        }),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '删除字幕' }));
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          durationMs: 3000,
          subtitles: [],
        }),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('emits safe video editor patches for audio track adding and selected audio edits', () => {
    const onUpdateNodeData = vi.fn();
    const { rerender } = render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加音频' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([
            expect.objectContaining({
              assetId: 'placeholder-audio-1',
              id: 'audio-1',
              inMs: 0,
              outMs: 3000,
              startMs: 0,
              track: 1,
              volume: 1,
            }),
          ]),
          durationMs: 3000,
        }),
      }),
    });

    const videoNodeWithAudio = {
      ...videoNode,
      data: {
        ...videoNode.data,
        videoEditor: {
          ...videoNode.data.videoEditor,
          timeline: {
            ...videoNode.data.videoEditor.timeline,
            audio: [{ id: 'audio-1', assetId: 'placeholder-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 3000, volume: 1 }],
          },
        },
      },
    };
    rerender(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNodeWithAudio as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择音频 audio-1' }));
    fireEvent.change(screen.getByLabelText('音频开始（秒）'), { target: { value: '1.2' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([expect.objectContaining({ id: 'audio-1', startMs: 1200 })]),
          durationMs: 4200,
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('音频时长（秒）'), { target: { value: '2.4' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([expect.objectContaining({ id: 'audio-1', outMs: 2400 })]),
          durationMs: 3000,
        }),
      }),
    });

    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '0.35' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([expect.objectContaining({ id: 'audio-1', volume: 0.35 })]),
        }),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('binds a selected audio track to a library asset id', async () => {
    listAssetsMock.mockResolvedValueOnce({
      items: [{ id: 'asset-audio-2', kind: 'audio', title: '替换配乐' }],
      page: 1,
      pageSize: 6,
      total: 1,
    });
    const onUpdateNodeData = vi.fn();
    const videoNodeWithAudio = {
      ...videoNode,
      data: {
        ...videoNode.data,
        videoEditor: {
          ...videoNode.data.videoEditor,
          timeline: {
            ...videoNode.data.videoEditor.timeline,
            audio: [{ id: 'audio-1', assetId: 'placeholder-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 3000, volume: 1 }],
          },
        },
      },
    };

    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNodeWithAudio as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择音频 audio-1' }));

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
        includePreviewUrls: false,
        kind: 'audio',
        page: 1,
        pageSize: 6,
      }));
    });
    fireEvent.click(await screen.findByRole('button', { name: '绑定素材 asset-audio-2' }));

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([expect.objectContaining({ id: 'audio-1', assetId: 'asset-audio-2' })]),
        }),
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('emits safe video editor patches for selected clip transition settings', () => {
    const onUpdateNodeData = vi.fn();
    const { rerender } = render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
    fireEvent.click(screen.getByRole('button', { name: '淡入淡出' }));
    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: 'clip-1',
              transitionOut: { durationMs: 500, type: 'fade' },
            }),
          ]),
        }),
      }),
    });

    const videoNodeWithTransition = {
      ...videoNode,
      data: {
        ...videoNode.data,
        videoEditor: {
          ...videoNode.data.videoEditor,
          timeline: {
            ...videoNode.data.videoEditor.timeline,
            clips: [
              {
                ...videoNode.data.videoEditor.timeline.clips[0],
                transitionOut: { durationMs: 500, type: 'fade' },
              },
            ],
          },
        },
      },
    };
    rerender(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNodeWithTransition as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.change(screen.getByLabelText('转场时长（秒）'), { target: { value: '1.2' } });
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.objectContaining({
              id: 'clip-1',
              transitionOut: { durationMs: 1200, type: 'fade' },
            }),
          ]),
        }),
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: '无转场' }));
    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([
            expect.not.objectContaining({
              transitionOut: expect.anything(),
            }),
          ]),
        }),
      }),
    });

    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
  });

  it('exports a safe video node request from the video editor timeline', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导出到画布' }));

    expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
      kind: 'video',
      position: { x: 420, y: 40 },
      runAfterCreate: true,
      data: expect.objectContaining({
        durationMs: 3000,
        generationPrompt: '根据剪辑工程时间线生成视频',
        routeKey: 'video.editor.ffmpeg',
        params: {
          videoEditor: expect.objectContaining({
            sourceVideoEditorNodeId: 'video-node',
            timeline: expect.objectContaining({
              clips: [
                expect.objectContaining({
                  assetId: 'asset-video-1',
                  id: 'clip-1',
                }),
              ],
            }),
          }),
        },
        title: '剪辑工程导出',
      }),
    });
    expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
  });
});
