export type TextFontSizePreset = 'h1' | 'h2' | 'h3' | 'body';

export type TextFontSizeSurface = 'canvas' | 'fullscreen';

type TextFontSizePresetDefinition = {
  value: TextFontSizePreset;
  label: string;
  canvasPx: number;
  fullscreenPx: number;
};

export const TEXT_FONT_SIZE_PRESETS: readonly TextFontSizePresetDefinition[] = [
  { value: 'h1', label: '一号', canvasPx: 18, fullscreenPx: 34 },
  { value: 'h2', label: '二号', canvasPx: 16, fullscreenPx: 28 },
  { value: 'h3', label: '三号', canvasPx: 14, fullscreenPx: 22 },
  { value: 'body', label: '正文', canvasPx: 12, fullscreenPx: 15 },
];

export function normalizeTextFontSize(value: unknown): TextFontSizePreset {
  return TEXT_FONT_SIZE_PRESETS.some((preset) => preset.value === value)
    ? (value as TextFontSizePreset)
    : 'body';
}

export function getTextFontSizePx(value: unknown, surface: TextFontSizeSurface): number {
  const preset = TEXT_FONT_SIZE_PRESETS.find(
    (candidate) => candidate.value === normalizeTextFontSize(value),
  )!;

  return surface === 'canvas' ? preset.canvasPx : preset.fullscreenPx;
}
