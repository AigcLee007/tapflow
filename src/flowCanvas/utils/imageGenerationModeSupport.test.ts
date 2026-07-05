import { describe, expect, test } from 'vitest';

import type { RuntimeRouteOption } from './runtimeRouteOptions';
import {
  isImageGenerationModeSupportedByRoute,
  resolveImageGenerationModeRunBlocker,
  resolveSupportedImageGenerationModes,
} from './imageGenerationModeSupport';

function route(overrides: Partial<RuntimeRouteOption> = {}): RuntimeRouteOption {
  return {
    estimatedCredits: 100,
    label: 'Mock Image - image.default',
    minChargeCredits: 100,
    modelDisplayName: 'Mock Image',
    modelKey: 'mock-image',
    pricingUnit: 'image_generation',
    providerKey: 'mock-provider',
    providerName: 'Mock Provider',
    routeKey: 'image.default',
    supportedGenerationModes: ['standard'],
    ...overrides,
  };
}

describe('imageGenerationModeSupport', () => {
  test('treats standard as the only safe fallback when a route has no explicit capabilities', () => {
    expect(resolveSupportedImageGenerationModes(route({ supportedGenerationModes: undefined }))).toEqual(['standard']);
    expect(isImageGenerationModeSupportedByRoute('standard', null)).toBe(true);
    expect(isImageGenerationModeSupportedByRoute('panorama_360', null)).toBe(false);
  });

  test('allows production modes only when the route declares them', () => {
    const supportedRoute = route({
      supportedGenerationModes: ['standard', 'panorama_360', 'wraparound_270'],
    });

    expect(isImageGenerationModeSupportedByRoute('panorama_360', supportedRoute)).toBe(true);
    expect(isImageGenerationModeSupportedByRoute('wraparound_270', supportedRoute)).toBe(true);
    expect(isImageGenerationModeSupportedByRoute('subject_orbit_270', supportedRoute)).toBe(false);
  });

  test('blocks production modes without route support or pricing', () => {
    expect(resolveImageGenerationModeRunBlocker({
      mode: 'panorama_360',
      route: route({ supportedGenerationModes: ['standard'] }),
    })).toMatchObject({
      code: 'UNSUPPORTED_GENERATION_MODE',
    });

    expect(resolveImageGenerationModeRunBlocker({
      mode: 'wraparound_270',
      route: route({
        estimatedCredits: null,
        minChargeCredits: null,
        supportedGenerationModes: ['standard', 'wraparound_270'],
      }),
    })).toMatchObject({
      code: 'PRICING_NOT_FOUND',
    });

    expect(resolveImageGenerationModeRunBlocker({
      mode: 'subject_orbit_270',
      route: route({
        estimatedCredits: 160,
        minChargeCredits: 160,
        supportedGenerationModes: ['standard', 'subject_orbit_270'],
      }),
    })).toBeNull();
  });
});
