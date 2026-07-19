import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS } from '../utils/imageTemplateEditActions';
import { ImageTemplateEditMenu } from './ImageTemplateEditMenu';
import { IMAGE_MENU_SURFACE_Z_INDEX, IMAGE_MODEL_MENU_WIDTH } from './imageMenuStyles';

describe('ImageTemplateEditMenu', () => {
  test('renders every template action in the shared fixed menu surface', () => {
    render(
      <ImageTemplateEditMenu
        fixedPosition={{ left: 420, top: 188 }}
        onSelect={vi.fn()}
      />,
    );

    const menu = screen.getByRole('menu') as HTMLElement;
    expect(menu.style.left).toBe('420px');
    expect(menu.style.top).toBe('188px');
    expect(menu.style.width).toBe(`${IMAGE_MODEL_MENU_WIDTH}px`);
    expect(menu.style.zIndex).toBe(String(IMAGE_MENU_SURFACE_Z_INDEX));
    FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.forEach((action) => {
      expect(screen.getByRole('button', { name: new RegExp(action.label, 'i') })).toBeTruthy();
    });
  });

  test('emits the selected template key from the standalone menu', () => {
    const onSelect = vi.fn();

    render(
      <ImageTemplateEditMenu
        fixedPosition={{ left: 420, top: 188 }}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /多机位九宫格/i }));
    expect(onSelect).toHaveBeenCalledWith('multiCameraGrid');
  });
});
