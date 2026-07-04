import { describe, expect, test } from 'vitest';
import {
  buildImageViewerComparisonSource,
  calculateContainedImageRect,
  formatImageViewerDateTime,
  getComparisonSplitPercentFromClientX,
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

  test('calculates the visible object-fit contain rect for wide generated images', () => {
    expect(calculateContainedImageRect({
      containerHeight: 800,
      containerWidth: 1000,
      imageNaturalHeight: 900,
      imageNaturalWidth: 1600,
    })).toEqual({
      height: 562.5,
      left: 0,
      top: 118.75,
      width: 1000,
    });
  });

  test('calculates the visible object-fit contain rect for tall generated images', () => {
    expect(calculateContainedImageRect({
      containerHeight: 800,
      containerWidth: 1000,
      imageNaturalHeight: 1600,
      imageNaturalWidth: 900,
    })).toEqual({
      height: 800,
      left: 275,
      top: 0,
      width: 450,
    });
  });

  test('maps split dragging to the contained image rect edges', () => {
    const rect = { height: 800, left: 275, top: 0, width: 450 };

    expect(getComparisonSplitPercentFromClientX(200, rect)).toBe(0);
    expect(getComparisonSplitPercentFromClientX(275, rect)).toBe(0);
    expect(getComparisonSplitPercentFromClientX(500, rect)).toBe(50);
    expect(getComparisonSplitPercentFromClientX(725, rect)).toBe(100);
    expect(getComparisonSplitPercentFromClientX(800, rect)).toBe(100);
  });
});
