import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { ImageOutpaintOverlay } from './ImageOutpaintOverlay';
import { ImageRepaintOverlay } from './ImageRepaintOverlay';

describe('image edit overlay menu selects', () => {
  test('renders the repaint mask mode as a shared custom menu', () => {
    render(<ImageRepaintOverlay imageUrl="https://example.test/image.png" onCancel={vi.fn()} onConfirm={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'repaint mask mode 透明=编辑区' });
    expect(trigger).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '白色=编辑区' }));

    expect(screen.getByRole('button', { name: 'repaint mask mode 白色=编辑区' })).toBeTruthy();
  });

  test('renders the outpaint mask mode as a shared custom menu', () => {
    render(<ImageOutpaintOverlay imageUrl="https://example.test/image.png" onCancel={vi.fn()} onConfirm={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'outpaint mask mode 透明=编辑区' });
    expect(trigger).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '白色=编辑区' }));

    expect(screen.getByRole('button', { name: 'outpaint mask mode 白色=编辑区' })).toBeTruthy();
  });
});
