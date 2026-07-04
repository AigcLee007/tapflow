import { describe, expect, it } from 'vitest';

import { buildCanvasImageReferenceSources, resolveReferenceChips } from './referenceSourceResolver';

describe('referenceSourceResolver', () => {
  it('orders resolved reference chips by referenceOrder and keeps asset previews intact', () => {
    const chips = resolveReferenceChips({
      assetItemsById: {
        'asset-1': {
          id: 'asset-1',
          originalFilename: 'asset-1.png',
          previewUrl: 'https://cdn.test/asset-1.png',
          title: 'Asset One',
        },
      },
      referenceAssetItemIds: ['asset-1'],
      referenceOrder: ['asset:asset-1', 'upstream:node-1'],
      upstreamImageRefs: [
        {
          edgeId: 'edge-1',
          id: 'node-1',
          imageUrl: 'https://cdn.test/node-1.png',
          key: 'upstream:node-1',
          source: 'upstream',
          title: 'Canvas source',
        },
      ],
    });

    expect(chips.map((item) => item.key)).toEqual(['asset:asset-1', 'upstream:node-1']);
    expect(chips[0]).toMatchObject({
      imageUrl: 'https://cdn.test/asset-1.png',
      mentionLabel: 'Image 1',
      source: 'asset',
      title: 'Asset One',
    });
    expect(chips[1]).toMatchObject({
      imageUrl: 'https://cdn.test/node-1.png',
      mentionLabel: 'Image 2',
      source: 'upstream',
      title: 'Canvas source',
    });
  });

  it('skips asset references that have not resolved to preview data yet', () => {
    const chips = resolveReferenceChips({
      assetItemsById: {},
      referenceAssetItemIds: ['asset-missing'],
      upstreamImageRefs: [],
    });

    expect(chips).toEqual([]);
  });

  it('builds compact canvas image sources for the picker and excludes the active node', () => {
    const sources = buildCanvasImageReferenceSources({
      currentNodeId: 'current-node',
      nodes: [
        {
          data: {
            kind: 'image',
            title: 'Current image',
            updatedAt: 1,
          },
          id: 'current-node',
          type: 'image',
        } as never,
        {
          data: {
            kind: 'image',
            originalImageUrl: 'https://cdn.test/original.png',
            title: 'Source image',
            updatedAt: 2,
          },
          id: 'source-node',
          type: 'image',
        } as never,
        {
          data: {
            kind: 'image',
            thumbnailUrl: 'https://cdn.test/thumb.png',
            title: 'Thumb image',
            updatedAt: 3,
          },
          id: 'thumb-node',
          type: 'image',
        } as never,
        {
          data: {
            kind: 'text',
            title: 'Text node',
            updatedAt: 4,
          },
          id: 'text-node',
          type: 'text',
        } as never,
      ],
    });

    expect(sources).toEqual([
      expect.objectContaining({
        imageUrl: 'https://cdn.test/thumb.png',
        key: 'canvas:thumb-node',
        nodeId: 'thumb-node',
        title: 'Thumb image',
      }),
      expect.objectContaining({
        imageUrl: 'https://cdn.test/original.png',
        key: 'canvas:source-node',
        nodeId: 'source-node',
        title: 'Source image',
      }),
    ]);
  });
});
