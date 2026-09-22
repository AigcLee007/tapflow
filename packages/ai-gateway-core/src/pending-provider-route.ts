import type { ResolvedRoute } from "./types.js";

export type PendingProviderRoute = Omit<ResolvedRoute, "credential" | "onProviderRequest">;

/** Only fields consumed during polling are retained; credentials remain a vault reference. */
export function snapshotPendingProviderRoute(route: ResolvedRoute): PendingProviderRoute {
  const requestConfig: Record<string, unknown> = {};
  for (const key of ["apiMode", "protocol", "model", "upstreamModel", "pollPath", "taskPath", "pollPathTemplate", "timeoutMs", "pollIntervalMs", "providerTaskTimeoutMs"]) {
    const value = route.requestConfig[key];
    if (typeof value === "number" && Number.isFinite(value)) requestConfig[key] = value;
    if (typeof value === "string" && value.length <= 1024) {
      // Polling paths cannot retain query credentials or signed URLs.
      requestConfig[key] = /path/i.test(key) ? value.split(/[?#]/, 1)[0] : value;
    }
  }
  const url = new URL(route.baseUrl);
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    connection: route.connection ? { ...route.connection } : undefined,
    model: { ...route.model },
    provider: { id: route.provider.id, key: route.provider.key, kind: route.provider.kind, name: route.provider.name, defaultBaseUrl: null },
    requestConfig, routeId: route.routeId, routeKey: route.routeKey, routeLabel: route.routeLabel,
    status: route.status, tenantId: route.tenantId, upstreamModel: route.upstreamModel,
    priority: route.priority, weight: route.weight,
  };
}
