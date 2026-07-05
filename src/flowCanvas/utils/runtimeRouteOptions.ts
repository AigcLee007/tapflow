import type { V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';
import type { FlowImageGenerationMode } from '../types';
import { normalizeImageGenerationMode } from './imageGenerationModes';

export type RuntimeRouteOption = {
  estimatedCredits: number | null;
  label: string;
  minChargeCredits: number | null;
  modelDisplayName: string | null;
  modelKey: string | null;
  pricingUnit: string | null;
  providerKey: string;
  providerName: string;
  routeKey: string;
  supportedGenerationModes?: FlowImageGenerationMode[];
  userFacingLabel?: string;
};

const OFFICIAL_FALLBACK_IMAGE_RUNTIME_ROUTES_BY_MODEL_ID: Record<string, RuntimeRouteOption[]> = {
  'pixellelabs.nano-banana-pro': [
    {
      estimatedCredits: null,
      label: '线路一',
      minChargeCredits: null,
      modelDisplayName: 'Nano Banana Pro',
      modelKey: 'pixellelabs.nano-banana-pro',
      pricingUnit: null,
      providerKey: '',
      providerName: '',
      routeKey: 'image.pixellelabs.nano-banana-pro',
      userFacingLabel: 'Nano Banana Pro 线路一',
    },
    {
      estimatedCredits: null,
      label: '线路二（官方T3）',
      minChargeCredits: null,
      modelDisplayName: 'Nano Banana Pro',
      modelKey: 'pixellelabs.nano-banana-pro',
      pricingUnit: null,
      providerKey: '',
      providerName: '',
      routeKey: 'image.mouxihub.nano-banana-pro.t3',
      userFacingLabel: 'Nano Banana Pro 线路二（官方T3）',
    },
  ],
  'pixellelabs.nano-banana-2': [
    {
      estimatedCredits: null,
      label: '线路一',
      minChargeCredits: null,
      modelDisplayName: 'Nano Banana 2',
      modelKey: 'pixellelabs.nano-banana-2',
      pricingUnit: null,
      providerKey: '',
      providerName: '',
      routeKey: 'image.pixellelabs.nano-banana-2',
      userFacingLabel: 'Nano Banana 2 线路一',
    },
  ],
  'gpt-image-2': [
    {
      estimatedCredits: null,
      label: '线路一',
      minChargeCredits: null,
      modelDisplayName: 'GPT-Image-2',
      modelKey: 'gpt-image-2',
      pricingUnit: null,
      providerKey: '',
      providerName: '',
      routeKey: 'image.gpt-image-2',
      userFacingLabel: 'GPT-Image-2 线路一',
    },
    {
      estimatedCredits: null,
      label: '线路二',
      minChargeCredits: null,
      modelDisplayName: 'GPT-Image-2',
      modelKey: 'gpt-image-2',
      pricingUnit: null,
      providerKey: '',
      providerName: '',
      routeKey: 'image.gpt-image-2.line2',
      userFacingLabel: 'GPT-Image-2 线路二',
    },
  ],
};

export function getOfficialFallbackImageRuntimeRoutes(modelId: string): RuntimeRouteOption[] {
  return OFFICIAL_FALLBACK_IMAGE_RUNTIME_ROUTES_BY_MODEL_ID[String(modelId || '').trim()] ?? [];
}

export function normalizeSupportedImageGenerationModes(value: unknown): FlowImageGenerationMode[] {
  const rawModes = Array.isArray(value) ? value : [];
  const modes = rawModes
    .map((item) => normalizeImageGenerationMode(item))
    .filter((mode, index, array) => array.indexOf(mode) === index);
  return modes.length > 0 ? modes : ['standard'];
}

export function mapImageRuntimeRouteOptions(items: V2RuntimeRouteItem[]): RuntimeRouteOption[] {
  const seen = new Set<string>();
  const result: RuntimeRouteOption[] = [];

  const sorted = [...items]
    .filter((item) => item.modality === 'image' && typeof item.routeKey === 'string' && item.routeKey.trim().length > 0)
    .sort((left, right) => left.routeKey.localeCompare(right.routeKey));

  for (const item of sorted) {
    const routeKey = item.routeKey.trim();
    if (!routeKey || seen.has(routeKey)) {
      continue;
    }
    seen.add(routeKey);

    const modelLabel = item.modelDisplayName || item.modelKey || '--';
    result.push({
      estimatedCredits: item.estimatedCredits ?? item.minChargeCredits ?? null,
      label: `${modelLabel} - ${routeKey}`,
      minChargeCredits: item.minChargeCredits ?? item.estimatedCredits ?? null,
      modelDisplayName: item.modelDisplayName,
      modelKey: item.modelKey,
      pricingUnit: item.pricingUnit ?? null,
      providerKey: item.providerKey,
      providerName: item.providerName,
      routeKey,
      supportedGenerationModes: normalizeSupportedImageGenerationModes(item.capabilities?.supportedGenerationModes),
    });
  }

  return result;
}
