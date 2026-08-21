const FORBIDDEN_PATTERN =
  /(baseUrl|Authorization|apiKey|provider_key|provider_name|adapter_kind|upstream_model|route_key_snapshot|raw route[_ ]?key|signedUrl|previewUrl|dataUrl|blobUrl)/i;

export function containsForbiddenAgentOutputText(value: string): boolean {
  return FORBIDDEN_PATTERN.test(value);
}

export function assertAgentOutputSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (containsForbiddenAgentOutputText(serialized)) {
    throw new Error("Agent planner produced unsafe internal data.");
  }
}

type SafeV2AgentEvent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, maxLength) : undefined;
}

function boundedStringList(value: unknown, maxItems = 12): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map((item) => boundedString(item, 200)).filter((item): item is string => Boolean(item)).slice(0, maxItems);
  return result.length > 0 ? result : undefined;
}

function safeAssetRefs(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map<Record<string, unknown> | null>((item) => {
    if (!isRecord(item)) return null;
    const assetId = boundedString(item.assetId, 200);
    const kind = item.kind === "image" || item.kind === "video" ? item.kind : undefined;
    const label = boundedString(item.label, 200);
    const promptSummary = boundedString(item.promptSummary, 1000);
    const refId = boundedString(item.refId, 200);
    if (!assetId || !kind || !label || !promptSummary || !refId) return null;
    return {
      assetId,
      kind,
      label,
      promptSummary,
      refId,
      ...(typeof item.width === "number" && Number.isFinite(item.width) ? { width: item.width } : {}),
      ...(typeof item.height === "number" && Number.isFinite(item.height) ? { height: item.height } : {}),
    };
  }).filter((item): item is Record<string, unknown> => item !== null).slice(0, 12);
  return result.length > 0 ? result : undefined;
}

function safeRuns(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.map<Record<string, string> | null>((item) => {
    if (!isRecord(item)) return null;
    const id = boundedString(item.id, 200);
    const status = boundedString(item.status, 80);
    return id && status ? { id, status } : null;
  }).filter((item): item is Record<string, string> => item !== null).slice(0, 12);
  return result.length > 0 ? result : undefined;
}

function safeV2ToolResult(value: unknown): Record<string, unknown> {
  const input = isRecord(value) ? value : {};
  const output: Record<string, unknown> = {};
  if (typeof input.allTerminal === "boolean") output.allTerminal = input.allTerminal;
  if (typeof input.approvalRequired === "boolean") output.approvalRequired = input.approvalRequired;
  for (const key of ["assetIds", "createdNodeIds", "nodeIds", "placedNodeIds", "updatedNodeIds"]) {
    const values = boundedStringList(input[key]);
    if (values) output[key] = values;
  }
  const refs = safeAssetRefs(input.assetRefs);
  if (refs) output.assetRefs = refs;
  const runs = safeRuns(input.runs);
  if (runs) output.runs = runs;
  for (const key of ["error", "message", "question", "skillRunId", "skillStepId", "status", "workflowRunId"]) {
    const valueText = boundedString(input[key], key === "status" ? 80 : 1000);
    if (valueText) output[key] = valueText;
  }
  if (typeof input.revision === "number" && Number.isSafeInteger(input.revision) && input.revision >= 0) output.revision = input.revision;
  if (isRecord(input.estimate) && typeof input.estimate.totalCredits === "number" && Number.isFinite(input.estimate.totalCredits)) output.estimate = { totalCredits: input.estimate.totalCredits };
  return output;
}

export function sanitizeV2AgentEventForClient(event: unknown): SafeV2AgentEvent {
  if (!isRecord(event)) return {};
  const output: SafeV2AgentEvent = {};
  for (const key of ["type", "callId", "name", "reason", "turnId"]) {
    const value = boundedString(event[key], 200);
    if (value) output[key] = value;
  }
  if (event.type === "tool_result") output.result = safeV2ToolResult(event.result);
  else if (event.type === "turn_waiting" && isRecord(event.details)) {
    const question = boundedString(event.details.question, 1000);
    const reason = boundedString(event.details.reason, 1000);
    output.details = { ...(question ? { question } : {}), ...(reason ? { reason } : {}) };
  } else if (event.type === "turn_completed") {
    const text = boundedString(event.text, 12000);
    if (text) output.text = text;
  } else if (event.type === "turn_failed") {
    const code = boundedString(event.code, 200);
    const message = boundedString(event.message, 1000);
    if (code) output.code = code;
    if (message) output.message = message;
  } else if (event.type === "text_delta") {
    const text = boundedString(event.text, 12000);
    if (text) output.text = text;
  }
  return output;
}
