import React from 'react';

export const IMAGE_GENERATE_TOOLBAR_HEIGHT = 42;
export const IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE = 36;
export const IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH = 72;

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
  return (
    <div
      data-testid="image-generate-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: IMAGE_GENERATE_TOOLBAR_HEIGHT,
        minWidth: 0,
        padding: '3px 5px 3px 14px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      <div
        data-testid="image-generate-toolbar-credits"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'row',
          gap: 6,
          minWidth: IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH,
          whiteSpace: 'nowrap',
          color: '#cbd5e1',
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>{creditsLabel}</span>
        <span style={{ color: '#f8fafc', fontSize: 16, fontWeight: 800 }}>{creditsValue}</span>
      </div>

      <button
        type="button"
        aria-label={isGenerating ? '生成中' : '开始生成'}
        title="开始生成"
        disabled={isGenerating}
        onClick={onGenerate}
        style={{
          width: IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE,
          height: IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: isGenerating ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: isGenerating ? '#64748b' : '#fff',
          fontSize: 14,
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
      >
        {isGenerating ? '...' : '↑'}
      </button>
    </div>
  );
}
