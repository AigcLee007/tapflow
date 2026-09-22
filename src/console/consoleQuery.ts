import type { ConsoleScope } from "../services/v2ConsoleApi";
export type ConsoleQuery = { limit: number; cursor?: string; asOf?: string; from?: string; to?: string; status?: string; billingStatus?: string; trafficClass?: string; source?: string; userId?: string; tenantId?: string; projectId?: string; modelId?: string; routeId?: string };
const fields = ["cursor", "asOf", "from", "to", "status", "billingStatus", "trafficClass", "source", "tenantId", "projectId", "modelId", "routeId"] as const;
export function readConsoleQuery(search: string, scope: ConsoleScope): ConsoleQuery {
  const params = new URLSearchParams(search);
  const limit = Number(params.get("limit") ?? 50);
  const query: ConsoleQuery = {limit: Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50};
  for (const field of fields) { const value = params.get(field); if (value) query[field] = value; }
  if (scope === "platform" && params.get("userId")) query.userId = params.get("userId")!;
  return query;
}
export function changeConsoleFilters(query: ConsoleQuery, changes: Partial<ConsoleQuery>): ConsoleQuery {
  const next = {...query, ...changes};
  delete next.cursor;
  delete next.asOf;
  return next;
}
export function buildConsoleUrl(path: string, query: Partial<ConsoleQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return `${path}${params.size ? `?${params}` : ""}`;
}
export function formatConsoleCredits(value: string | null | undefined): string {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return "未知";
  const [whole, decimal] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === undefined ? "" : `.${decimal}`);
}
export function consoleNavigate(path: string, replace = false) {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
