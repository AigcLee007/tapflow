import { randomUUID } from "node:crypto";
import type { ProviderCallContext, ResolvedRoute } from "./types.js";

export type ProviderOperation = "generate" | "submit" | "poll" | "stream";
export type RuntimeTelemetryMetadata = {
  executionId?: string | null;
  generationId?: string | null;
  nodeRunId?: string | null;
  workflowRunId?: string | null;
  traceId?: string | null;
  trafficClass?: "user_generation" | "admin_test" | "agent_control" | "system" | "unknown";
  source?: "workflow" | "workbench" | "agent" | "admin" | "system" | "unknown";
  billedUserId?: string | null;
};

export type ProviderTelemetryFields = {
  recordLevel?: "summary" | "request";
  operation?: ProviderOperation;
  executionId?: string | null;
  source?: string;
  trafficClass?: string;
  actorUserId?: string | null;
  billedUserId?: string | null;
  traceId?: string | null;
  attempt?: number | null;
  providerRequestId?: string | null;
  providerTaskId?: string | null;
  requestStartedAt?: string | null;
  requestCompletedAt?: string | null;
  requestDispatched?: boolean | null;
  httpStatus?: number | null;
};
export type PhysicalProviderRequest = ProviderTelemetryFields & {
  recordLevel: "request";
  operation: ProviderOperation;
  status: "http_succeeded" | "http_failed" | "network_error" | "cancelled";
  latencyMs: number;
  error: { code: string } | null;
};
export type ProviderRequestObserver = (event: PhysicalProviderRequest) => Promise<void>;
type ProviderRequestLogInput = PhysicalProviderRequest & {
  tenantId: string;
  modelId: string | null;
  providerId: string;
  routeId: string;
  nodeRunId?: string | null;
  workflowRunId?: string | null;
  productModelKey?: string | null;
  routeKeySnapshot?: string;
  routeLabelSnapshot?: string | null;
  providerKeySnapshot?: string;
  providerNameSnapshot?: string | null;
  connectionId?: string | null;
  connectionNameSnapshot?: string | null;
  adapterKindSnapshot?: string;
  apiModeSnapshot?: string | null;
  upstreamModelSnapshot?: string | null;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
};

// Keep only opaque, bounded identifiers. No arbitrary provider text, URLs, or headers.
export function safeProviderIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(value) && !/^(?:sk-|bearer|https?:)/i.test(value) ? value : null;
}

/** Observes only the provider fetch, never reference-asset downloads. HTTP success is not generation success. */
export async function observeProviderFetch(
  context: ProviderCallContext,
  operation: ProviderOperation,
  fetchImplementation: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (!context.onProviderRequest) return fetchImplementation(input, init);
  const started = Date.now();
  let response: Response | undefined;
  let failure: unknown;
  try {
    response = await fetchImplementation(input, init);
    return response;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cancelled = failure instanceof Error && /abort|timeout/i.test(failure.name);
    const event: PhysicalProviderRequest = {
      recordLevel: "request", operation,
      requestDispatched: true,
      requestStartedAt: new Date(started).toISOString(),
      requestCompletedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Date.now() - started),
      httpStatus: response?.status ?? null,
      status: response ? response.ok ? "http_succeeded" : "http_failed" : cancelled ? "cancelled" : "network_error",
      providerRequestId: safeProviderIdentifier(response?.headers.get("x-request-id") ?? response?.headers.get("request-id")),
      error: response?.ok ? null : { code: response ? `HTTP_${response.status}` : cancelled ? "PROVIDER_REQUEST_CANCELLED" : "PROVIDER_NETWORK_ERROR" },
    };
    if (event.providerRequestId?.includes(context.apiKey)) event.providerRequestId = null;
    // Observability must not turn an accepted provider submission into a retry or refund.
    try { await context.onProviderRequest(event); } catch { console.warn("provider_request_telemetry_write_failed"); }
  }
}

export function createProviderTelemetry(
  context: { tenantId: string; userId: string | null },
  route: ResolvedRoute,
  metadata: RuntimeTelemetryMetadata | undefined,
  sink: (input: ProviderRequestLogInput) => Promise<void>,
  operation: ProviderOperation,
  providerTaskId?: string,
) {
  const fields: ProviderTelemetryFields = {
    recordLevel: "summary", operation,
    executionId: metadata?.executionId ?? metadata?.nodeRunId ?? metadata?.generationId ?? randomUUID(),
    source: metadata?.source ?? (metadata?.nodeRunId ? "workflow" : metadata?.generationId ? "workbench" : "unknown"),
    trafficClass: metadata?.trafficClass ?? (metadata?.nodeRunId || metadata?.generationId ? "user_generation" : "unknown"),
    actorUserId: context.userId,
    billedUserId: metadata?.billedUserId ?? null,
    traceId: safeProviderIdentifier(metadata?.traceId),
    providerTaskId: safeProviderIdentifier(providerTaskId),
  };
  const snapshots = {
    tenantId: context.tenantId, workflowRunId: metadata?.workflowRunId, nodeRunId: metadata?.nodeRunId,
    providerId: route.provider.id, modelId: route.model.id, routeId: route.routeId,
    productModelKey: route.model.modelKey, routeKeySnapshot: route.routeKey, routeLabelSnapshot: route.routeLabel,
    providerKeySnapshot: route.provider.key, providerNameSnapshot: route.provider.name,
    connectionId: route.connection?.id, connectionNameSnapshot: route.connection?.name,
    adapterKindSnapshot: route.connection?.adapterKind ?? route.provider.kind,
    apiModeSnapshot: typeof route.requestConfig.apiMode === "string" ? route.requestConfig.apiMode : null,
    upstreamModelSnapshot: route.upstreamModel,
  };
  let attempt = 0;
  const onProviderRequest: ProviderRequestObserver = async (event) => {
    await sink({
      ...fields, ...event, attempt: ++attempt,
      ...snapshots,
      requestSummary: {}, responseSummary: { scope: "http_transport", latencyScope: "response_headers" },
    });
  };
  return { fields, snapshots, route: { ...route, onProviderRequest } };
}
