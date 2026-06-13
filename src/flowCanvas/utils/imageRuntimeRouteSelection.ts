export type ImageRuntimeRouteLike = {
  routeKey: string;
};

const GENERIC_IMAGE_ROUTE_KEYS = new Set(['image.default']);

function hasRoute(routes: ImageRuntimeRouteLike[], routeKey: string): boolean {
  return routes.some((route) => route.routeKey === routeKey);
}

export function resolveActiveImageRuntimeRouteKey(input: {
  normalizedCurrentRouteKey?: string | null;
  preferredRouteKey?: string | null;
  selectedRouteKey?: string | null;
  visibleRoutes: ImageRuntimeRouteLike[];
}): string {
  const current = String(input.normalizedCurrentRouteKey || '').trim();
  const preferred = String(input.preferredRouteKey || '').trim();
  const selected = String(input.selectedRouteKey || '').trim();

  if (current && hasRoute(input.visibleRoutes, current)) {
    return current;
  }
  if (selected) {
    return selected;
  }
  if (preferred) {
    return preferred;
  }
  if (current && !GENERIC_IMAGE_ROUTE_KEYS.has(current)) {
    return current;
  }
  return current;
}
