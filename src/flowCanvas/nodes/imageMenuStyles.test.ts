import { describe, expect, test } from 'vitest';

import { IMAGE_MENU_ITEM_MIN_HEIGHT, IMAGE_MENU_SURFACE_Z_INDEX } from './imageMenuStyles';

describe('image menu style tokens', () => {
  test('keeps image menus above floating toolbars with add-menu density', () => {
    expect(IMAGE_MENU_SURFACE_Z_INDEX).toBeGreaterThanOrEqual(2200);
    expect(IMAGE_MENU_ITEM_MIN_HEIGHT).toBe(38);
  });
});
