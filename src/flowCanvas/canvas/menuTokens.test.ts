import { describe, expect, test } from 'vitest';

import {
  MENU_ITEM_DESC_SIZE,
  MENU_ITEM_GAP,
  MENU_ITEM_HEIGHT,
  MENU_ITEM_ICON_RADIUS,
  MENU_ITEM_ICON_SIZE,
  MENU_ITEM_LABEL_SIZE,
  MENU_ITEM_PADDING,
  MENU_ITEM_RADIUS,
} from './menuTokens';

describe('canvas menu tokens', () => {
  test('match the left add-node menu density baseline', () => {
    expect(MENU_ITEM_HEIGHT).toBe(38);
    expect(MENU_ITEM_LABEL_SIZE).toBe(12);
    expect(MENU_ITEM_DESC_SIZE).toBe(9);
    expect(MENU_ITEM_GAP).toBe(7);
    expect(MENU_ITEM_PADDING).toBe('5px 6px');
    expect(MENU_ITEM_RADIUS).toBe(10);
    expect(MENU_ITEM_ICON_SIZE).toBe(30);
    expect(MENU_ITEM_ICON_RADIUS).toBe(9);
  });
});
