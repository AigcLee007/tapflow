import { describe, expect, it } from 'vitest';

import {
  getVideoNodeSizeForNaturalDimensions,
  getVideoNodeSizeForRequestedRatio,
  resolveVideoPreviewObjectFit,
} from './videoNodeSizing';

describe('videoNodeSizing', () => {
  it.each([
    ['16:9', { width: 302, height: 170 }],
    ['9:16', { width: 170, height: 302 }],
    ['1:1', { width: 170, height: 170 }],
    ['invalid', { width: 302, height: 170 }],
  ])('sizes a requested %s ratio to the canonical short side', (ratio, expected) => {
    expect(getVideoNodeSizeForRequestedRatio(ratio)).toEqual(expected);
  });

  it.each([
    [1080, 1920, { width: 170, height: 302 }],
    [1920, 1080, { width: 302, height: 170 }],
    [0, 1920, { width: 302, height: 170 }],
    [1080, Number.NaN, { width: 302, height: 170 }],
  ])('sizes natural dimensions to the canonical short side', (width, height, expected) => {
    expect(getVideoNodeSizeForNaturalDimensions(width, height)).toEqual(expected);
  });

  it('uses contain for video previews', () => {
    expect(resolveVideoPreviewObjectFit()).toBe('contain');
  });
});
