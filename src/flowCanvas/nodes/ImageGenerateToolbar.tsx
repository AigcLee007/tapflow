import React from 'react';

export const IMAGE_GENERATE_TOOLBAR_HEIGHT = 32;
export const IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE = 26;
export const IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH = 62;

type ImageGenerateToolbarProps = {
  creditsLabel: string;
  creditsValue: string;
  isGenerating: boolean;
  onGenerate: () => void;
};

export function ImageGenerateToolbar({
  creditsLabel,
  creditsValue,
  isGenerating,
  onGenerate,
}: ImageGenerateToolbarProps) {
  const buttonLabel = isGenerating ? '生成中' : '开始生成';

  return (
    <div
      data-testid="image-generate-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: IMAGE_GENERATE_TOOLBAR_HEIGHT,
        minWidth: 0,
        padding: '0 3px 0 9px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 650,
        flexShrink: 0,
      }}
    >
      <div
        data-testid="image-generate-toolbar-credits"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'row',
          gap: 5,
          minWidth: IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH,
          whiteSpace: 'nowrap',
          color: '#cbd5e1',
          fontSize: 13,
          fontWeight: 650,
          lineHeight: 1,
        }}
      >
        <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 650 }}>{creditsLabel}</span>
        <span style={{ color: '#f8fafc', fontSize: 14, fontWeight: 800 }}>{creditsValue}</span>
      </div>

      <button
        type="button"
        aria-label={buttonLabel}
        title={buttonLabel}
        disabled={isGenerating}
        onClick={onGenerate}
        style={{
          width: IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE,
          height: IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: isGenerating ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: isGenerating ? '#64748b' : '#fff',
          fontSize: 13,
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
      >
        {isGenerating ? '...' : '→'}
      </button>
    </div>
  );
}
