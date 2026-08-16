import { useEffect, useMemo, useState } from 'react';

import {
  ensureImageModelCatalogLoaded,
  getImageModelCatalogSnapshot,
  subscribeImageModelCatalog,
  type ImageModelCatalogShape,
  type ImageModelConfig,
} from '../config/imageModels';
import { listAiModelCatalog, type AiModelCatalogItem } from '../services/v2AiModelCatalogApi';
import {
  getAspectRatioOptionsFromCatalogModel,
  getDefaultParamsFromUiSchema,
  getSizeOptionsFromCatalogModel,
  mapCatalogModelsToOptions,
} from '../flowCanvas/utils/modelCatalogOptions';

let imageModelCatalogV2Cache: AiModelCatalogItem[] | null = null;
let imageModelCatalogV2Request: Promise<AiModelCatalogItem[]> | null = null;

const loadV2ImageModelCatalog = () => {
  if (imageModelCatalogV2Cache) return Promise.resolve(imageModelCatalogV2Cache);
  if (!imageModelCatalogV2Request) {
    imageModelCatalogV2Request = listAiModelCatalog('image')
      .then((items) => {
        imageModelCatalogV2Cache = items;
        return items;
      })
      .finally(() => {
        imageModelCatalogV2Request = null;
      });
  }
  return imageModelCatalogV2Request;
};

function mapV2CatalogToImageModels(
  items: AiModelCatalogItem[],
): ImageModelConfig[] {
  const mapped = mapCatalogModelsToOptions(items, []);

  return mapped.map((item, index) => {
    const sizeOptions = getSizeOptionsFromCatalogModel(item);
    const aspectRatios = getAspectRatioOptionsFromCatalogModel(item);
    const defaultParams = getDefaultParamsFromUiSchema(item.uiSchema);
    const defaultSizeCandidate =
      typeof defaultParams.size === 'string' ? String(defaultParams.size).toLowerCase() : '';
    const defaultSize = defaultSizeCandidate || sizeOptions[0] || '1k';

    return {
      defaultSize,
      description: '',
      extraAspectRatios: aspectRatios.filter((value) => value !== '1:1'),
      iconKind: 'banana',
      id: item.id,
      isActive: true,
      isDefaultModel: index === 0,
      label: item.label,
      modelFamily: item.modelFamily || item.modelKey || item.id,
      panelLayout: 'default',
      requestModel: item.modelKey,
      routeFamily: item.modelFamily || item.modelKey || item.id,
      selectorCost: 0,
      showSizeSelector: true,
      sizeBehavior: 'passthrough',
      sizeOptions: sizeOptions.length > 0 ? sizeOptions : [defaultSize],
      sortOrder: index,
      supportsCustomRatio: true,
    } satisfies ImageModelConfig;
  });
}

export const useImageModelCatalog = () => {
  const [catalog, setCatalog] = useState<ImageModelCatalogShape>(() => getImageModelCatalogSnapshot());
  const [v2Catalog, setV2Catalog] = useState<AiModelCatalogItem[]>(() => imageModelCatalogV2Cache ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const syncCatalog = () => {
      if (!active) return;
      setCatalog(getImageModelCatalogSnapshot());
    };

    const unsubscribe = subscribeImageModelCatalog(syncCatalog);
    syncCatalog();
    setLoading(true);

    Promise.allSettled([ensureImageModelCatalogLoaded(), loadV2ImageModelCatalog()])
      .then((results) => {
        if (!active) return;
        syncCatalog();
        const v2Result = results[1];
        if (v2Result.status === 'fulfilled') {
          setV2Catalog(v2Result.value);
        } else {
          setV2Catalog(imageModelCatalogV2Cache ?? []);
        }
        const firstError = results.find((item) => item.status === 'rejected') as PromiseRejectedResult | undefined;
        setError(firstError ? (firstError.reason as Error)?.message || 'Failed to load image model catalog' : null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const models = useMemo(
    () => mapV2CatalogToImageModels(v2Catalog),
    [v2Catalog],
  );

  return {
    catalog,
    loading,
    error,
    models,
  };
};
