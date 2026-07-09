import { describe, expect, it } from 'vitest';

import {
  IMAGE_GENERATION_MODE_OPTIONS,
  buildImageGenerationModeParamPatch,
  normalizeImageGenerationMode,
} from './imageGenerationModes';

describe('imageGenerationModes', () => {
  it('normalizes unsupported values to standard', () => {
    expect(normalizeImageGenerationMode('panorama_360')).toBe('panorama_360');
    expect(normalizeImageGenerationMode('270-camera')).toBe('standard');
    expect(normalizeImageGenerationMode(null)).toBe('standard');
  });

  it('uses wraparound wording for 270 modes', () => {
    const labels = IMAGE_GENERATION_MODE_OPTIONS.map((option) => option.label).join(' ');
    expect(labels).toContain('270°环绕');
    expect(labels).not.toContain('270°机位');
  });

  it('builds safe structured params for 360 and 270 modes', () => {
    expect(buildImageGenerationModeParamPatch('panorama_360')).toMatchObject({
      generationMode: 'panorama_360',
      panorama: {
        subjectType: 'scene',
        continuity: 'seamless',
      },
    });
    expect(buildImageGenerationModeParamPatch('subject_orbit_270')).toMatchObject({
      generationMode: 'subject_orbit_270',
      wraparound: {
        coverageDegrees: 270,
        layout: 'three_panel_sheet',
        panels: 3,
        subjectType: 'subject',
      },
    });
  });

  it('clears stale production mode params when switching modes', () => {
    const staleParams = {
      generationMode: 'panorama_360',
      panorama: { projectionHint: 'equirectangular' },
      wraparound: { coverageDegrees: 270 },
    };

    const standardParams = {
      ...staleParams,
      ...buildImageGenerationModeParamPatch('standard'),
    };
    expect(JSON.stringify(standardParams)).not.toContain('panorama');
    expect(JSON.stringify(standardParams)).not.toContain('wraparound');

    const wraparoundParams = {
      ...staleParams,
      ...buildImageGenerationModeParamPatch('wraparound_270'),
    };
    expect(JSON.stringify(wraparoundParams)).not.toContain('panorama');
    expect(JSON.stringify(wraparoundParams)).toContain('wraparound');
  });
});
