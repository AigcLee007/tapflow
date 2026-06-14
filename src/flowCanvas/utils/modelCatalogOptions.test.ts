import { describe, expect, test } from 'vitest';

import {
  getAspectRatioOptionsFromCatalogModel,
  getDefaultParamsFromUiSchema,
  getKnownImageRouteUserFacingLabel,
  getProductImageModelLabel,
  getSizeOptionsFromCatalogModel,
  mapCatalogModelsToOptions,
  mapCatalogRoutesToRuntimeOptions,
} from './modelCatalogOptions';
import type { AiModelCatalogItem, AiModelCatalogRoute } from '../../services/v2AiModelCatalogApi';

describe('modelCatalogOptions', () => {
  test('maps internal image model keys to product labels before catalog data loads', () => {
    expect(getProductImageModelLabel('pixellelabs.nano-banana-pro')).toBe('Nano Banana Pro');
    expect(getProductImageModelLabel('gemini-3-pro-image-preview')).toBe('Nano Banana Pro');
    expect(getProductImageModelLabel('gemini-3.1-flash-image-preview-4k')).toBe('Nano Banana Pro');
    expect(getProductImageModelLabel('pixellelabs.nano-banana-2')).toBe('Nano Banana 2');
    expect(getProductImageModelLabel('gpt-image-2')).toBe('GPT-Image-2');
  });

  test('maps known official route keys to user-facing route labels before routes load', () => {
    expect(getKnownImageRouteUserFacingLabel('image.pixellelabs.nano-banana-pro')).toBe('Nano Banana Pro 线路一');
    expect(getKnownImageRouteUserFacingLabel('image.mouxihub.nano-banana-pro.t3')).toBe('Nano Banana Pro 线路二（官方T3）');
    expect(getKnownImageRouteUserFacingLabel('image.pixellelabs.nano-banana-2')).toBe('Nano Banana 2 线路一');
    expect(getKnownImageRouteUserFacingLabel('image.gpt-image-2')).toBe('GPT-Image-2 线路一');
    expect(getKnownImageRouteUserFacingLabel('image.gpt-image-2.line2')).toBe('GPT-Image-2 线路二');
  });

  test('maps active v2 image catalog models before config fallback', () => {
    const models = mapCatalogModelsToOptions(
      [
        {
          capabilities: { supportedSizes: ['2K'] },
          defaultRouteKey: 'image.pixellelabs.nano-banana-pro',
          displayName: 'Nano Banana Pro',
          id: 'model-1',
          modality: 'image',
          modelFamily: 'pixellelabs.nano-banana-pro',
          modelId: null,
          modelKey: 'gemini-3-pro-image-preview',
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
        defaultRouteKey: 'image.pixellelabs.nano-banana-pro',
        id: 'pixellelabs.nano-banana-pro',
        label: 'Nano Banana Pro',
        modelKey: 'gemini-3-pro-image-preview',
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
        label: '线路一',
        modelKey: 'nano-banana-pro',
        providerName: 'Visionary',
        routeKey: 'image.nano-banana-pro',
      }),
    );
  });

  test('builds user-facing product route labels without exposing route keys or providers', () => {
    const routes = mapCatalogRoutesToRuntimeOptions([
      {
        estimatedCredits: 100,
        minChargeCredits: 100,
        modality: 'image',
        modelFamily: 'gpt-image-2',
        modelKey: 'gpt-image-2',
        pricingUnit: 'image_generation',
        providerKey: 'openai-compatible',
        providerName: 'SiphonLab OpenAI Compatible',
        routeId: 'route-1',
        routeKey: 'image.gpt-image-2.line2',
        routeLabel: '线路二',
      },
      {
        estimatedCredits: 24,
        minChargeCredits: 24,
        modality: 'image',
        modelFamily: 'pixellelabs.nano-banana-pro',
        modelKey: 'gemini-3-pro-image-preview',
        pricingUnit: 'image_generation',
        providerKey: 'pixellelabs',
        providerName: 'PixelleLabs',
        routeId: 'route-2',
        routeKey: 'image.pixellelabs.nano-banana-pro',
        routeLabel: 'PixelleLabs Pro 线路',
      },
    ] satisfies AiModelCatalogRoute[]);

    expect(routes.map((item) => item.label)).toEqual(['线路二', '线路一']);
    expect(routes.map((item) => item.userFacingLabel)).toEqual([
      'GPT-Image-2 线路二',
      'Nano Banana Pro 线路一',
    ]);
    expect(routes.map((item) => item.userFacingLabel).join(' ')).not.toContain('pixellelabs');
    expect(routes.map((item) => item.userFacingLabel).join(' ')).not.toContain('openai-compatible');
  });

  test('keeps official Nano Banana Pro line labels and pricing stable regardless of route key sort order', () => {
    const routes = mapCatalogRoutesToRuntimeOptions([
      {
        estimatedCredits: 6,
        minChargeCredits: 6,
        modality: 'image',
        modelFamily: 'pixellelabs.nano-banana-pro',
        modelKey: 'gemini-3-pro-image-preview',
        pricingUnit: 'image_generation',
        providerKey: 'mouxihub-openai',
        providerName: 'MouxiHub OpenAI Compatible',
        routeId: 'route-t3',
        routeKey: 'image.mouxihub.nano-banana-pro.t3',
        routeLabel: '线路二（官方T3）',
      },
      {
        estimatedCredits: 24,
        minChargeCredits: 24,
        modality: 'image',
        modelFamily: 'pixellelabs.nano-banana-pro',
        modelKey: 'gemini-3-pro-image-preview',
        pricingUnit: 'image_generation',
        providerKey: 'pixellelabs',
        providerName: 'PixelleLabs',
        routeId: 'route-line-1',
        routeKey: 'image.pixellelabs.nano-banana-pro',
        routeLabel: '线路一',
      },
    ] satisfies AiModelCatalogRoute[]);

    expect(routes.map((item) => item.routeKey)).toEqual([
      'image.pixellelabs.nano-banana-pro',
      'image.mouxihub.nano-banana-pro.t3',
    ]);
    expect(routes.map((item) => item.userFacingLabel)).toEqual([
      'Nano Banana Pro 线路一',
      'Nano Banana Pro 线路二（官方T3）',
    ]);
    expect(routes.map((item) => item.estimatedCredits)).toEqual([24, 6]);
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
      defaultRouteKey: 'image.custom-model',
      id: 'custom-model',
      label: 'Custom Model',
      modelFamily: 'custom-model',
      modelKey: 'custom-model',
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

  test('keeps gpt-image-2 size defaults on the size key only', () => {
    const uiSchema = {
      fields: [
        {
          defaultValue: '1K',
          key: 'size',
          label: 'size tier',
          options: [
            { label: 'auto', value: 'auto' },
            { label: '1024x1024', value: '1024x1024' },
            { label: '1K', value: '1K' },
            { label: '2K', value: '2K' },
            { label: '4K', value: '4K' },
          ],
          type: 'select',
        },
      ],
    };

    expect(getDefaultParamsFromUiSchema(uiSchema)).toEqual({
      size: '1k',
    });
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1024x1024', '1536x1024', '2K'] },
      defaultRouteKey: 'image.gpt-image-2',
      id: 'gpt-image-2',
      label: 'GPT-Image-2',
      modelFamily: 'gpt-image-2',
      modelKey: 'gpt-image-2',
      uiSchema,
    })).toEqual(['auto', '1k', '2k', '4k']);
  });

  test('forces Nano Banana quality options to 1k 2k 4k even when catalog is incomplete', () => {
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1K'] },
      defaultRouteKey: 'image.pixellelabs.nano-banana-pro',
      id: 'pixellelabs.nano-banana-pro',
      label: 'Nano Banana Pro',
      modelFamily: 'pixellelabs.nano-banana-pro',
      modelKey: 'gemini-3-pro-image-preview',
      uiSchema: {},
    })).toEqual(['1k', '2k', '4k']);
  });

  test('forces Nano Banana ratio options to the fixed two-row panel set', () => {
    expect(getAspectRatioOptionsFromCatalogModel({
      capabilities: { supportedAspectRatios: ['1:1'] },
      defaultRouteKey: 'image.pixellelabs.nano-banana-2',
      id: 'pixellelabs.nano-banana-2',
      label: 'Nano Banana 2',
      modelFamily: 'pixellelabs.nano-banana-2',
      modelKey: 'gemini-3.1-flash-image-preview',
      uiSchema: {},
    })).toEqual(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
  });

  test('treats gemini-flash fallback ids as Nano Banana 2 for panel options', () => {
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1K'] },
      defaultRouteKey: 'image.nano-banana-pro-fast',
      id: 'gemini-flash',
      label: 'Nano Banana 2',
      modelFamily: 'gemini-flash',
      modelKey: 'gemini-flash',
      uiSchema: {},
    })).toEqual(['1k', '2k', '4k']);

    expect(getAspectRatioOptionsFromCatalogModel({
      capabilities: { supportedAspectRatios: ['1:1'] },
      defaultRouteKey: 'image.nano-banana-pro-fast',
      id: 'gemini-flash',
      label: 'Nano Banana 2',
      modelFamily: 'gemini-flash',
      modelKey: 'gemini-flash',
      uiSchema: {},
    })).toEqual(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
  });

  test('keeps gpt-image-2 ratio options aligned with the dedicated panel set', () => {
    expect(getAspectRatioOptionsFromCatalogModel({
      capabilities: { supportedAspectRatios: ['1:1', '16:9'] },
      defaultRouteKey: 'image.gpt-image-2',
      id: 'gpt-image-2',
      label: 'GPT-Image-2',
      modelFamily: 'gpt-image-2',
      modelKey: 'gpt-image-2',
      uiSchema: {},
    })).toEqual(['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']);
  });

  test('keeps gpt-image-2 dedicated size fallback options including auto', () => {
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1024x1024'] },
      defaultRouteKey: 'image.gpt-image-2',
      id: 'gpt-image-2',
      label: 'GPT-Image-2',
      modelFamily: 'gpt-image-2',
      modelKey: 'gpt-image-2',
      uiSchema: {},
    })).toEqual(['auto', '1k', '2k', '4k']);
  });

  test('keeps gpt-image-2 dedicated ratio fallback options for the custom panel', () => {
    expect(getAspectRatioOptionsFromCatalogModel({
      capabilities: { supportedAspectRatios: ['1:1'] },
      defaultRouteKey: 'image.gpt-image-2',
      id: 'gpt-image-2',
      label: 'GPT-Image-2',
      modelFamily: 'gpt-image-2',
      modelKey: 'gpt-image-2',
      uiSchema: {},
    })).toEqual(['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']);
  });

  test('forces fixed Nano Banana fallback options for legacy local identities', () => {
    const model = {
      capabilities: { supportedAspectRatios: ['1:1'], supportedSizes: ['2K'] },
      defaultRouteKey: null,
      id: 'nano-banana-pro',
      label: 'Nano Banana Pro',
      modelFamily: 'nano-banana-pro',
      modelKey: 'nano-banana-pro',
      uiSchema: {},
    };

    expect(getSizeOptionsFromCatalogModel(model)).toEqual(['1k', '2k', '4k']);
    expect(getAspectRatioOptionsFromCatalogModel(model)).toEqual([
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ]);
  });

  test('keeps gpt-image-2 size fallback behavior aligned with the dedicated panel set', () => {
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1024x1024', '2K'] },
      defaultRouteKey: 'image.gpt-image-2',
      id: 'gpt-image-2',
      label: 'GPT-Image-2',
      modelFamily: 'gpt-image-2',
      modelKey: 'gpt-image-2',
      uiSchema: {},
    })).toEqual(['auto', '1k', '2k', '4k']);
  });

  test('keeps nano banana helper paths untouched while adding gpt-image-2 panel fallbacks', () => {
    expect(getSizeOptionsFromCatalogModel({
      capabilities: { supportedSizes: ['1K'] },
      defaultRouteKey: 'image.pixellelabs.nano-banana-pro',
      id: 'pixellelabs.nano-banana-pro',
      label: 'Nano Banana Pro',
      modelFamily: 'pixellelabs.nano-banana-pro',
      modelKey: 'gemini-3-pro-image-preview',
      uiSchema: {},
    })).toEqual(['1k', '2k', '4k']);
  });
});
