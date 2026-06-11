import { describe, expect, test } from 'vitest';

import { normalizeViewportForCanvasDensity } from './viewportDensity';

describe('normalizeViewportForCanvasDensity', () => {
  test('scales legacy zoom-1 viewport to match denser canvas framing', () => {
    expect(
      normalizeViewportForCanvasDensity({ x: 240, y: 120, zoom: 1 }),
    ).toEqual({ x: 182.4, y: 91.2, zoom: 0.76 });
  });

  test('does not rescale already-normalized viewport', () => {
    expect(
      normalizeViewportForCanvasDensity({ x: 182.4, y: 91.2, zoom: 0.76 }),
    ).toEqual({ x: 182.4, y: 91.2, zoom: 0.76 });
  });

  test('does not rescale intentionally zoomed-in viewport', () => {
    expect(
      normalizeViewportForCanvasDensity({ x: 300, y: 150, zoom: 1.35 }),
    ).toEqual({ x: 300, y: 150, zoom: 1.35 });
  });
});
