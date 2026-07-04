import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { NanoBananaParamPanel } from './NanoBananaParamPanel';

describe('NanoBananaParamPanel', () => {
  test('renders the fixed quality and ratio options in TapNow order', () => {
    render(
      <NanoBananaParamPanel
        ratio="9:16"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']}
        size="2k"
        sizes={['1k', '2k', '4k']}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    expect(screen.getByTestId('nano-banana-quality-section')).toBeTruthy();
    expect(screen.getByTestId('nano-banana-ratio-section')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1K' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2K' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '4K' })).toBeTruthy();
    expect(screen.getAllByTestId('nano-banana-ratio-item').map((item) => item.getAttribute('data-ratio'))).toEqual([
      '1:1',
      '4:3',
      '3:4',
      '16:9',
      '9:16',
      '3:2',
      '2:3',
      '4:5',
      '5:4',
      '21:9',
    ]);
  });

  test('fires updates when selecting quality and ratio', () => {
    const onChangeRatio = vi.fn();
    const onChangeSize = vi.fn();

    render(
      <NanoBananaParamPanel
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']}
        size="1k"
        sizes={['1k', '2k', '4k']}
        onChangeRatio={onChangeRatio}
        onChangeSize={onChangeSize}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '4K' }));
    fireEvent.click(screen.getByRole('button', { name: '9:16' }));

    expect(onChangeSize).toHaveBeenCalledWith('4k');
    expect(onChangeRatio).toHaveBeenCalledWith('9:16');
  });

  test('keeps all ratio items visible in a fixed two-row non-scrolling grid surface', () => {
    render(
      <NanoBananaParamPanel
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']}
        size="1k"
        sizes={['1k', '2k', '4k']}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('nano-banana-ratio-item')).toHaveLength(10);
  });

  test('does not render generic auto size entries in the Nano Banana panel', () => {
    render(
      <NanoBananaParamPanel
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']}
        size="1k"
        sizes={['1k', '2k', '4k']}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'AUTO' })).toBeNull();
  });

  test('uses compact sizing for the quality and ratio popover', () => {
    render(
      <NanoBananaParamPanel
        ratio="16:9"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '4:5', '5:4', '21:9']}
        size="1k"
        sizes={['1k', '2k', '4k']}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    const panel = screen.getByTestId('nano-banana-param-panel');
    const qualitySection = screen.getByTestId('nano-banana-quality-section');
    const qualityRail = screen.getByTestId('nano-banana-quality-rail');
    const ratioSection = screen.getByTestId('nano-banana-ratio-section');
    const ratioGrid = screen.getByTestId('nano-banana-ratio-grid');
    const activeRatio = screen.getByRole('button', { name: '16:9' });
    const sizeButton = screen.getByRole('button', { name: '1K' });

    expect(panel.style.gap).toBe('10px');
    expect(qualitySection.style.gap).toBe('6px');
    expect(qualityRail.style.borderRadius).toBe('14px');
    expect(sizeButton.style.height).toBe('40px');
    expect(sizeButton.style.fontSize).toBe('16px');
    expect(ratioSection.style.gap).toBe('6px');
    expect(ratioGrid.style.gap).toBe('4px');
    expect(ratioGrid.style.padding).toBe('8px');
    expect(ratioGrid.style.borderRadius).toBe('18px');
    expect(activeRatio.style.minHeight).toBe('58px');
    expect(activeRatio.style.borderRadius).toBe('14px');
  });
});
