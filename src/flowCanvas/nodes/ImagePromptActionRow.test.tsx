import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ImagePromptActionRow } from './ImagePromptActionRow';

describe('ImagePromptActionRow', () => {
  test('moves the batch display mode control out of the primary row', () => {
    render(
      <ImagePromptActionRow
        batchCount={2}
        creditsValue="8"
        isGenerating={false}
        modelControl={<button type="button">Model route</button>}
        settingsControl={<button type="button">1:1 1K</button>}
        onGenerate={vi.fn()}
        quantityControl={<button type="button">2x</button>}
        multiImageModeControl={<button type="button">Combined / split nodes</button>}
      />,
    );

    const root = screen.getByTestId('image-prompt-action-row');
    const left = screen.getByTestId('image-prompt-action-row-left');
    const secondary = screen.getByTestId('image-prompt-action-row-secondary');
    const right = screen.getByTestId('image-prompt-action-row-right');

    expect(root.style.flexDirection).toBe('column');
    expect(root.style.alignItems).toBe('stretch');
    expect(left.textContent).not.toContain('Combined / split nodes');
    expect(secondary.textContent).toContain('Combined / split nodes');
    expect(secondary.style.alignSelf).toBe('flex-start');
    expect(right.style.marginLeft).toBe('auto');
  });

  test('keeps a compact single row when batch mode is one', () => {
    render(
      <ImagePromptActionRow
        batchCount={1}
        creditsValue="5"
        isGenerating={false}
        modelControl={<button type="button">Model route</button>}
        settingsControl={<button type="button">1:1 1K</button>}
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
