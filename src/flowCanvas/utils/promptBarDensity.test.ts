import { describe, expect, test } from 'vitest';

import { getPromptBarDensity, promptBarBaseDensity, videoComposerDensity } from './promptBarDensity';

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
      width: 'clamp(640px, 52vw, 980px)',
      minHeight: 120,
      editorMinHeight: 52,
    });
  });

  test('uses one shared compact density for editor text and controls', () => {
    expect(promptBarBaseDensity).toMatchObject({
      padding: '12px 16px 12px',
      editorFontSize: 14,
      editorLineHeight: 1.32,
      controlHeight: 28,
      actionButtonSize: 24,
    });
  });

  test('defines content-sized video capsule and action tokens', () => {
    expect(videoComposerDensity).toMatchObject({
      capsuleHeight: 28,
      capsuleRadius: 9999,
      modelMaxWidth: 230,
      parameterMaxWidth: 320,
      mobileParameterMaxWidth: 180,
      actionSize: 24,
    });
  });
});
