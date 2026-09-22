import { apiGet } from "./v2HttpClient";
import { buildConsoleUrl, type ConsoleQuery } from "../console/consoleQuery";
export type { ConsoleScope, ConsoleSource, ConsolePage, ConsoleUsage, ConsoleTask, ConsoleTaskAttempt, ConsoleTaskDiagnostics, ConsoleTaskTimelineItem, ConsoleCall, ConsoleActivity, ConsoleOverview } from "../../apps/api/src/modules/console-query/console-query.types";
import type { ConsoleScope, ConsolePage, ConsoleUsage, ConsoleTask, ConsoleCall, ConsoleActivity, ConsoleOverview } from "../../apps/api/src/modules/console-query/console-query.types";

export type ConsoleResource = "usage" | "tasks" | "calls" | "activity";
export type ConsoleRecords = { usage: ConsoleUsage; tasks: ConsoleTask; calls: ConsoleCall; activity: ConsoleActivity };
function endpoint(scope: ConsoleScope, resource: ConsoleResource) {
  if (resource === "activity") return "/billing/activity";
  if (resource === "calls") return "/admin/ai/calls";
  return `/${scope === "self" ? "me" : "admin"}/${resource === "usage" ? "usage-events" : "tasks"}`;
}
export function listConsoleRecords<R extends ConsoleResource>(scope: ConsoleScope, resource: R, query: ConsoleQuery) {
  return apiGet<ConsolePage<ConsoleRecords[R]>>(buildConsoleUrl(endpoint(scope, resource), query));
}
export function getConsoleRecord<R extends ConsoleResource>(scope: ConsoleScope, resource: R, id: string) {
  return apiGet<{ item: ConsoleRecords[R] }>(`${endpoint(scope, resource)}/${encodeURIComponent(id)}`);
}
export function getConsoleOverview(scope: ConsoleScope, query: ConsoleQuery) {
  return apiGet<ConsoleOverview>(buildConsoleUrl(`/${scope === "self" ? "me" : "admin"}/overview`, query));
}
