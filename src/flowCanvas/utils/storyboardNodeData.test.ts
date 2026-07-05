import { describe, expect, it } from 'vitest';

import {
  getStoryboardGridCellCount,
  normalizeStoryboardData,
  patchStoryboardCell,
} from './storyboardNodeData';

describe('storyboardNodeData', () => {
  it('normalizes unsafe cell media fields away', () => {
    const data = normalizeStoryboardData({
      grid: '3x2',
      aspect: '16:9',
      selectedIndex: 50,
      cells: [
        { id: 'a', shotNo: 1, assetId: 'asset-1', imageUrl: 'blob:test', prompt: 'wide shot' },
      ],
    } as any);

    expect(data.selectedIndex).toBe(5);
    expect(data.cells[0]).toEqual({
      id: 'a',
      shotNo: 1,
      assetId: 'asset-1',
      prompt: 'wide shot',
    });
    expect(JSON.stringify(data)).not.toMatch(/blob:test/);
  });

  it('patches a storyboard cell by index', () => {
    const data = normalizeStoryboardData({ grid: '2x2', cells: [] });
    const next = patchStoryboardCell(data, 1, { assetId: 'asset-2', prompt: 'close up' });

    expect(next.cells[1]).toMatchObject({
      assetId: 'asset-2',
      prompt: 'close up',
      shotNo: 2,
    });
    expect(getStoryboardGridCellCount('2x2')).toBe(4);
  });
});
