import { describe, expect, test } from 'vitest';

import type { V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';
import { mapImageRuntimeRouteOptions } from './runtimeRouteOptions';

describe('mapImageRuntimeRouteOptions', () => {
  test('keeps distinct route keys even when provider/model are the same', () => {
    const input: V2RuntimeRouteItem[] = [
      {
        modality: 'image',
        modelDisplayName: 'Mock Image',
        modelKey: 'mock-image-v1',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Provider',
        routeKey: 'image.default',
      },
      {
        modality: 'image',
        modelDisplayName: 'Mock Image',
        modelKey: 'mock-image-v1',
        providerKey: 'mock-local-dev',
        providerName: 'Mock Provider',
        routeKey: 'image.fail',
      },
    ];

    const options = mapImageRuntimeRouteOptions(input);

    expect(options.map((item) => item.routeKey)).toEqual(['image.default', 'image.fail']);
    expect(options.map((item) => item.label)).toEqual([
      'Mock Image · image.default',
      'Mock Image · image.fail',
    ]);
  });
});

