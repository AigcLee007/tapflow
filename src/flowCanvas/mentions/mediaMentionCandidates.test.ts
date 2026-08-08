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

  it('filters unsupported kinds before de-duplicating a connected source', () => {
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

    expect(result.map((item) => item.mediaKind)).toEqual(['image']);
    expect(result).toHaveLength(1);
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
});
