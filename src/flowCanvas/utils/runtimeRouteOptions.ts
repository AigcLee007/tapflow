import type { V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';

export type RuntimeRouteOption = {
  label: string;
  modelDisplayName: string | null;
  modelKey: string | null;
  providerKey: string;
  providerName: string;
  routeKey: string;
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
      label: `${modelLabel} · ${routeKey}`,
      modelDisplayName: item.modelDisplayName,
      modelKey: item.modelKey,
      providerKey: item.providerKey,
      providerName: item.providerName,
      routeKey,
    });
  }

  return result;
}

