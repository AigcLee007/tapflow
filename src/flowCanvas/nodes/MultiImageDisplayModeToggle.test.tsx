import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  MultiImageDisplayModeToggle,
  MULTI_IMAGE_MODE_TRIGGER_HEIGHT,
  MULTI_IMAGE_MODE_TRIGGER_MIN_WIDTH,
} from './MultiImageDisplayModeToggle';

describe('MultiImageDisplayModeToggle', () => {
  test('renders as a compact single-value dropup trigger', () => {
    render(<MultiImageDisplayModeToggle mode="split_nodes" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: '多节点显示' }) as HTMLButtonElement;

    expect(trigger.dataset.testid).toBe('multi-image-display-mode-trigger');
    expect(trigger.style.minWidth).toBe(`${MULTI_IMAGE_MODE_TRIGGER_MIN_WIDTH}px`);
    expect(trigger.style.minHeight).toBe(`${MULTI_IMAGE_MODE_TRIGGER_HEIGHT}px`);
    expect(trigger.style.whiteSpace).toBe('nowrap');
    expect(trigger.textContent).toContain('多节点显示');
    expect(screen.queryByText('合并显示')).toBeNull();
  });

  test('opens a compact menu and updates display mode', () => {
    const onChange = vi.fn();

    render(<MultiImageDisplayModeToggle mode="split_nodes" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('multi-image-display-mode-trigger'));

    const menu = screen.getByTestId('multi-image-display-mode-menu') as HTMLDivElement;
    expect(menu.style.minWidth).toBe('116px');

    fireEvent.click(screen.getByRole('button', { name: '合并显示' }));

    expect(onChange).toHaveBeenCalledWith('combined');
    expect(screen.queryByTestId('multi-image-display-mode-menu')).toBeNull();
  });
});
