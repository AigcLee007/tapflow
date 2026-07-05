import React from 'react';

import { ImageGenerateToolbar } from './ImageGenerateToolbar';

type ImagePromptActionRowProps = {
  batchCount: number;
  creditsValue: string;
  isGenerating: boolean;
  modelControl: React.ReactNode;
  settingsControl: React.ReactNode;
  quantityControl: React.ReactNode;
  generationModeControl?: React.ReactNode;
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
  generationModeControl,
  multiImageModeControl,
  onGenerate,
}: ImagePromptActionRowProps) {
  const showSecondaryRow = (batchCount > 1 && Boolean(multiImageModeControl)) || Boolean(generationModeControl);

  if (showSecondaryRow) {
    return (
      <div
        data-testid="image-prompt-action-row"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 6,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            width: '100%',
          }}
        >
          <div
            data-testid="image-prompt-action-row-left"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: '1 1 auto',
              minWidth: 0,
              flexWrap: 'nowrap',
            }}
          >
            {modelControl}
            {settingsControl}
            {quantityControl}
          </div>

          <div
            aria-hidden="true"
            data-testid="image-prompt-action-row-spacer"
            style={{
              flex: '1 1 auto',
              minWidth: 0,
            }}
          />

          <div
            data-testid="image-prompt-action-row-right"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flex: '0 0 auto',
              flexShrink: 0,
              marginLeft: 'auto',
            }}
          >
            <ImageGenerateToolbar
              creditsLabel="点数"
              creditsValue={creditsValue}
              isGenerating={isGenerating}
              onGenerate={onGenerate}
            />
          </div>
        </div>

        <div
          data-testid="image-prompt-action-row-secondary"
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            gap: 6,
            maxWidth: '100%',
          }}
        >
          {generationModeControl}
          {batchCount > 1 ? multiImageModeControl : null}
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
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
      }}
    >
      <div
        data-testid="image-prompt-action-row-left"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: '0 0 auto',
          flexShrink: 0,
          minWidth: 0,
          flexWrap: 'nowrap',
        }}
      >
        {modelControl}
        {settingsControl}
        {quantityControl}
      </div>

      <div
        aria-hidden="true"
        data-testid="image-prompt-action-row-spacer"
        style={{
          flex: '1 1 auto',
          minWidth: 0,
        }}
      />

      <div
        data-testid="image-prompt-action-row-right"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flex: '0 0 auto',
          flexShrink: 0,
        }}
      >
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
