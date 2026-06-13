import { describe, expect, test } from 'vitest';

import { resolveActiveImageRuntimeRouteKey, type ImageRuntimeRouteLike } from './imageRuntimeRouteSelection';

const routes: ImageRuntimeRouteLike[] = [
  { routeKey: 'image.pixellelabs.nano-banana-pro' },
  { routeKey: 'image.pixellelabs.nano-banana-2' },
];

describe('resolveActiveImageRuntimeRouteKey', () => {
  test('ignores the generic image.default route when a model-scoped route is available', () => {
    expect(resolveActiveImageRuntimeRouteKey({
      normalizedCurrentRouteKey: 'image.default',
      preferredRouteKey: 'image.pixellelabs.nano-banana-pro',
      selectedRouteKey: 'image.pixellelabs.nano-banana-pro',
      visibleRoutes: routes,
    })).toBe('image.pixellelabs.nano-banana-pro');
  });

  test('keeps an explicitly selected route when it belongs to the current model routes', () => {
    expect(resolveActiveImageRuntimeRouteKey({
      normalizedCurrentRouteKey: 'image.pixellelabs.nano-banana-2',
      preferredRouteKey: 'image.pixellelabs.nano-banana-pro',
      selectedRouteKey: 'image.pixellelabs.nano-banana-pro',
      visibleRoutes: routes,
    })).toBe('image.pixellelabs.nano-banana-2');
  });

  test('falls back to the preferred route before stale node data', () => {
    expect(resolveActiveImageRuntimeRouteKey({
      normalizedCurrentRouteKey: 'image.unknown',
      preferredRouteKey: 'image.pixellelabs.nano-banana-pro',
      selectedRouteKey: null,
      visibleRoutes: [],
    })).toBe('image.pixellelabs.nano-banana-pro');
  });
});
