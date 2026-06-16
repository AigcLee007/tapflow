import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  IMAGE_GENERATE_TOOLBAR_HEIGHT,
  IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE,
  IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH,
  ImageGenerateToolbar,
} from './ImageGenerateToolbar';

describe('ImageGenerateToolbar', () => {
  test('renders credits in a compact horizontal pill with the send button on the right', () => {
    render(
      <ImageGenerateToolbar
        creditsLabel="点数"
        creditsValue="12"
        isGenerating={false}
        onGenerate={vi.fn()}
      />,
    );

    const root = screen.getByTestId('image-generate-toolbar') as HTMLDivElement;
    const credits = screen.getByTestId('image-generate-toolbar-credits') as HTMLDivElement;
    const send = screen.getByRole('button', { name: '开始生成' }) as HTMLButtonElement;

    expect(root.style.height).toBe(`${IMAGE_GENERATE_TOOLBAR_HEIGHT}px`);
    expect(root.style.minWidth).toBe('0');
    expect(root.style.borderRadius).toBe('999px');
    expect(credits.style.minWidth).toBe(`${IMAGE_GENERATE_TOOLBAR_CREDITS_MIN_WIDTH}px`);
    expect(credits.style.flexDirection).toBe('row');
    expect(credits.style.whiteSpace).toBe('nowrap');
    expect(credits.textContent).toBe('点数12');
    expect(send.style.width).toBe(`${IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE}px`);
    expect(send.style.height).toBe(`${IMAGE_GENERATE_TOOLBAR_SEND_BUTTON_SIZE}px`);
    expect(send.textContent).toBe('↑');
  });

  test('keeps larger Nano Banana credit values horizontal too', () => {
    render(
      <ImageGenerateToolbar
        creditsLabel="点数"
        creditsValue="16"
        isGenerating={false}
        onGenerate={vi.fn()}
      />,
    );

    const credits = screen.getByTestId('image-generate-toolbar-credits') as HTMLDivElement;

    expect(credits.style.flexDirection).toBe('row');
    expect(credits.style.whiteSpace).toBe('nowrap');
    expect(credits.textContent).toBe('点数16');
  });

  test('shows generating state and disables the send button', () => {
    const onGenerate = vi.fn();

    render(
      <ImageGenerateToolbar
        creditsLabel="点数"
        creditsValue="6"
        isGenerating
        onGenerate={onGenerate}
      />,
    );

    const send = screen.getByRole('button', { name: '生成中' }) as HTMLButtonElement;

    expect(send.disabled).toBe(true);
    expect(send.textContent).toBe('...');

    fireEvent.click(send);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
