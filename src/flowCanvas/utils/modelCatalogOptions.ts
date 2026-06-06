import type {
  AiModelCatalogItem,
  AiModelCatalogRoute,
} from '../../services/v2AiModelCatalogApi';
import type { ImageModelConfig } from '../../config/imageModels';
import type { RuntimeRouteOption } from './runtimeRouteOptions';

export type ModelCatalogOption = {
  capabilities: Record<string, unknown>;
  defaultRouteKey: string | null;
  id: string;
  label: string;
  modelFamily: string;
  uiSchema: Record<string, unknown>;
};

type UiFieldOption = {
  label?: string;
  value?: boolean | number | string;
};

export type UiSchemaField = {
  defaultValue?: unknown;
  key: string;
  label: string;
  max?: number;
  min?: number;
  options?: UiFieldOption[];
  step?: number;
  type: 'boolean' | 'number' | 'select' | 'slider' | 'text' | 'textarea';
};

const normalizeKey = (value: unknown) => String(value || '').trim();

const normalizeSize = (value: unknown) => {
  const raw = normalizeKey(value);
  return raw ? raw.toLowerCase() : raw;
};

export function mapCatalogModelsToOptions(
  items: AiModelCatalogItem[],
  fallbackModels: ImageModelConfig[],
): ModelCatalogOption[] {
  const source = items.length
    ? items
        .filter((item) => item.modality === 'image' && item.status !== 'inactive')
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
          return left.displayName.localeCompare(right.displayName);
        })
        .map((item) => ({
          capabilities: item.capabilities ?? {},
          defaultRouteKey: item.defaultRouteKey,
          id: item.modelKey,
          label: item.displayName || item.modelKey,
          modelFamily: item.modelFamily || item.modelKey,
          uiSchema: item.uiSchema ?? {},
        }))
    : fallbackModels
        .filter((model) => model.isActive !== false)
        .map((model) => ({
          capabilities: {
            supportedAspectRatios: model.extraAspectRatios ?? [],
            supportedSizes: model.sizeOptions ?? [],
          },
          defaultRouteKey: null,
          id: model.id,
          label: model.label || model.id,
          modelFamily: model.modelFamily || model.id,
          uiSchema: {},
        }));

  const seen = new Set<string>();
  return source.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function mapCatalogRoutesToRuntimeOptions(routes: AiModelCatalogRoute[]): RuntimeRouteOption[] {
  const seen = new Set<string>();
  const result: RuntimeRouteOption[] = [];

  for (const item of [...routes].sort((left, right) => left.routeKey.localeCompare(right.routeKey))) {
    const routeKey = normalizeKey(item.routeKey);
    if (!routeKey || seen.has(routeKey)) continue;
    seen.add(routeKey);

    const routeLabel = normalizeKey(item.routeLabel) || routeKey;
    result.push({
      estimatedCredits: item.estimatedCredits ?? item.minChargeCredits ?? null,
      label: routeLabel,
      minChargeCredits: item.minChargeCredits ?? item.estimatedCredits ?? null,
      modelDisplayName: item.modelKey,
      modelKey: item.modelKey,
      pricingUnit: item.pricingUnit ?? null,
      providerKey: item.providerKey,
      providerName: item.providerName,
      routeKey,
    });
  }

  return result;
}

export function getCatalogUiFields(uiSchema: Record<string, unknown> | null | undefined): UiSchemaField[] {
  const fields = Array.isArray(uiSchema?.fields) ? uiSchema.fields : [];
  return fields
    .map((field) => {
      if (!field || typeof field !== 'object') return null;
      const record = field as Record<string, unknown>;
      const key = normalizeKey(record.key);
      const rawType = normalizeKey(record.type);
      if (!key || !['boolean', 'number', 'select', 'slider', 'text', 'textarea'].includes(rawType)) {
        return null;
      }
      return {
        defaultValue: record.defaultValue,
        key,
        label: normalizeKey(record.label) || key,
        max: typeof record.max === 'number' ? record.max : undefined,
        min: typeof record.min === 'number' ? record.min : undefined,
        options: Array.isArray(record.options) ? (record.options as UiFieldOption[]) : undefined,
        step: typeof record.step === 'number' ? record.step : undefined,
        type: rawType as UiSchemaField['type'],
      };
    })
    .filter((field): field is UiSchemaField => Boolean(field));
}

export function getDefaultParamsFromUiSchema(uiSchema: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of getCatalogUiFields(uiSchema)) {
    if (field.defaultValue !== undefined) {
      params[field.key] = field.defaultValue;
      if (field.key === 'aspectRatio') params.aspect_ratio = field.defaultValue;
      if (field.key === 'imageSize') params.size = normalizeSize(field.defaultValue);
    }
  }
  return params;
}

export function getAspectRatioOptionsFromCatalogModel(model: ModelCatalogOption | null | undefined): string[] {
  const fields = getCatalogUiFields(model?.uiSchema);
  const aspectField = fields.find((field) => field.key === 'aspectRatio' || field.key === 'aspect_ratio');
  const fromField = aspectField?.options
    ?.map((option) => normalizeKey(option.value))
    .filter(Boolean) ?? [];
  const fromCapabilities = Array.isArray(model?.capabilities?.supportedAspectRatios)
    ? (model!.capabilities.supportedAspectRatios as unknown[]).map(normalizeKey).filter(Boolean)
    : [];
  return Array.from(new Set([...fromField, ...fromCapabilities]));
}

export function getSizeOptionsFromCatalogModel(model: ModelCatalogOption | null | undefined): string[] {
  const fields = getCatalogUiFields(model?.uiSchema);
  const sizeField = fields.find((field) => field.key === 'imageSize' || field.key === 'size');
  const fromField = sizeField?.options
    ?.map((option) => normalizeSize(option.value))
    .filter(Boolean) ?? [];
  const fromCapabilities = Array.isArray(model?.capabilities?.supportedSizes)
    ? (model!.capabilities.supportedSizes as unknown[]).map(normalizeSize).filter(Boolean)
    : [];
  return Array.from(new Set([...fromField, ...fromCapabilities]));
}
