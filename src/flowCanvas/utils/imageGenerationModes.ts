import type { FlowImageGenerationMode, FlowProductionSubjectType } from '../types';

export type ImageGenerationModeOption = {
  description: string;
  label: string;
  mode: FlowImageGenerationMode;
};

export const IMAGE_GENERATION_MODE_OPTIONS: ImageGenerationModeOption[] = [
  {
    description: '普通图片生成',
    label: '标准',
    mode: 'standard',
  },
  {
    description: '场景/空间全景图',
    label: '360°全景',
    mode: 'panorama_360',
  },
  {
    description: '场景/空间的三面连续展开',
    label: '270°环绕',
    mode: 'wraparound_270',
  },
  {
    description: '主体、角色或产品的三面环视图',
    label: '主体三面展开',
    mode: 'subject_orbit_270',
  },
];

const MODE_SET = new Set(IMAGE_GENERATION_MODE_OPTIONS.map((option) => option.mode));

export function normalizeImageGenerationMode(value: unknown): FlowImageGenerationMode {
  return typeof value === 'string' && MODE_SET.has(value as FlowImageGenerationMode)
    ? (value as FlowImageGenerationMode)
    : 'standard';
}

function subjectTypeForMode(mode: FlowImageGenerationMode): FlowProductionSubjectType {
  return mode === 'subject_orbit_270' ? 'subject' : 'scene';
}

export function buildImageGenerationModeParamPatch(modeInput: unknown): Record<string, unknown> {
  const mode = normalizeImageGenerationMode(modeInput);

  if (mode === 'standard') {
    return { generationMode: 'standard' };
  }

  if (mode === 'panorama_360') {
    return {
      generationMode: mode,
      panorama: {
        continuity: 'seamless',
        projectionHint: 'equirectangular',
        subjectType: 'scene',
      },
    };
  }

  return {
    generationMode: mode,
    wraparound: {
      coverageDegrees: 270,
      layout: mode === 'subject_orbit_270' ? 'three_panel_sheet' : 'continuous',
      panels: 3,
      subjectType: subjectTypeForMode(mode),
    },
  };
}
