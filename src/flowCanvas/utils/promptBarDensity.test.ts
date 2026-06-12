import { describe, expect, test } from 'vitest';

import { getPromptBarDensity, promptBarBaseDensity } from './promptBarDensity';

describe('promptBarDensity', () => {
  test('keeps prompt bars within TapNow-like viewport proportions', () => {
    expect(getPromptBarDensity('text')).toMatchObject({
      width: 'clamp(720px, 56vw, 1040px)',
      minHeight: 156,
      editorMinHeight: 92,
    });
    expect(getPromptBarDensity('image')).toMatchObject({
      width: 'clamp(760px, 58vw, 1080px)',
      minHeight: 168,
      editorMinHeight: 98,
    });
    expect(getPromptBarDensity('video')).toMatchObject({
      width: 'clamp(780px, 60vw, 1120px)',
      minHeight: 176,
      editorMinHeight: 104,
    });
  });

  test('uses one shared compact density for editor text and controls', () => {
    expect(promptBarBaseDensity).toMatchObject({
      padding: '18px 22px 16px',
      editorFontSize: 18,
      editorLineHeight: 1.38,
      controlHeight: 32,
      actionButtonSize: 26,
    });
  });
});
