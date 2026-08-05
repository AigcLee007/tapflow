export type PromptBarDensityVariant = 'text' | 'image' | 'video';

export const promptBarDensity = {
  text: {
    width: 'clamp(520px, 42vw, 760px)',
    minHeight: 120,
    editorMinHeight: 60,
    editorExpandedMinHeight: 220,
    editorMaxHeight: 260,
  },
  image: {
    width: 'clamp(560px, 44vw, 820px)',
    minHeight: 128,
    editorMinHeight: 68,
    editorExpandedMinHeight: 230,
    editorMaxHeight: 260,
  },
  video: {
    width: 'clamp(640px, 52vw, 980px)',
    minHeight: 120,
    editorMinHeight: 52,
    editorExpandedMinHeight: 240,
    editorMaxHeight: 280,
  },
} as const;

export const promptBarBaseDensity = {
  topGap: 14,
  borderRadius: 18,
  padding: '12px 16px 12px',
  gap: 10,
  editorFontSize: 14,
  editorLineHeight: 1.32,
  bottomRowMarginTop: 0,
  controlHeight: 28,
  controlFontSize: 12,
  actionButtonSize: 24,
} as const;

export const videoComposerDensity = {
  actionSize: 24,
  capsuleHeight: 28,
  capsuleRadius: 9999,
  mobileParameterMaxWidth: 180,
  modelMaxWidth: 230,
  parameterMaxWidth: 320,
} as const;

export const getPromptBarDensity = (variant: PromptBarDensityVariant) => ({
  ...promptBarBaseDensity,
  ...promptBarDensity[variant],
});
