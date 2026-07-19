import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ImageMoreMenu } from './ImageMoreMenu';
import { IMAGE_MENU_SURFACE_Z_INDEX, IMAGE_MODEL_MENU_WIDTH } from './imageMenuStyles';

describe('ImageMoreMenu', () => {
  test('renders as a fixed high-layer menu when anchored from the floating toolbar', () => {
    render(
      <ImageMoreMenu
        fixedPosition={{ left: 420, top: 188 }}
        onSelect={vi.fn()}
      />,
    );

    const menu = screen.getByRole('menu') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.style.left).toBe('420px');
    expect(menu.style.top).toBe('188px');
    expect(menu.style.width).toBe(`${IMAGE_MODEL_MENU_WIDTH}px`);
    expect(menu.style.zIndex).toBe(String(IMAGE_MENU_SURFACE_Z_INDEX));
  });

  test('shows the panorama viewer action when requested', () => {
    render(
      <ImageMoreMenu
        fixedPosition={{ left: 420, top: 188 }}
        onSelect={vi.fn()}
        showPanoramaViewer
      />,
    );

    expect(screen.getByText('360 全景查看')).toBeTruthy();
    expect(screen.getByText('创建或打开全景查看器')).toBeTruthy();
  });

  test('does not contain the standalone nine-grid tools entry', () => {
    render(
      <ImageMoreMenu
        fixedPosition={{ left: 420, top: 188 }}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /九宫格工具/i })).toBeNull();
  });
});
