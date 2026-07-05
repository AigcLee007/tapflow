import { describe, expect, test } from 'vitest';

import type { V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';
import { getOfficialFallbackImageRuntimeRoutes, mapImageRuntimeRouteOptions } from './runtimeRouteOptions';

describe('mapImageRuntimeRouteOptions', () => {
  test('keeps distinct route keys and pricing hints even when provider/model are the same', () => {
    const input: V2RuntimeRouteItem[] = [
      {
        capabilities: {
          supportedGenerationModes: ['standard', 'panorama_360', 'wraparound_270'],
        },
        estimatedCredits: 100,
        minChargeCredits: 100,
        modality: 'image',
        modelDisplayName: 'Mock Image',
        modelKey: 'mock-image-v1',
        pricingUnit: 'image_generation',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Provider',
        routeKey: 'image.default',
      },
      {
        capabilities: {
          supportedGenerationModes: ['standard'],
        },
        estimatedCredits: 120,
        minChargeCredits: 120,
        modality: 'image',
        modelDisplayName: 'Mock Image',
        modelKey: 'mock-image-v1',
        pricingUnit: 'image_generation',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Provider',
        routeKey: 'image.fail',
      },
    ];

    const options = mapImageRuntimeRouteOptions(input);

    expect(options.map((item) => item.routeKey)).toEqual(['image.default', 'image.fail']);
    expect(options.map((item) => item.label)).toEqual([
      'Mock Image - image.default',
      'Mock Image - image.fail',
    ]);
    expect(options.map((item) => item.estimatedCredits)).toEqual([100, 120]);
    expect(options[0]?.supportedGenerationModes).toEqual(['standard', 'panorama_360', 'wraparound_270']);
    expect(options[1]?.supportedGenerationModes).toEqual(['standard']);
  });

  test('falls back to standard-only when a route does not declare generation-mode support', () => {
    const options = mapImageRuntimeRouteOptions([
      {
        estimatedCredits: 100,
        minChargeCredits: 100,
        modality: 'image',
        modelDisplayName: 'Legacy Image',
        modelKey: 'legacy-image',
        pricingUnit: 'image_generation',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Provider',
        routeKey: 'image.legacy',
      },
    ]);

    expect(options[0]?.supportedGenerationModes).toEqual(['standard']);
  });

  test('limits GPT-Image-2 official fallback routes to line one and line two only', () => {
    const options = getOfficialFallbackImageRuntimeRoutes('gpt-image-2');

    expect(options.map((item) => item.routeKey)).toEqual([
      'image.gpt-image-2',
      'image.gpt-image-2.line2',
    ]);
  });
});
