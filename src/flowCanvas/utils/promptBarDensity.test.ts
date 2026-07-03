import { describe, expect, test } from 'vitest';

import { getPromptBarDensity, promptBarBaseDensity } from './promptBarDensity';

describe('promptBarDensity', () => {
  test('keeps prompt bars within TapNow-like viewport proportions', () => {
    expect(getPromptBarDensity('text')).toMatchObject({
      width: 'clamp(520px, 42vw, 760px)',
      minHeight: 120,
      editorMinHeight: 60,
    });
    expect(getPromptBarDensity('image')).toMatchObject({
      width: 'clamp(560px, 44vw, 820px)',
      minHeight: 128,
      editorMinHeight: 68,
    });
    expect(getPromptBarDensity('video')).toMatchObject({
      width: 'clamp(580px, 46vw, 860px)',
      minHeight: 136,
      editorMinHeight: 72,
    });
  });

  test('uses one shared compact density for editor text and controls', () => {
    expect(promptBarBaseDensity).toMatchObject({
      padding: '12px 16px 12px',
      editorFontSize: 15,
      editorLineHeight: 1.32,
      controlHeight: 28,
      actionButtonSize: 24,
    });
  });
});
