import { describe, expect, it } from 'vitest';

import {
  getTextFontSizePx,
  normalizeTextFontSize,
  TEXT_FONT_SIZE_PRESETS,
} from './textFontSize';

describe('text font size presets', () => {
  it('defines the ordered canvas and fullscreen sizes for every supported preset', () => {
    expect(TEXT_FONT_SIZE_PRESETS).toEqual([
      { value: 'h1', label: '一号', canvasPx: 18, fullscreenPx: 34 },
      { value: 'h2', label: '二号', canvasPx: 16, fullscreenPx: 28 },
      { value: 'h3', label: '三号', canvasPx: 14, fullscreenPx: 22 },
      { value: 'body', label: '正文', canvasPx: 12, fullscreenPx: 15 },
    ]);
  });

  it('normalizes unsupported values to the body preset', () => {
    expect(normalizeTextFontSize('h2')).toBe('h2');
    expect(normalizeTextFontSize(undefined)).toBe('body');
    expect(normalizeTextFontSize('title')).toBe('body');
  });

  it('returns surface-specific pixels using the body fallback for unsupported values', () => {
    expect(getTextFontSizePx('h1', 'canvas')).toBe(18);
    expect(getTextFontSizePx('h1', 'fullscreen')).toBe(34);
    expect(getTextFontSizePx('invalid', 'canvas')).toBe(12);
    expect(getTextFontSizePx(null, 'fullscreen')).toBe(15);
  });
});
