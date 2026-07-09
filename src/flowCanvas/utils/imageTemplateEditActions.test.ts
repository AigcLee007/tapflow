import { describe, expect, test } from 'vitest';

import {
  FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS,
  buildImageTemplateEditPrompt,
  resolveImageTemplateEditAspectRatio,
  resolveImageTemplateEditMode,
} from './imageTemplateEditActions';

describe('imageTemplateEditActions', () => {
  test('defines all nine DramaClaw template edit actions', () => {
    expect(FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.map((action) => action.key)).toEqual([
      'multiCameraGrid',
      'plotFourGrid',
      'faceThreeView',
      'productThreeView',
      'serialStoryboard25',
      'cinematicLightCorrection',
      'characterThreeView',
      'frameProjection3sLater',
      'frameProjection5sEarlier',
    ]);

    expect(resolveImageTemplateEditMode('multiCameraGrid')).toBe('multi_camera_nine_grid');
    expect(resolveImageTemplateEditMode('serialStoryboard25')).toBe('storyboard_25_grid');
  });

  test('builds the source-equivalent prompt and appends the user prompt block', () => {
    const prompt = buildImageTemplateEditPrompt('multiCameraGrid', '多机位九宫格');

    expect(prompt).toContain('3x3 director multi-camera contact sheet');
    expect(prompt).toContain('[KF1 | 3s | ELS]');
    expect(prompt).toContain('User prompt:\n多机位九宫格');
  });

  test('resolves original aspect ratios from source dimensions and preserves fixed template ratios', () => {
    expect(resolveImageTemplateEditAspectRatio('multiCameraGrid', {
      naturalHeight: 1600,
      naturalWidth: 900,
    })).toBe('9:16');

    expect(resolveImageTemplateEditAspectRatio('faceThreeView', {
      naturalHeight: 1600,
      naturalWidth: 900,
    })).toBe('3:2');
  });
});
