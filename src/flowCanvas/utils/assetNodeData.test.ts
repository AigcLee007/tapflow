import { describe, expect, it } from 'vitest';

import { buildAssetBackedNodeData } from './assetNodeData';

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
});
