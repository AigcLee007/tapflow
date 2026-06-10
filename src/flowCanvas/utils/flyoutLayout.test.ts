import { describe, expect, test } from 'vitest';

import { getAnchoredFlyoutPosition } from './flyoutLayout';

describe('getAnchoredFlyoutPosition', () => {
  test('keeps add menu visually attached to the left rail while leaving header clearance', () => {
    expect(
      getAnchoredFlyoutPosition({
        anchorRect: { top: 124, right: 74 },
        viewportWidth: 1440,
        viewportHeight: 900,
        panelWidth: 224,
        panelMaxHeight: 560,
        offsetLeft: 8,
        offsetTop: -12,
        margin: 24,
      }),
    ).toEqual({
      left: 82,
      top: 112,
      maxHeight: 560,
    });
  });

  test('can align user menu with the same horizontal gap as the add menu', () => {
    expect(
      getAnchoredFlyoutPosition({
        anchorRect: { top: 420, right: 74 },
        viewportWidth: 1440,
        viewportHeight: 900,
        panelWidth: 252,
        panelMaxHeight: 372,
        offsetLeft: 8,
        offsetTop: -250,
        margin: 24,
      }),
    ).toEqual({
      left: 82,
      top: 170,
      maxHeight: 372,
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
        offsetTop: -12,
        margin: 24,
      }),
    ).toEqual({
      left: 112,
      top: 24,
      maxHeight: 300,
    });
  });
});
