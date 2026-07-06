import { describe, expect, it } from 'vitest';

import { normalizeVideoEditorData } from './videoEditorNodeData';

describe('videoEditorNodeData', () => {
  it('normalizes timeline media to asset-backed structured fields', () => {
    const data = normalizeVideoEditorData({
      aspect: '9:16',
      exportedAssetId: ' exported-video ',
      previewUrl: 'blob:editor-preview',
      resolution: '720x1280',
      timeline: {
        durationMs: 1000,
        clips: [
          {
            id: ' clip-1 ',
            assetId: ' asset-video-1 ',
            kind: 'video',
            track: 2.8,
            startMs: 500,
            inMs: 100,
            outMs: 2600,
            speed: 1.25,
            muted: true,
            volume: 3,
            previewUrl: 'blob:clip-preview',
            downloadUrl: 'https://signed.example/clip.mp4',
            transitionOut: {
              type: 'fade',
              durationMs: 450.7,
              previewUrl: 'data:transition',
            },
            transform: {
              scale: 1.2,
              x: -10,
              y: 12,
              rotate: 4,
              unsafeUrl: 'blob:transform',
            },
            sourceStoryboardNodeId: ' storyboard-node ',
            storyboardCellId: ' cell-1 ',
            storyboardShotNo: 2.8,
            storyboardTitle: ' 开场 ',
            storyboardPrompt: ' 建立空间 ',
          },
        ],
        audio: [
          {
            id: ' audio-1 ',
            assetId: ' asset-audio-1 ',
            track: 1,
            startMs: 0,
            inMs: 0,
            outMs: 3000,
            volume: -1,
            waveformUrl: 'data:waveform',
          },
        ],
        subtitles: [
          {
            id: ' subtitle-1 ',
            text: ' 第一行字幕 ',
            startMs: 100,
            endMs: 2200,
            previewUrl: 'blob:subtitle',
            style: {
              color: '#ffffff',
              backgroundImage: 'url(data:image/png;base64,aaa)',
              fontSize: 24,
            },
            sourceStoryboardNodeId: ' storyboard-node ',
            storyboardCellId: ' cell-1 ',
            storyboardShotNo: 2.2,
          },
        ],
      },
    } as any);

    expect(data).toEqual({
      version: 1,
      aspect: '9:16',
      exportedAssetId: 'exported-video',
      resolution: '720x1280',
      timeline: {
        durationMs: 3000,
        clips: [
          {
            id: 'clip-1',
            assetId: 'asset-video-1',
            kind: 'video',
            track: 2,
            startMs: 500,
            inMs: 100,
            outMs: 2600,
            speed: 1.25,
            muted: true,
            volume: 2,
            transitionOut: { type: 'fade', durationMs: 451 },
            transform: { scale: 1.2, x: -10, y: 12, rotate: 4 },
            sourceStoryboardNodeId: 'storyboard-node',
            storyboardCellId: 'cell-1',
            storyboardShotNo: 2,
            storyboardTitle: '开场',
            storyboardPrompt: '建立空间',
          },
        ],
        audio: [
          {
            id: 'audio-1',
            assetId: 'asset-audio-1',
            track: 1,
            startMs: 0,
            inMs: 0,
            outMs: 3000,
            volume: 0,
          },
        ],
        subtitles: [
          {
            id: 'subtitle-1',
            text: '第一行字幕',
            startMs: 100,
            endMs: 2200,
            style: { color: '#ffffff', fontSize: 24 },
            sourceStoryboardNodeId: 'storyboard-node',
            storyboardCellId: 'cell-1',
            storyboardShotNo: 2,
          },
        ],
      },
    });
    expect(JSON.stringify(data)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('falls back to a safe empty video editor document', () => {
    expect(normalizeVideoEditorData(null as any)).toEqual({
      version: 1,
      aspect: '16:9',
      resolution: '1920x1080',
      timeline: {
        audio: [],
        clips: [],
        durationMs: 0,
        subtitles: [],
      },
    });
  });

  it('preserves square video editor output settings supported by the ffmpeg route', () => {
    const data = normalizeVideoEditorData({
      aspect: '1:1',
      resolution: '1080x1080',
      timeline: {
        audio: [],
        clips: [],
        durationMs: 0,
        subtitles: [],
      },
    });

    expect(data.aspect).toBe('1:1');
    expect(data.resolution).toBe('1080x1080');
  });
});
