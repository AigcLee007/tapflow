import { describe, expect, it } from 'vitest';

import type { FlowStoryboardData, FlowVideoEditorData } from '../types';
import { buildVideoEditorFromStoryboardAssets } from './storyboardVideoSync';

const storyboard: FlowStoryboardData = {
  aspect: '16:9',
  grid: '3x2',
  selectedIndex: 0,
  cells: [
    { id: 'cell-1', shotNo: 1, title: '开场', assetId: 'asset-image-1', prompt: '城市远景' },
    { id: 'cell-2', shotNo: 2, title: '近景', assetId: 'asset-image-2' },
    { id: 'cell-3', shotNo: 3, title: '空镜', prompt: '还没生成' },
  ],
};

const videoEditor: FlowVideoEditorData = {
  version: 1,
  aspect: '16:9',
  resolution: '1920x1080',
  timeline: {
    audio: [{ id: 'audio-1', assetId: 'asset-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 9000, volume: 0.8 }],
    clips: [
      { id: 'clip-existing', assetId: 'asset-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
    ],
    durationMs: 3000,
    subtitles: [{ id: 'subtitle-1', text: '第一句', startMs: 0, endMs: 1400 }],
  },
};

describe('storyboardVideoSync', () => {
  it('appends asset-backed storyboard cells as image clips after existing clips', () => {
    const next = buildVideoEditorFromStoryboardAssets({
      sourceStoryboardNodeId: 'storyboard-node',
      storyboard,
      videoEditor,
    });

    expect(next).toMatchObject({
      aspect: '16:9',
      resolution: '1920x1080',
      timeline: {
        audio: videoEditor.timeline.audio,
      },
    });
    expect(next.timeline.clips).toEqual([
      expect.objectContaining({ id: 'clip-existing', assetId: 'asset-video-1', kind: 'video', startMs: 0 }),
      expect.objectContaining({
        id: 'storyboard-storyboard-node-cell-1',
        assetId: 'asset-image-1',
        kind: 'image',
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-1',
        storyboardShotNo: 1,
        storyboardTitle: '开场',
        track: 1,
        startMs: 3000,
        inMs: 0,
        outMs: 3000,
        speed: 1,
      }),
      expect.objectContaining({
        id: 'storyboard-storyboard-node-cell-2',
        assetId: 'asset-image-2',
        kind: 'image',
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-2',
        storyboardShotNo: 2,
        storyboardTitle: '近景',
        startMs: 6000,
      }),
    ]);
    expect(next.timeline.durationMs).toBe(9000);
    expect(JSON.stringify(next)).not.toMatch(/blob:|data:/);
  });

  it('creates storyboard subtitles aligned to synced image clips', () => {
    const next = buildVideoEditorFromStoryboardAssets({
      sourceStoryboardNodeId: 'storyboard-node',
      storyboard,
      videoEditor,
    });

    expect(next.timeline.subtitles).toEqual([
      videoEditor.timeline.subtitles[0],
      {
        id: 'storyboard-subtitle-storyboard-node-cell-1',
        text: storyboard.cells[0].title,
        startMs: 3000,
        endMs: 6000,
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-1',
        storyboardShotNo: 1,
      },
      {
        id: 'storyboard-subtitle-storyboard-node-cell-2',
        text: storyboard.cells[1].title,
        startMs: 6000,
        endMs: 9000,
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-2',
        storyboardShotNo: 2,
      },
    ]);
    expect(JSON.stringify(next.timeline.subtitles)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('replaces previous clips from the same storyboard instead of duplicating them', () => {
    const first = buildVideoEditorFromStoryboardAssets({
      sourceStoryboardNodeId: 'storyboard-node',
      storyboard,
      videoEditor,
    });
    const second = buildVideoEditorFromStoryboardAssets({
      sourceStoryboardNodeId: 'storyboard-node',
      storyboard: {
        ...storyboard,
        cells: [
          { id: 'cell-1', shotNo: 1, title: '开场更新', assetId: 'asset-image-3' },
          { id: 'cell-2', shotNo: 2 },
        ],
      },
      videoEditor: first,
    });

    expect(second.timeline.clips).toHaveLength(2);
    expect(second.timeline.clips[0]).toMatchObject({ id: 'clip-existing', assetId: 'asset-video-1' });
    expect(second.timeline.clips[1]).toMatchObject({
      id: 'storyboard-storyboard-node-cell-1',
      assetId: 'asset-image-3',
      storyboardTitle: '开场更新',
      startMs: 3000,
    });
    expect(second.timeline.subtitles).toEqual([
      videoEditor.timeline.subtitles[0],
      expect.objectContaining({
        id: 'storyboard-subtitle-storyboard-node-cell-1',
        sourceStoryboardNodeId: 'storyboard-node',
        storyboardCellId: 'cell-1',
        startMs: 3000,
        endMs: 6000,
      }),
    ]);
    expect(JSON.stringify(second)).not.toMatch(/blob:|data:/);
  });
});
