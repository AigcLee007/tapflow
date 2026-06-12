import { describe, expect, it } from 'vitest';

import { buildAssetBackedNodeData, buildMeasuredAssetNodePatch } from './assetNodeData';

describe('buildAssetBackedNodeData', () => {
  it('persists preview urls as referenceable image fields when provided', () => {
    const nodeData = buildAssetBackedNodeData(
      {
        durationMs: null,
        height: 1200,
        id: 'asset-1',
        mimeType: 'image/png',
        originalFilename: 'asset.png',
        previewUrl: 'https://cdn.test/asset-preview.png',
        source: 'asset-library',
        title: 'Asset 1',
        width: 1600,
      },
      {
        previewUrl: 'https://cdn.test/asset-preview.png',
      },
    );

    expect(nodeData.thumbnailUrl).toBe('https://cdn.test/asset-preview.png');
    expect(nodeData.originalImageUrl).toBe('https://cdn.test/asset-preview.png');
  });

  it('prefers explicit natural dimensions so canvas insertion can recover old assets with wrong stored ratios', () => {
    const nodeData = buildAssetBackedNodeData(
      {
        durationMs: null,
        height: 1024,
        id: 'asset-portrait',
        mimeType: 'image/png',
        originalFilename: 'portrait.png',
        previewUrl: 'https://cdn.test/portrait-preview.png',
        source: 'asset-library',
        title: 'Portrait',
        width: 1024,
      },
      {
        naturalHeight: 1600,
        naturalWidth: 900,
        previewUrl: 'https://cdn.test/portrait-preview.png',
      },
    );

    expect(nodeData.naturalWidth).toBe(900);
    expect(nodeData.naturalHeight).toBe(1600);
    expect(nodeData.aspectRatio).toBeCloseTo(900 / 1600);
    expect(nodeData.width).toBe(170);
    expect(nodeData.height).toBe(302);
  });

  it('builds a patch from measured natural size when stored asset ratio is wrong', () => {
    const patch = buildMeasuredAssetNodePatch(
      {
        height: 1024,
        width: 1024,
      } as const,
      {
        h: 1600,
        w: 900,
      },
    );

    expect(patch).toEqual({
      aspectRatio: 900 / 1600,
      height: 302,
      naturalHeight: 1600,
      naturalWidth: 900,
      width: 170,
    });
  });
});
