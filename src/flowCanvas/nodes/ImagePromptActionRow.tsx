import React from 'react';

import { ImageGenerateToolbar } from './ImageGenerateToolbar';

type ImagePromptActionRowProps = {
  batchCount: number;
  creditsValue: string;
  isGenerating: boolean;
  modelControl: React.ReactNode;
  settingsControl: React.ReactNode;
  quantityControl: React.ReactNode;
  multiImageModeControl?: React.ReactNode;
  onGenerate: () => void;
};

export function ImagePromptActionRow({
  batchCount,
  creditsValue,
  isGenerating,
  modelControl,
  settingsControl,
  quantityControl,
  multiImageModeControl,
  onGenerate,
}: ImagePromptActionRowProps) {
  const showMultiImageMode = batchCount > 1 && Boolean(multiImageModeControl);

  if (showMultiImageMode) {
    return (
      <div
        data-testid="image-prompt-action-row"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
        }}
      >
        <div
          data-testid="image-prompt-action-row-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'nowrap',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
            {modelControl}
            {settingsControl}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
            {quantityControl}
          </div>
        </div>

        <div
          data-testid="image-prompt-action-row-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            data-testid="image-prompt-action-row-mode-stack"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 10,
              minWidth: 0,
            }}
          >
            {multiImageModeControl}
          </div>
          <ImageGenerateToolbar
            creditsLabel="点数"
            creditsValue={creditsValue}
            isGenerating={isGenerating}
            onGenerate={onGenerate}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="image-prompt-action-row"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
      }}
    >
      <div
        data-testid="image-prompt-action-row-primary"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: '1 1 auto',
          minWidth: 0,
          flexWrap: 'nowrap',
        }}
      >
        {modelControl}
        {settingsControl}
        {quantityControl}
      </div>

      <ImageGenerateToolbar
        creditsLabel="点数"
        creditsValue={creditsValue}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
      />
    </div>
  );
}
