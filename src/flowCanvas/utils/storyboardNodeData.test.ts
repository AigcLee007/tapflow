import { describe, expect, it } from 'vitest';

import {
  getStoryboardGridCellCount,
  normalizeStoryboardData,
  patchStoryboardCell,
} from './storyboardNodeData';

describe('storyboardNodeData', () => {
  it('normalizes unsafe cell media fields away', () => {
    const data = normalizeStoryboardData({
      composedAssetId: 'https://signed.example.com/storyboard.png',
      grid: '3x2',
      aspect: '16:9',
      selectedIndex: 50,
      cells: [
        {
          id: 'a',
          shotNo: 1,
          assetId: 'blob:test',
          sourceAssetId: 'data:image/png;base64,bad',
          imageUrl: 'blob:test',
          prompt: 'wide shot',
        },
      ],
    } as any);

    expect(data.selectedIndex).toBe(5);
    expect(data.composedAssetId).toBeUndefined();
    expect(data.cells[0]).toEqual({
      id: 'a',
      shotNo: 1,
      prompt: 'wide shot',
    });
    expect(JSON.stringify(data)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('normalizes unsafe storyboard reference ids away', () => {
    const data = normalizeStoryboardData({
      grid: '2x2',
      cells: [
        {
          id: 'blob:cell-id',
          shotNo: 1,
          sourceNodeId: 'https://signed.example.com/source-node',
          directorCameraId: 'data:camera-id',
          directorShotId: 'blob:shot-id',
          title: 'reference cleanup',
        },
      ],
    } as any);

    expect(data.cells[0]).toEqual({
      id: 'storyboard-cell-1',
      shotNo: 1,
      title: 'reference cleanup',
    });
    expect(JSON.stringify(data)).not.toMatch(/blob:|data:|https?:\/\//);
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
