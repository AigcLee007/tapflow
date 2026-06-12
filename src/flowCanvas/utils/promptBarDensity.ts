export type PromptBarDensityVariant = 'text' | 'image' | 'video';

export const promptBarDensity = {
  text: {
    width: 'clamp(720px, 56vw, 1040px)',
    minHeight: 156,
    editorMinHeight: 92,
    editorExpandedMinHeight: 260,
    editorMaxHeight: 300,
  },
  image: {
    width: 'clamp(760px, 58vw, 1080px)',
    minHeight: 168,
    editorMinHeight: 98,
    editorExpandedMinHeight: 280,
    editorMaxHeight: 320,
  },
  video: {
    width: 'clamp(780px, 60vw, 1120px)',
    minHeight: 176,
    editorMinHeight: 104,
    editorExpandedMinHeight: 292,
    editorMaxHeight: 340,
  },
} as const;

export const promptBarBaseDensity = {
  topGap: 20,
  borderRadius: 22,
  padding: '18px 22px 16px',
  gap: 14,
  editorFontSize: 18,
  editorLineHeight: 1.38,
  bottomRowMarginTop: 2,
  controlHeight: 32,
  controlFontSize: 13,
  actionButtonSize: 26,
} as const;

export const getPromptBarDensity = (variant: PromptBarDensityVariant) => ({
  ...promptBarBaseDensity,
  ...promptBarDensity[variant],
});
