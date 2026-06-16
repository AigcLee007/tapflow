import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ImagePromptActionRow } from './ImagePromptActionRow';

describe('ImagePromptActionRow', () => {
  test('keeps the model trigger readable and moves multi-image controls onto their own row when batch mode is active', () => {
    render(
      <ImagePromptActionRow
        batchCount={2}
        creditsValue="8"
        isGenerating={false}
        modelControl={<button type="button">Nano Banana Pro · 线路二</button>}
        settingsControl={<button type="button">1:1 · 1K</button>}
        onGenerate={vi.fn()}
        quantityControl={<button type="button">2x</button>}
        multiImageModeControl={<button type="button">合并显示 / 多节点显示</button>}
      />,
    );

    const root = screen.getByTestId('image-prompt-action-row');
    const primary = screen.getByTestId('image-prompt-action-row-primary');
    const secondary = screen.getByTestId('image-prompt-action-row-secondary');
    const modeStack = screen.getByTestId('image-prompt-action-row-mode-stack');
    const modelTrigger = screen.getByRole('button', { name: 'Nano Banana Pro · 线路二' });

    expect(root.style.flexDirection).toBe('column');
    expect(primary.style.flexWrap).toBe('nowrap');
    expect(secondary.style.justifyContent).toBe('space-between');
    expect(modeStack.style.flexDirection).toBe('column');
    expect(modeStack.style.alignItems).toBe('stretch');
    expect(modelTrigger.textContent).toBe('Nano Banana Pro · 线路二');
    expect(screen.getByText('合并显示 / 多节点显示')).toBeTruthy();
    expect(screen.getByText('点数')).toBeTruthy();
  });

  test('uses a single-row layout when batch mode is one', () => {
    render(
      <ImagePromptActionRow
        batchCount={1}
        creditsValue="5"
        isGenerating={false}
        modelControl={<button type="button">GPT-Image-2 · 线路一</button>}
        settingsControl={<button type="button">1:1 · 1K</button>}
        onGenerate={vi.fn()}
        quantityControl={<button type="button">1x</button>}
      />,
    );

    const root = screen.getByTestId('image-prompt-action-row');
    const primary = screen.getByTestId('image-prompt-action-row-primary');

    expect(root.style.flexDirection).toBe('row');
    expect(primary.style.flex).toBe('1 1 auto');
    expect(screen.queryByTestId('image-prompt-action-row-secondary')).toBeNull();
  });
});
