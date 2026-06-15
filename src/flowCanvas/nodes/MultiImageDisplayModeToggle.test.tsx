import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  MultiImageDisplayModeToggle,
  MULTI_IMAGE_TOGGLE_HEIGHT,
  MULTI_IMAGE_TOGGLE_MIN_WIDTH,
  MULTI_IMAGE_TOGGLE_SEGMENT_HEIGHT,
} from './MultiImageDisplayModeToggle';

describe('MultiImageDisplayModeToggle', () => {
  test('renders a single-line segmented control with balanced button sizing', () => {
    render(<MultiImageDisplayModeToggle mode="combined" onChange={vi.fn()} />);

    const root = screen.getByTestId('multi-image-display-mode-toggle') as HTMLDivElement;
    const combined = screen.getByRole('button', { name: '合并显示' }) as HTMLButtonElement;
    const split = screen.getByRole('button', { name: '多节点显示' }) as HTMLButtonElement;

    expect(root.style.minWidth).toBe(`${MULTI_IMAGE_TOGGLE_MIN_WIDTH}px`);
    expect(root.style.minHeight).toBe(`${MULTI_IMAGE_TOGGLE_HEIGHT}px`);
    expect(root.style.padding).toBe('4px');
    expect(combined.style.whiteSpace).toBe('nowrap');
    expect(split.style.whiteSpace).toBe('nowrap');
    expect(combined.style.minHeight).toBe(`${MULTI_IMAGE_TOGGLE_SEGMENT_HEIGHT}px`);
    expect(split.style.minHeight).toBe(`${MULTI_IMAGE_TOGGLE_SEGMENT_HEIGHT}px`);
    expect(combined.textContent).toBe('合并显示');
    expect(split.textContent).toBe('多节点显示');
  });

  test('updates display mode when the other segment is clicked', () => {
    const onChange = vi.fn();

    render(<MultiImageDisplayModeToggle mode="combined" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '多节点显示' }));

    expect(onChange).toHaveBeenCalledWith('split_nodes');
  });
});
