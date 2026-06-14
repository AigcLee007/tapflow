import type { V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';

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
  userFacingLabel?: string;
};

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
    });
  }

  return result;
}
