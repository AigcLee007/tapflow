import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionStudioShell } from './ProductionStudioShell';

const listAssetsMock = vi.hoisted(() => vi.fn());
const storyAiDirectorDeskMock = vi.hoisted(() => vi.fn());

vi.mock('../../assets/assetApi', () => ({
  listAssets: (...args: unknown[]) => listAssetsMock(...args),
}));

vi.mock('./StoryAiDirectorDesk', () => ({
  StoryAiDirectorDesk: (props: any) => {
    storyAiDirectorDeskMock(props);
    return (
      <div data-testid="mock-storyai-director-desk">
        <button type="button" onClick={props.onClose}>
          close storyai
        </button>
        <button
          type="button"
          onClick={() => props.onUpdateNodeData?.(props.nodeId, { director3d: props.data })}
        >
          emit storyai patch
        </button>
      </div>
    );
  },
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
    storyAiDirectorDeskMock.mockClear();
  });

  it('renders the StoryAI director desk branch with TapFlow node data', () => {
    render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={vi.fn()} />);

    expect(screen.getByTestId('mock-storyai-director-desk')).toBeTruthy();
    expect(storyAiDirectorDeskMock).toHaveBeenCalledWith(expect.objectContaining({
      data: directorNode.data.director3d,
      nodeId: 'director-node',
      onClose: expect.any(Function),
      onUpdateNodeData: undefined,
    }));
  });

  it('lets the StoryAI director desk own the visible chrome instead of wrapping it in the generic studio header', () => {
    render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={vi.fn()} />);

    expect(screen.queryByText('director-node')).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭工作台' })).toBeNull();
    expect(screen.getByTestId('mock-storyai-director-desk')).toBeTruthy();
  });

  it('passes StoryAI director close events through the studio shell', () => {
    const onClose = vi.fn();
    render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'close storyai' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes StoryAI director data patches back to the selected node', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="director3d"
        node={directorNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'emit storyai patch' }));

    expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
      director3d: directorNode.data.director3d,
    });
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

  it('binds a dropped asset id to the target storyboard cell without storing preview URLs', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={storyboardNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    const dataTransfer = {
      dropEffect: '',
      getData: vi.fn((type: string) => {
        if (type === 'application/x-tapflow-asset-id') return 'asset-image-drop';
        if (type === 'text/plain') return 'https://signed.example.com/preview.png';
        return '';
      }),
      types: ['application/x-tapflow-asset-id', 'text/plain'],
    } as unknown as DataTransfer;

    const firstShotCell = screen.getByRole('button', { name: /1$/ });
    fireEvent.dragOver(firstShotCell, { dataTransfer });
    fireEvent.drop(firstShotCell, { dataTransfer });

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('storyboard-node', {
      storyboard: expect.objectContaining({
        selectedIndex: 0,
        cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-1', assetId: 'asset-image-drop' })]),
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
      runAfterCreate: true,
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
      runAfterCreate: true,
      data: expect.objectContaining({
        title: '镜头 1 · 开场',
        generationPrompt: '城市远景',
      }),
    });
    expect(onCreateCanvasNodeFromStudio).toHaveBeenNthCalledWith(2, {
      kind: 'image',
      position: { x: 420, y: 360 },
      runAfterCreate: true,
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
      runAfterCreate: true,
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

  it('shows the latest composed storyboard asset id in the storyboard inspector', () => {
    render(
      <ProductionStudioShell
        studio="storyboard"
        node={{
          ...storyboardNode,
          data: {
            ...storyboardNode.data,
            storyboard: {
              ...storyboardNode.data.storyboard,
              composedAssetId: 'asset-storyboard-sheet',
            },
          },
        } as any}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('合成资产')).toBeTruthy();
    expect(screen.getByText('asset-storyboard-sheet')).toBeTruthy();
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

  it('updates video editor output presets including square 1080p', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择输出规格 1:1 1080p' }));

    expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        aspect: '1:1',
        resolution: '1080x1080',
      }),
    });
    expect(JSON.stringify(onUpdateNodeData.mock.calls)).not.toMatch(/blob:|data:/);
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

  it('binds a dropped asset id to the target video clip without storing preview URLs', () => {
    const onUpdateNodeData = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={videoNode as any}
        onClose={vi.fn()}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    const dataTransfer = {
      dropEffect: '',
      getData: vi.fn((type: string) => {
        if (type === 'application/x-tapflow-asset-id') return 'asset-video-drop';
        if (type === 'text/plain') return 'https://signed.example.com/video-preview.mp4';
        return '';
      }),
      types: ['application/x-tapflow-asset-id', 'text/plain'],
    } as unknown as DataTransfer;

    const clipButton = screen.getByRole('button', { name: /clip-1$/ });
    fireEvent.dragOver(clipButton, { dataTransfer });
    fireEvent.drop(clipButton, { dataTransfer });

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', assetId: 'asset-video-drop' })]),
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

  it('binds a dropped asset id to the target audio track without storing preview URLs', () => {
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

    const dataTransfer = {
      dropEffect: '',
      getData: vi.fn((type: string) => {
        if (type === 'application/x-tapflow-asset-id') return 'asset-audio-drop';
        if (type === 'text/plain') return 'https://signed.example.com/audio-preview.mp3';
        return '';
      }),
      types: ['application/x-tapflow-asset-id', 'text/plain'],
    } as unknown as DataTransfer;

    const audioButton = screen.getByRole('button', { name: /audio-1$/ });
    fireEvent.dragOver(audioButton, { dataTransfer });
    fireEvent.drop(audioButton, { dataTransfer });

    expect(onUpdateNodeData).toHaveBeenLastCalledWith('video-node', {
      videoEditor: expect.objectContaining({
        timeline: expect.objectContaining({
          audio: expect.arrayContaining([expect.objectContaining({ id: 'audio-1', assetId: 'asset-audio-drop' })]),
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

  it('blocks video editor export until placeholder timeline assets are bound', () => {
    const onCreateCanvasNodeFromStudio = vi.fn();
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={{
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
                    assetId: 'placeholder-video-1',
                  },
                ],
              },
            },
          },
        } as any}
        onClose={vi.fn()}
        onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
      />,
    );

    const exportButton = screen.getByRole('button', { name: '导出到画布' }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(screen.getByText('请先绑定素材库资产')).toBeTruthy();

    fireEvent.click(exportButton);
    expect(onCreateCanvasNodeFromStudio).not.toHaveBeenCalled();
  });

  it('shows the latest exported video asset id in the video editor inspector', () => {
    render(
      <ProductionStudioShell
        studio="video_editor"
        node={{
          ...videoNode,
          data: {
            ...videoNode.data,
            videoEditor: {
              ...videoNode.data.videoEditor,
              exportedAssetId: 'asset-exported-video',
            },
          },
        } as any}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('导出资产')).toBeTruthy();
    expect(screen.getByText('asset-exported-video')).toBeTruthy();
  });
});
