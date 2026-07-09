import { describe, expect, it } from 'vitest';

import type { FlowDirector3dData, FlowVideoEditorData } from '../types';
import { buildVideoEditorFromDirectorShots } from './directorVideoSync';

const director: FlowDirector3dData = {
  version: 1,
  scene: { backgroundAssetId: 'asset-bg', gridVisible: true, units: 'meters' },
  actors: [],
  cameras: [
    { id: 'camera-1', name: '主镜头', position: [0, 2, 6], target: [0, 1, 0] },
  ],
  shots: [
    {
      id: 'shot-1',
      cameraId: 'camera-1',
      startMs: 0,
      durationMs: 4200,
      motion: 'dolly',
      prompt: '镜头缓慢推进',
      generatedAssetId: 'asset-director-1',
    },
    {
      id: 'shot-2',
      cameraId: 'camera-1',
      startMs: 4200,
      durationMs: 2600,
      motion: 'orbit',
      generatedAssetId: 'https://signed.example.com/not-an-asset.png',
    },
    {
      id: 'shot-3',
      cameraId: 'camera-1',
      startMs: 6800,
      durationMs: 3000,
      motion: 'pan',
      generatedAssetId: 'asset-director-3',
    },
  ],
};

const videoEditor: FlowVideoEditorData = {
  version: 1,
  aspect: '16:9',
  resolution: '1920x1080',
  timeline: {
    audio: [{ id: 'audio-1', assetId: 'asset-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 9000, volume: 1 }],
    clips: [
      { id: 'clip-existing', assetId: 'asset-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
      {
        id: 'director-director-node-old',
        assetId: 'asset-old',
        kind: 'image',
        track: 1,
        startMs: 3000,
        inMs: 0,
        outMs: 3000,
        speed: 1,
        sourceDirectorNodeId: 'director-node',
        directorShotId: 'old-shot',
      },
    ],
    durationMs: 6000,
    subtitles: [
      { id: 'subtitle-1', text: '原有字幕', startMs: 0, endMs: 1200 },
      {
        id: 'director-subtitle-director-node-old',
        text: '旧导演字幕',
        startMs: 3000,
        endMs: 6000,
        sourceDirectorNodeId: 'director-node',
        directorShotId: 'old-shot',
      },
    ],
  },
};

describe('directorVideoSync', () => {
  it('builds image clips from director shots that already have generated assets', () => {
    const next = buildVideoEditorFromDirectorShots({
      director,
      sourceDirectorNodeId: 'director-node',
      videoEditor,
    });

    expect(next.timeline.clips).toEqual([
      expect.objectContaining({ id: 'clip-existing', assetId: 'asset-video-1', kind: 'video', startMs: 0 }),
      expect.objectContaining({
        id: 'director-director-node-shot-1',
        assetId: 'asset-director-1',
        directorShotId: 'shot-1',
        directorShotMotion: 'dolly',
        kind: 'image',
        sourceDirectorNodeId: 'director-node',
        startMs: 3000,
        outMs: 4200,
      }),
      expect.objectContaining({
        id: 'director-director-node-shot-3',
        assetId: 'asset-director-3',
        directorShotId: 'shot-3',
        directorShotMotion: 'pan',
        startMs: 7200,
        outMs: 3000,
      }),
    ]);
    expect(next.timeline.subtitles).toEqual([
      videoEditor.timeline.subtitles[0],
      expect.objectContaining({
        id: 'director-subtitle-director-node-shot-1',
        directorShotId: 'shot-1',
        endMs: 7200,
        sourceDirectorNodeId: 'director-node',
        startMs: 3000,
        text: '镜头缓慢推进',
      }),
      expect.objectContaining({
        id: 'director-subtitle-director-node-shot-3',
        directorShotId: 'shot-3',
        endMs: 10200,
        startMs: 7200,
        text: '镜头 3',
      }),
    ]);
    expect(next.timeline.durationMs).toBe(10200);
    expect(JSON.stringify(next)).not.toMatch(/blob:|data:|https?:\/\//);
  });
});
