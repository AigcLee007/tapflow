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
  modelKey: string;
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
const ROUTE_NUMBER_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const MODEL_DISPLAY_NAME_BY_FAMILY_OR_MODEL: Record<string, string> = {
  'gemini-3-pro-image-preview': 'Nano Banana Pro',
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
  'gpt-image-2': 'GPT-Image-2',
  'image.gpt-image-2': 'GPT-Image-2',
  'image.gpt-image-2.line2': 'GPT-Image-2',
  'image.pixellelabs.nano-banana-2': 'Nano Banana 2',
  'image.pixellelabs.nano-banana-pro': 'Nano Banana Pro',
  'pixellelabs.nano-banana-2': 'Nano Banana 2',
  'pixellelabs.nano-banana-pro': 'Nano Banana Pro',
};

const KNOWN_IMAGE_ROUTE_USER_FACING_LABEL_BY_KEY: Record<string, string> = {
  'image.gpt-image-2': 'GPT-Image-2 线路一',
  'image.gpt-image-2.line2': 'GPT-Image-2 线路二',
  'image.pixellelabs.nano-banana-2': 'Nano Banana 2 线路一',
  'image.pixellelabs.nano-banana-pro': 'Nano Banana Pro 线路一',
};

const normalizeRouteLineLabel = (value: unknown, index: number) => {
  const configured = normalizeKey(value);
  const directLine = configured.match(/^线路([一二三四五六七八九十0-9]+)$/);
  if (directLine) return configured;
  const lineNumber = configured.match(/(?:线路|line)\s*([0-9]+)/i)?.[1];
  if (lineNumber) return `线路${ROUTE_NUMBER_LABELS[Number(lineNumber) - 1] || lineNumber}`;
  return `线路${ROUTE_NUMBER_LABELS[index] || index + 1}`;
};

export const getProductImageModelLabel = (value: unknown) => {
  const key = normalizeKey(value).toLowerCase();
  return MODEL_DISPLAY_NAME_BY_FAMILY_OR_MODEL[key] || normalizeKey(value);
};

export const getKnownImageRouteUserFacingLabel = (routeKey: unknown) => {
  const key = normalizeKey(routeKey).toLowerCase();
  return KNOWN_IMAGE_ROUTE_USER_FACING_LABEL_BY_KEY[key] || '';
};

const getProductModelDisplayName = (item: AiModelCatalogRoute) => {
  const keys = [item.modelFamily, item.modelKey].map((value) => normalizeKey(value).toLowerCase());
  for (const key of keys) {
    const label = MODEL_DISPLAY_NAME_BY_FAMILY_OR_MODEL[key];
    if (label) return label;
  }
  return normalizeKey(item.modelKey) || '图片模型';
};

const normalizeSize = (value: unknown) => {
  const raw = normalizeKey(value);
  return raw ? raw.toLowerCase() : raw;
};

const NANO_BANANA_FIXED_SIZE_OPTIONS = ['1k', '2k', '4k'];
const NANO_BANANA_FIXED_RATIO_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const NANO_BANANA_MODEL_IDENTITIES = new Set([
  'nano-banana-pro',
  'nano-banana-pro-fast',
  'pixellelabs.nano-banana-pro',
  'pixellelabs.nano-banana-2',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
]);

const isNanoBananaCatalogModel = (model: ModelCatalogOption | null | undefined) => {
  const keys = [model?.id, model?.modelFamily, model?.modelKey].map((value) => normalizeKey(value).toLowerCase());
  return keys.some((key) => NANO_BANANA_MODEL_IDENTITIES.has(key));
};

const isGptImage2CatalogModel = (model: ModelCatalogOption | null | undefined) => {
  const keys = [model?.id, model?.modelFamily, model?.modelKey].map((value) => normalizeKey(value).toLowerCase());
  return keys.includes('gpt-image-2');
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
          id: item.modelFamily || item.modelKey,
          label: item.displayName || item.modelKey,
          modelFamily: item.modelFamily || item.modelKey,
          modelKey: item.modelKey,
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
          modelKey: model.requestModel || model.id,
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
  const lineCountsByModel = new Map<string, number>();
  const result: RuntimeRouteOption[] = [];

  for (const item of [...routes].sort((left, right) => left.routeKey.localeCompare(right.routeKey))) {
    const routeKey = normalizeKey(item.routeKey);
    if (!routeKey || seen.has(routeKey)) continue;
    seen.add(routeKey);

    const lineScope = normalizeKey(item.modelFamily) || normalizeKey(item.modelKey) || 'default';
    const lineIndex = lineCountsByModel.get(lineScope) ?? 0;
    lineCountsByModel.set(lineScope, lineIndex + 1);
    const lineLabel = normalizeRouteLineLabel(item.routeLabel, lineIndex);
    const modelLabel = getProductModelDisplayName(item);
    result.push({
      estimatedCredits: item.estimatedCredits ?? item.minChargeCredits ?? null,
      label: lineLabel,
      minChargeCredits: item.minChargeCredits ?? item.estimatedCredits ?? null,
      modelDisplayName: item.modelKey,
      modelKey: item.modelKey,
      pricingUnit: item.pricingUnit ?? null,
      providerKey: item.providerKey,
      providerName: item.providerName,
      routeKey,
      userFacingLabel: `${modelLabel} ${lineLabel}`,
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
      if (field.key === 'size') {
        params.size = normalizeSize(field.defaultValue);
        continue;
      }
      params[field.key] = field.defaultValue;
      if (field.key === 'aspectRatio') params.aspect_ratio = field.defaultValue;
      if (field.key === 'imageSize') params.size = normalizeSize(field.defaultValue);
    }
  }
  return params;
}

export function getAspectRatioOptionsFromCatalogModel(model: ModelCatalogOption | null | undefined): string[] {
  if (isNanoBananaCatalogModel(model)) {
    return [...NANO_BANANA_FIXED_RATIO_OPTIONS];
  }

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
  if (isNanoBananaCatalogModel(model)) {
    return [...NANO_BANANA_FIXED_SIZE_OPTIONS];
  }

  const fields = getCatalogUiFields(model?.uiSchema);
  const sizeField = fields.find((field) => field.key === 'imageSize' || field.key === 'size');
  const fromField = sizeField?.options
    ?.map((option) => normalizeSize(option.value))
    .filter(Boolean) ?? [];
  const fromCapabilities = Array.isArray(model?.capabilities?.supportedSizes)
    ? (model!.capabilities.supportedSizes as unknown[]).map(normalizeSize).filter(Boolean)
    : [];
  const options = Array.from(new Set([...fromField, ...fromCapabilities]));
  if (isGptImage2CatalogModel(model)) {
    return options.filter((option) => option === '1k' || option === '2k' || option === '4k');
  }
  return options;
}
