import { describe, expect, test } from 'vitest';
import {
  buildImageViewerComparisonSource,
  formatImageViewerDateTime,
} from './imageViewerComparison';

describe('image viewer comparison helpers', () => {
  test('formats image viewer dates with minute-level time', () => {
    const timestamp = new Date(2026, 6, 4, 1, 59).getTime();

    expect(formatImageViewerDateTime(timestamp)).toBe('2026/07/04 01:59');
  });

  test('uses the first asset reference as the original comparison source', () => {
    expect(buildImageViewerComparisonSource([
      {
        id: 'asset-first',
        imageUrl: 'https://cdn.test/first.png',
        key: 'asset:asset-first',
        mentionLabel: 'Image 1',
        source: 'asset',
        title: 'First reference',
      },
      {
        id: 'asset-second',
        imageUrl: 'https://cdn.test/second.png',
        key: 'asset:asset-second',
        mentionLabel: 'Image 2',
        source: 'asset',
        title: 'Second reference',
      },
    ])).toEqual({
      assetId: 'asset-first',
      key: 'asset:asset-first',
      label: 'Image 1',
      source: 'asset',
    });
  });

  test('uses the first upstream reference node as the original comparison source', () => {
    expect(buildImageViewerComparisonSource([
      {
        assetId: 'source-asset',
        id: 'source-node',
        imageUrl: 'https://cdn.test/source.png',
        key: 'upstream:source-node',
        mentionLabel: 'Image 1',
        source: 'upstream',
        title: 'Source node',
      },
    ])).toEqual({
      assetId: 'source-asset',
      key: 'upstream:source-node',
      label: 'Image 1',
      nodeId: 'source-node',
      source: 'upstream',
    });
  });

  test('does not create comparison source for text-to-image references', () => {
    expect(buildImageViewerComparisonSource([])).toBeNull();
  });
});
