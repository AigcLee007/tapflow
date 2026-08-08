import { describe, expect, it } from 'vitest';
import { buildMediaMentionCandidates } from './mediaMentionCandidates';

describe('buildMediaMentionCandidates', () => {
  it('orders connected, canvas, recent assets, then library assets and excludes text', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(['image', 'video']),
      connected: [
        { inputKey: 'upstream:image', kind: 'image', sourceNodeId: 'connected-image', title: 'Connected image' },
        { inputKey: 'upstream:text', kind: 'text', sourceNodeId: 'connected-text', title: 'Connected text' },
        { inputKey: 'upstream:video', kind: 'video', sourceNodeId: 'connected-video', title: 'Connected video' },
      ],
      canvas: [
        { kind: 'image', nodeId: 'canvas-image', title: 'Canvas image' },
        { kind: 'text', nodeId: 'canvas-text', title: 'Canvas text' },
        { kind: 'video', nodeId: 'canvas-video', title: 'Canvas video' },
      ],
      assets: [
        { assetId: 'asset-image', kind: 'image', title: 'Library image' },
        { assetId: 'asset-video', kind: 'video', title: 'Recent video' },
      ],
      currentNodeId: 'target',
      recentAssetIds: ['asset-video'],
    });

    expect(result.map((item) => item.candidateKey)).toEqual([
      'connected:upstream:image',
      'connected:upstream:video',
      'canvas:canvas-image',
      'canvas:canvas-video',
      'asset:asset-video',
      'asset:asset-image',
    ]);
    expect(result.some((item) => item.mediaKind === ('text' as never))).toBe(false);
  });

  it('keeps unsupported connected kinds selectable before de-duplicating a source', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(['image']),
      connected: [
        { inputKey: 'upstream:video', kind: 'video', sourceNodeId: 'same-node', title: 'Video' },
        { inputKey: 'upstream:image', kind: 'image', sourceNodeId: 'same-node', title: 'Image' },
      ],
      canvas: [
        { kind: 'image', nodeId: 'same-node', title: 'Duplicate image node' },
        { kind: 'image', nodeId: 'same-node', title: 'Connected image node' },
      ],
      assets: [],
      currentNodeId: 'target',
      recentAssetIds: [],
    });

    expect(result.map((item) => item.mediaKind)).toEqual(['video', 'image']);
    expect(result).toHaveLength(2);
  });

  it('keeps connected media selectable while new sources remain visible but disabled', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(),
      disabledReasons: { image: '正在加载模型能力', video: '正在加载模型能力', audio: '正在加载模型能力' },
      connected: [
        { inputKey: 'upstream:video', kind: 'video', sourceNodeId: 'connected-video', title: 'Connected video' },
      ],
      canvas: [
        { kind: 'image', nodeId: 'canvas-image', title: 'Canvas image' },
        { kind: 'video', nodeId: 'canvas-video', title: 'Canvas video' },
      ],
      assets: [
        { assetId: 'asset-audio', kind: 'audio', title: 'Library audio' },
        { assetId: 'asset-text', kind: 'text', title: 'Library text' },
      ],
      currentNodeId: 'target',
      recentAssetIds: [],
    });

    expect(result.map((candidate) => [candidate.candidateKey, candidate.disabledReason])).toEqual([
      ['connected:upstream:video', undefined],
      ['canvas:canvas-image', '正在加载模型能力'],
      ['canvas:canvas-video', '正在加载模型能力'],
      ['asset:asset-audio', '正在加载模型能力'],
    ]);
  });

  it('disables only unsupported new media kinds while retaining allowed candidates', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(['video']),
      disabledReasons: { image: '当前模式不支持图片输入', audio: '当前模式不支持音频输入' },
      connected: [],
      canvas: [
        { kind: 'image', nodeId: 'canvas-image', title: 'Canvas image' },
        { kind: 'video', nodeId: 'canvas-video', title: 'Canvas video' },
      ],
      assets: [],
      currentNodeId: 'target',
      recentAssetIds: [],
    });

    expect(result.map((candidate) => [candidate.candidateKey, candidate.disabledReason])).toEqual([
      ['canvas:canvas-image', '当前模式不支持图片输入'],
      ['canvas:canvas-video', undefined],
    ]);
  });

  it('removes duplicate node and asset sources and never returns self or malformed ids', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(['image', 'video', 'audio']),
      connected: [
        { inputKey: 'upstream:source', kind: 'image', sourceNodeId: 'source', assetId: 'asset-a', title: 'Source' },
        { inputKey: '', kind: 'video', sourceNodeId: 'bad', title: 'Bad input' },
      ],
      canvas: [
        { kind: 'image', nodeId: 'source', title: 'Connected source' },
        { kind: 'image', nodeId: 'target', title: 'Self' },
        { kind: 'video', nodeId: '', title: 'Malformed' },
        { kind: 'video', nodeId: 'other', title: 'Other' },
      ],
      assets: [
        { assetId: 'asset-a', kind: 'image', title: 'Connected asset' },
        { assetId: '', kind: 'audio', title: 'Malformed asset' },
        { assetId: 'asset-b', kind: 'audio', title: 'Audio asset' },
        { assetId: 'asset-b', kind: 'audio', title: 'Duplicate asset' },
      ],
      currentNodeId: 'target',
      recentAssetIds: ['asset-b'],
    });

    expect(result.map((item) => item.candidateKey)).toEqual([
      'connected:upstream:source',
      'canvas:other',
      'asset:asset-b',
    ]);
  });

  it('does not offer a connected self source', () => {
    const result = buildMediaMentionCandidates({
      allowedKinds: new Set(['image']),
      connected: [
        { inputKey: 'upstream:self', kind: 'image', sourceNodeId: 'target', title: 'Self output' },
        { inputKey: 'upstream:other', kind: 'image', sourceNodeId: 'other', title: 'Other output' },
      ],
      canvas: [],
      assets: [],
      currentNodeId: 'target',
      recentAssetIds: [],
    });

    expect(result.map((candidate) => candidate.candidateKey)).toEqual(['connected:upstream:other']);
  });
});
