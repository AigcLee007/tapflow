import { describe, expect, test } from 'vitest';

import { getAnchoredFlyoutPosition } from './flyoutLayout';

describe('getAnchoredFlyoutPosition', () => {
  test('keeps add menu visually attached to the left rail near the anchor top', () => {
    expect(
      getAnchoredFlyoutPosition({
        anchorRect: { top: 124, right: 74 },
        viewportWidth: 1440,
        viewportHeight: 900,
        panelWidth: 224,
        panelMaxHeight: 560,
        offsetLeft: 8,
        offsetTop: -10,
      }),
    ).toEqual({
      left: 82,
      top: 114,
      maxHeight: 560,
    });
  });

  test('clamps the menu back into the viewport when the panel would overflow', () => {
    expect(
      getAnchoredFlyoutPosition({
        anchorRect: { top: 40, right: 300 },
        viewportWidth: 360,
        viewportHeight: 280,
        panelWidth: 224,
        panelMaxHeight: 560,
        offsetLeft: 8,
        offsetTop: -10,
      }),
    ).toEqual({
      left: 120,
      top: 16,
      maxHeight: 300,
    });
  });
});
