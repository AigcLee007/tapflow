import type { Viewport } from '@xyflow/react';

const LEGACY_DENSITY_MIN_ZOOM = 0.95;
const LEGACY_DENSITY_MAX_ZOOM = 1.12;
const CANVAS_DENSITY_SCALE = 0.67;

export function normalizeViewportForCanvasDensity(viewport: Viewport): Viewport {
  const zoom = Number(viewport.zoom || 1);
  if (zoom < LEGACY_DENSITY_MIN_ZOOM || zoom > LEGACY_DENSITY_MAX_ZOOM) {
    return viewport;
  }

  return {
    x: Number(viewport.x || 0) * CANVAS_DENSITY_SCALE,
    y: Number(viewport.y || 0) * CANVAS_DENSITY_SCALE,
    zoom: zoom * CANVAS_DENSITY_SCALE,
  };
}

export const canvasDensityScale = CANVAS_DENSITY_SCALE;
