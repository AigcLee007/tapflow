import { describe, expect, test } from 'vitest';

import {
  IMAGE_MENU_ITEM_MIN_HEIGHT,
  IMAGE_MENU_SURFACE_Z_INDEX,
  IMAGE_MODEL_MENU_LABEL_FONT_SIZE,
  IMAGE_MODEL_MENU_LABEL_FONT_WEIGHT,
  IMAGE_MODEL_MENU_WIDTH,
} from './imageMenuStyles';

describe('image menu style tokens', () => {
  test('keeps image menus above floating toolbars with add-menu density', () => {
    expect(IMAGE_MENU_SURFACE_Z_INDEX).toBeGreaterThanOrEqual(10020);
    expect(IMAGE_MENU_ITEM_MIN_HEIGHT).toBe(38);
    expect(IMAGE_MODEL_MENU_WIDTH).toBe(320);
    expect(IMAGE_MODEL_MENU_LABEL_FONT_SIZE).toBe(12);
    expect(IMAGE_MODEL_MENU_LABEL_FONT_WEIGHT).toBe(700);
  });
});
