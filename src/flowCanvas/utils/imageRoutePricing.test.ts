import { describe, expect, test } from 'vitest';

import { formatImageCredits, getDisplayImageCredits, getOfficialImageRouteSizeCredits } from './imageRoutePricing';

describe('imageRoutePricing', () => {
  test('returns official route and size specific image credits', () => {
    expect(getOfficialImageRouteSizeCredits('image.pixellelabs.nano-banana-pro', '1K')).toBe(4);
    expect(getOfficialImageRouteSizeCredits('image.pixellelabs.nano-banana-pro', '2k')).toBe(4.5);
    expect(getOfficialImageRouteSizeCredits('image.pixellelabs.nano-banana-pro', '4K')).toBe(5);
    expect(getOfficialImageRouteSizeCredits('image.pixellelabs.nano-banana-2', '1K')).toBe(2.5);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2', '4K')).toBe(3.5);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2.line2', '2K')).toBe(3.5);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2.line3', '1K')).toBe(1);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2.line3', '4K')).toBe(3);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2.line4', '2K')).toBe(4);
    expect(getOfficialImageRouteSizeCredits('image.gpt-image-2.line4', '4K')).toBe(5);
    expect(getOfficialImageRouteSizeCredits('image.mouxihub.nano-banana-pro.t3', '4K')).toBe(12);
  });

  test('formats integer and half-point credits cleanly', () => {
    expect(formatImageCredits(4)).toBe('4');
    expect(formatImageCredits(4.5)).toBe('4.5');
  });

  test('multiplies displayed image credits by the selected batch count', () => {
    expect(getDisplayImageCredits(2.5, 1)).toBe(2.5);
    expect(getDisplayImageCredits(2.5, 2)).toBe(5);
    expect(getDisplayImageCredits(3.5, 4)).toBe(14);
    expect(getDisplayImageCredits(null, 2)).toBeNull();
  });
});
