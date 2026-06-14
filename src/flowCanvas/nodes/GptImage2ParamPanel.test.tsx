import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { GptImage2ParamPanel } from './GptImage2ParamPanel';

describe('GptImage2ParamPanel', () => {
  test('renders the dual-zone GPT-image-2 controls', () => {
    render(
      <GptImage2ParamPanel
        format="jpeg"
        moderation="auto"
        quality="low"
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']}
        size="2k"
        sizes={['auto', '1k', '2k', '4k']}
        onChangeFormat={vi.fn()}
        onChangeModeration={vi.fn()}
        onChangeQuality={vi.fn()}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    const leftZone = screen.getByTestId('gpt-image-2-left-zone');
    const rightZone = screen.getByTestId('gpt-image-2-right-zone');

    expect(screen.getByTestId('gpt-image-2-left-zone')).toBeTruthy();
    expect(screen.getByTestId('gpt-image-2-right-zone')).toBeTruthy();
    expect(within(leftZone).getByRole('button', { name: 'AUTO' })).toBeTruthy();
    expect(within(rightZone).getByRole('button', { name: 'LOW' })).toBeTruthy();
    expect(within(rightZone).getByRole('button', { name: 'JPEG' })).toBeTruthy();
    expect(within(rightZone).getByRole('button', { name: 'AUTO MODERATION' })).toBeTruthy();
    expect(screen.getByText('尺寸')).toBeTruthy();
    expect(screen.getByText('比例')).toBeTruthy();
    expect(screen.getByText('质量')).toBeTruthy();
    expect(screen.getByText('输出格式')).toBeTruthy();
    expect(screen.getByText('审核强度')).toBeTruthy();
    expect(screen.getByText('2K · 1:1 · LOW · JPEG · AUTO')).toBeTruthy();
  });

  test('fires updates for GPT-image-2 controls', () => {
    const onChangeSize = vi.fn();
    const onChangeRatio = vi.fn();
    const onChangeQuality = vi.fn();
    const onChangeFormat = vi.fn();
    const onChangeModeration = vi.fn();

    render(
      <GptImage2ParamPanel
        format="png"
        moderation="auto"
        quality="auto"
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']}
        size="auto"
        sizes={['auto', '1k', '2k', '4k']}
        onChangeFormat={onChangeFormat}
        onChangeModeration={onChangeModeration}
        onChangeQuality={onChangeQuality}
        onChangeRatio={onChangeRatio}
        onChangeSize={onChangeSize}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '4K' }));
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    fireEvent.click(screen.getByRole('button', { name: 'HIGH' }));
    fireEvent.click(screen.getByRole('button', { name: 'WEBP' }));
    fireEvent.click(screen.getByRole('button', { name: 'LOW MODERATION' }));

    expect(onChangeSize).toHaveBeenCalledWith('4k');
    expect(onChangeRatio).toHaveBeenCalledWith('16:9');
    expect(onChangeQuality).toHaveBeenCalledWith('high');
    expect(onChangeFormat).toHaveBeenCalledWith('webp');
    expect(onChangeModeration).toHaveBeenCalledWith('low');
  });

  test('shows all 8 ratio items in the dedicated GPT-image-2 panel', () => {
    render(
      <GptImage2ParamPanel
        format="png"
        moderation="auto"
        quality="auto"
        ratio="1:1"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']}
        size="auto"
        sizes={['auto', '1k', '2k', '4k']}
        onChangeFormat={vi.fn()}
        onChangeModeration={vi.fn()}
        onChangeQuality={vi.fn()}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'].forEach((value) => {
      expect(screen.getByRole('button', { name: value })).toBeTruthy();
    });
  });

  test('keeps the right-side controls readable with balanced panel spacing', () => {
    render(
      <GptImage2ParamPanel
        format="webp"
        moderation="low"
        quality="medium"
        ratio="21:9"
        ratios={['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']}
        size="4k"
        sizes={['auto', '1k', '2k', '4k']}
        onChangeFormat={vi.fn()}
        onChangeModeration={vi.fn()}
        onChangeQuality={vi.fn()}
        onChangeRatio={vi.fn()}
        onChangeSize={vi.fn()}
      />,
    );

    const panel = screen.getByTestId('gpt-image-2-param-panel') as HTMLDivElement;
    const mediumChip = screen.getByRole('button', { name: 'MEDIUM' }) as HTMLButtonElement;

    expect(panel.style.gap).toBe('20px');
    expect(panel.style.gridTemplateColumns).toBe('minmax(0, 1.55fr) minmax(320px, 1fr)');
    expect(mediumChip.style.fontSize).toBe('14px');
    expect(mediumChip.style.whiteSpace).toBe('nowrap');
  });
});
