import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ImagePromptActionRow } from './ImagePromptActionRow';

describe('ImagePromptActionRow', () => {
  test('keeps every control on one row when batch mode is active', () => {
    render(
      <ImagePromptActionRow
        batchCount={2}
        creditsValue="8"
        isGenerating={false}
        modelControl={<button type="button">Nano Banana Pro · 线路一</button>}
        settingsControl={<button type="button">1:1 · 1K</button>}
        onGenerate={vi.fn()}
        quantityControl={<button type="button">2x</button>}
        multiImageModeControl={<button type="button">合并显示 / 多节点显示</button>}
      />,
    );

    const root = screen.getByTestId('image-prompt-action-row');
    const left = screen.getByTestId('image-prompt-action-row-left');
    const spacer = screen.getByTestId('image-prompt-action-row-spacer');
    const right = screen.getByTestId('image-prompt-action-row-right');

    expect(root.style.flexDirection).toBe('row');
    expect(root.style.flexWrap).toBe('nowrap');
    expect(left.style.flexShrink).toBe('0');
    expect(left.textContent).toContain('合并显示 / 多节点显示');
    expect(spacer.style.flex).toBe('1 1 auto');
    expect(right.style.flexShrink).toBe('0');
    expect(screen.queryByTestId('image-prompt-action-row-secondary')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nano Banana Pro · 线路一' })).toBeTruthy();
    expect(screen.getByText('合并显示 / 多节点显示')).toBeTruthy();
    expect(screen.getByText('点数')).toBeTruthy();
  });

  test('uses the same one-row shell when batch mode is one', () => {
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
    const spacer = screen.getByTestId('image-prompt-action-row-spacer');

    expect(root.style.flexDirection).toBe('row');
    expect(root.style.flexWrap).toBe('nowrap');
    expect(spacer.textContent).toBe('');
    expect(screen.queryByTestId('image-prompt-action-row-secondary')).toBeNull();
  });
});
