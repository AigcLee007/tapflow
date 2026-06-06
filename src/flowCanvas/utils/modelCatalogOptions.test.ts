import { describe, expect, test } from 'vitest';

import {
  getAspectRatioOptionsFromCatalogModel,
  getDefaultParamsFromUiSchema,
  getSizeOptionsFromCatalogModel,
  mapCatalogModelsToOptions,
  mapCatalogRoutesToRuntimeOptions,
} from './modelCatalogOptions';
import type { AiModelCatalogItem, AiModelCatalogRoute } from '../../services/v2AiModelCatalogApi';

describe('modelCatalogOptions', () => {
  test('maps active v2 image catalog models before config fallback', () => {
    const models = mapCatalogModelsToOptions(
      [
        {
          capabilities: { supportedSizes: ['2K'] },
          defaultRouteKey: 'image.nano-banana-pro',
          displayName: 'Nano Banana Pro',
          id: 'model-1',
          modality: 'image',
          modelFamily: 'nano-banana-pro',
          modelId: null,
          modelKey: 'nano-banana-pro',
          sortOrder: 2,
          status: 'active',
          uiSchema: {},
        },
        {
          capabilities: {},
          defaultRouteKey: 'text.default',
          displayName: 'Text',
          id: 'model-2',
          modality: 'text',
          modelFamily: 'text',
          modelId: null,
          modelKey: 'text.default',
          sortOrder: 1,
          status: 'active',
          uiSchema: {},
        },
      ] satisfies AiModelCatalogItem[],
      [
        {
          id: 'fallback',
          label: 'Fallback',
          modelFamily: 'fallback',
          routeFamily: 'fallback',
        },
      ],
    );

    expect(models).toEqual([
      expect.objectContaining({
        defaultRouteKey: 'image.nano-banana-pro',
        id: 'nano-banana-pro',
        label: 'Nano Banana Pro',
      }),
    ]);
  });

  test('maps only model-scoped routes returned by the catalog route endpoint', () => {
    const routes = mapCatalogRoutesToRuntimeOptions([
      {
        estimatedCredits: 24,
        minChargeCredits: 24,
        modality: 'image',
        modelFamily: 'nano-banana-pro',
        modelKey: 'nano-banana-pro',
        pricingUnit: 'image_generation',
        providerKey: 'visionary',
        providerName: 'Visionary',
        routeId: 'route-1',
        routeKey: 'image.nano-banana-pro',
        routeLabel: 'Visionary stable',
      },
      {
        estimatedCredits: 99,
        minChargeCredits: 99,
        modality: 'image',
        modelFamily: 'nano-banana-pro',
        modelKey: 'nano-banana-pro',
        pricingUnit: 'image_generation',
        providerKey: 'duplicate',
        providerName: 'Duplicate',
        routeId: 'route-duplicate',
        routeKey: 'image.nano-banana-pro',
        routeLabel: 'Duplicate',
      },
    ] satisfies AiModelCatalogRoute[]);

    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual(
      expect.objectContaining({
        estimatedCredits: 24,
        label: 'Visionary stable',
        modelKey: 'nano-banana-pro',
        providerName: 'Visionary',
        routeKey: 'image.nano-banana-pro',
      }),
    );
  });

  test('derives canvas params and selectors from uiSchema', () => {
    const uiSchema = {
      fields: [
        {
          defaultValue: '16:9',
          key: 'aspectRatio',
          label: '比例',
          options: [{ label: '16:9', value: '16:9' }],
          type: 'select',
        },
        {
          defaultValue: '2K',
          key: 'imageSize',
          label: '分辨率',
          options: [{ label: '2K', value: '2K' }],
          type: 'select',
        },
        {
          defaultValue: false,
          key: 'optimizeChineseText',
          label: 'AI 增强中文',
          type: 'boolean',
        },
      ],
    };
    const model = {
      capabilities: { supportedAspectRatios: ['1:1'], supportedSizes: ['4K'] },
      defaultRouteKey: 'image.nano-banana-pro',
      id: 'nano-banana-pro',
      label: 'Nano Banana Pro',
      modelFamily: 'nano-banana-pro',
      uiSchema,
    };

    expect(getDefaultParamsFromUiSchema(uiSchema)).toEqual({
      aspectRatio: '16:9',
      aspect_ratio: '16:9',
      imageSize: '2K',
      optimizeChineseText: false,
      size: '2k',
    });
    expect(getAspectRatioOptionsFromCatalogModel(model)).toEqual(['16:9', '1:1']);
    expect(getSizeOptionsFromCatalogModel(model)).toEqual(['2k', '4k']);
  });
});
