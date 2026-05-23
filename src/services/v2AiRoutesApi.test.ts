import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { listRuntimeRoutes } from './v2AiRoutesApi';
import { clearStoredAuth, setStoredTokens } from './v2HttpClient';

describe('v2AiRoutesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({
      accessToken: 'test-token',
      refreshToken: 'refresh-token',
    });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
  });

  test('listRuntimeRoutes requests image runtime routes with auth header', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            estimatedCredits: 100,
            minChargeCredits: 100,
            modality: 'image',
            modelDisplayName: 'Mock Image Model',
            modelKey: 'mock-image-v1',
            pricingUnit: 'image_generation',
            providerKey: 'mock-local-dev',
            providerName: 'Mock Local Provider',
            routeKey: 'image.default',
          },
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await listRuntimeRoutes('image');

    expect(response).toEqual([
      {
        estimatedCredits: 100,
        minChargeCredits: 100,
        modality: 'image',
        modelDisplayName: 'Mock Image Model',
        modelKey: 'mock-image-v1',
        pricingUnit: 'image_generation',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Local Provider',
        routeKey: 'image.default',
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/ai/routes?modality=image',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        method: 'GET',
      }),
    );
  });
});

