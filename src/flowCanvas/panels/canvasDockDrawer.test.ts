import { describe, expect, test } from 'vitest';

import { getCanvasDockBadge, getCanvasDockDrawerLayout } from '../utils/canvasDockPanel';

describe('getCanvasDockDrawerLayout', () => {
  test('anchors drawer 8px after the scaled dock visual edge', () => {
    expect(getCanvasDockDrawerLayout({
      dockLeft: 16,
      viewportHeight: 900,
      viewportWidth: 1440,
    })).toMatchObject({
      left: 66,
      width: 320,
      top: 24,
    });
  });

  test('caps width on narrow viewports', () => {
    const layout = getCanvasDockDrawerLayout({
      dockLeft: 8,
      viewportHeight: 720,
      viewportWidth: 390,
    });

    expect(layout.left).toBe(58);
    expect(layout.width).toBeLessThanOrEqual(308);
    expect(layout.maxHeight).toBe(672);
  });

  test('returns badge count for unresolved comments and dot badges for assets/history', () => {
    expect(getCanvasDockBadge('assets', {
      assetTotal: 12,
      historySnapshotCount: 0,
      unresolvedCommentCount: 0,
    })).toEqual({ tone: 'dot' });

    expect(getCanvasDockBadge('comments', {
      assetTotal: 0,
      historySnapshotCount: 0,
      unresolvedCommentCount: 3,
    })).toEqual({ count: 3, tone: 'count' });

    expect(getCanvasDockBadge('history', {
      assetTotal: 0,
      historySnapshotCount: 1,
      unresolvedCommentCount: 0,
    })).toEqual({ tone: 'dot' });

    expect(getCanvasDockBadge('templates', {
      assetTotal: 99,
      historySnapshotCount: 99,
      unresolvedCommentCount: 99,
    })).toBeNull();
  });
});
