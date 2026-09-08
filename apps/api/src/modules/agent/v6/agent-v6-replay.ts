import type { AgentV6DecisionInput, AgentV6ContextSnapshotInput, AgentV6ScopeInput } from "./agent-v6-schemas.js";

export type AgentV6Response = {
  blocks: Array<Record<string, unknown>>;
  contextSnapshot: AgentV6ContextSnapshotInput;
  executionState: "idle" | "running" | "verifying" | "completed" | "failed";
  graphRevision: number;
  pendingDecision: Record<string, unknown> | null;
  phase: "idle" | "understanding" | "waiting_for_choice" | "drafting_brief" | "waiting_for_confirmation" | "executing" | "verifying" | "presenting_results" | "refining" | "failed";
  sessionId: string;
  turnId: string;
  [key: string]: unknown;
};

const phases = new Set<AgentV6Response["phase"]>(["idle", "understanding", "waiting_for_choice", "drafting_brief", "waiting_for_confirmation", "executing", "verifying", "presenting_results", "refining", "failed"]);
const sensitiveKeys = new Set(["provider", "route", "credential", "credentialid", "apikey", "baseurl", "signedurl", "authorization", "token", "secret", "password", "nonce", "authtag", "data", "blob", "html", "base64"]);
const asRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeText = (value: unknown, max = 4_000) => typeof value === "string" ? value.slice(0, max) : "";
const safeId = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200 ? value : "";

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return /^(?:data:|blob:)/i.test(value) || /\b(?:bearer|basic)\s+\S+/i.test(value) ? null : safeText(value);
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => safeValue(item, depth + 1)).filter((item) => item !== null);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(asRecord(value)).slice(0, 32)) {
    if (sensitiveKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) continue;
    const safe = safeValue(item, depth + 1);
    if (safe !== null) result[key] = safe;
  }
  return result;
}

function safeBlock(value: unknown): Record<string, unknown> | null {
  const raw = asRecord(value);
  const type = raw.type;
  if (type === "divider") return { type };
  if (type === "paragraph" || type === "quote") return { type, text: safeText(raw.text) };
  if (type === "heading") return { type, level: raw.level === 1 || raw.level === 3 ? raw.level : 2, text: safeText(raw.text) };
  if (type === "bullet_list" || type === "numbered_list") return { type, items: Array.isArray(raw.items) ? raw.items.slice(0, 12).map((item) => safeText(item, 400)).filter(Boolean) : [] };
  if (type === "choice_grid") return { type, ...(safeId(raw.id) ? { id: safeId(raw.id) } : {}), options: Array.isArray(raw.options) ? raw.options.slice(0, 12).flatMap((item) => { const option = asRecord(item); const id = safeId(option.id); const label = safeText(option.label, 400); return id && label ? [{ id, label, ...(safeText(option.description, 400) ? { description: safeText(option.description, 400) } : {}) }] : []; }) : [], selectionMode: raw.selectionMode === "multiple" ? "multiple" : "single" };
  if (type === "confirmation_card") return { type, text: safeText(raw.text), ...(safeText(raw.title, 400) ? { title: safeText(raw.title, 400) } : {}), plan: safePlan(raw.plan) };
  if (type === "brief_card") return { type, fields: Array.isArray(raw.fields) ? raw.fields.slice(0, 12).flatMap((item) => { const field = asRecord(item); const label = safeText(field.label, 400); const value = safeText(field.value); return label && value ? [{ label, value }] : []; }) : [], editable: raw.editable === true };
  if (type === "comparison_table") return { type, columns: Array.isArray(raw.columns) ? raw.columns.slice(0, 12).map((item) => safeText(item, 400)) : [], rows: Array.isArray(raw.rows) ? raw.rows.slice(0, 12).map((row) => Array.isArray(row) ? row.slice(0, 12).map((item) => safeText(item, 400)) : []) : [] };
  if (type === "progress_card" || type === "result_group") return { type, ...(safeText(raw.title, 400) ? { title: safeText(raw.title, 400) } : {}), ...(type === "progress_card" ? { steps: safeValue(raw.steps) } : { results: safeValue(raw.results) }) };
  return null;
}

function safePlan(value: unknown): Record<string, unknown> {
  const raw = asRecord(value);
  return {
    ...(safeText(raw.title, 400) ? { title: safeText(raw.title, 400) } : {}),
    ...(safeText(raw.summary) ? { summary: safeText(raw.summary) } : {}),
    ...(typeof raw.costCredits === "number" && Number.isFinite(raw.costCredits) && raw.costCredits >= 0 ? { costCredits: raw.costCredits } : {}),
    ...(raw.batch === true ? { batch: true } : {}),
    ...(raw.writesCanvas === true ? { writesCanvas: true } : {}),
    ...(raw.skill === true ? { skill: true } : {}),
    ...(raw.app === true ? { app: true } : {}),
  };
}

function safeContextSnapshot(value: unknown, fallback: AgentV6ContextSnapshotInput): AgentV6ContextSnapshotInput {
  const raw = asRecord(value);
  const safeRefs = Array.isArray(raw.assetRefs) ? raw.assetRefs.slice(0, 12).flatMap((item) => {
    const ref = asRecord(item); const assetId = safeId(ref.assetId); const refId = safeId(ref.refId); const label = safeText(ref.label, 400);
    return assetId && refId && label ? [{ assetId, refId, label, ...(safeId(ref.nodeId) ? { nodeId: safeId(ref.nodeId) } : {}) }] : [];
  }) : fallback.assetRefs;
  const safeSkills = Array.isArray(raw.skillRefs) ? raw.skillRefs.slice(0, 12).flatMap((item) => {
    const ref = asRecord(item); const id = safeId(ref.id); return id && typeof ref.version === "number" && Number.isSafeInteger(ref.version) && ref.version >= 0 ? [{ id, version: ref.version }] : [];
  }) : fallback.skillRefs;
  const strings = (value: unknown) => Array.isArray(value) ? value.slice(0, 12).flatMap((item) => { const id = safeId(item); return id ? [id] : []; }) : [];
  return {
    appRefs: strings(raw.appRefs), assetRefs: safeRefs,
    flowId: raw.flowId === null || typeof raw.flowId === "string" ? raw.flowId as string | null : fallback.flowId,
    graphRevision: typeof raw.graphRevision === "number" && Number.isSafeInteger(raw.graphRevision) && raw.graphRevision >= 0 ? raw.graphRevision : fallback.graphRevision,
    modelKey: raw.modelKey === null || typeof raw.modelKey === "string" ? raw.modelKey as string | null : fallback.modelKey,
    projectId: raw.projectId === null || typeof raw.projectId === "string" ? raw.projectId as string | null : fallback.projectId,
    selectedNodeIds: strings(raw.selectedNodeIds), skillRefs: safeSkills, uploadedAssetIds: strings(raw.uploadedAssetIds),
  };
}

function safePendingDecision(value: unknown): Record<string, unknown> | null {
  const raw = asRecord(value);
  if (raw.type !== "execute") return null;
  const decisionId = safeId(raw.decisionId); const sessionId = safeId(raw.sessionId); const turnId = safeId(raw.turnId); const idempotencyKey = safeId(raw.idempotencyKey);
  if (!decisionId || !sessionId || !turnId || !idempotencyKey || typeof raw.graphRevision !== "number" || !Number.isSafeInteger(raw.graphRevision) || raw.graphRevision < 0) return null;
  return { type: "execute", decisionId, sessionId, turnId, graphRevision: raw.graphRevision, payload: safeValue(raw.payload), idempotencyKey, ...safePlan(raw) };
}

export function buildV6Context(scope: AgentV6ScopeInput, input?: Partial<AgentV6ContextSnapshotInput>): AgentV6ContextSnapshotInput {
  return {
    appRefs: input?.appRefs ?? [], assetRefs: input?.assetRefs ?? [], flowId: scope.flowId, graphRevision: scope.graphRevision,
    modelKey: input?.modelKey ?? null, projectId: scope.projectId, selectedNodeIds: input?.selectedNodeIds ?? [],
    skillRefs: input?.skillRefs ?? [], uploadedAssetIds: input?.uploadedAssetIds ?? [],
  };
}

export function projectV6Response(raw: unknown, fallback: { sessionId: string; turnId: string; scope: AgentV6ScopeInput; contextSnapshot?: AgentV6ContextSnapshotInput; pendingDecision?: Record<string, unknown> | null }): AgentV6Response {
  const source = asRecord(raw);
  const phase = phases.has(source.phase as AgentV6Response["phase"]) ? source.phase as AgentV6Response["phase"] : "understanding";
  const executionState = source.executionState === "running" || source.executionState === "verifying" || source.executionState === "completed" || source.executionState === "failed" ? source.executionState : "idle";
  const graphRevision = typeof source.graphRevision === "number" && Number.isSafeInteger(source.graphRevision) && source.graphRevision >= 0 ? source.graphRevision : fallback.scope.graphRevision;
  const blocks = Array.isArray(source.blocks) ? source.blocks.slice(0, 12).flatMap((block) => { const safe = safeBlock(block); return safe ? [safe] : []; }) : [];
  const plan = source.plan && typeof source.plan === "object" ? safePlan(source.plan) : blocks.find((block) => block.type === "confirmation_card")?.plan;
  const pendingDecision = source.pendingDecision !== undefined ? safePendingDecision(source.pendingDecision) : fallback.pendingDecision ?? (phase === "waiting_for_confirmation" ? { type: "execute", decisionId: `v6-decision-${fallback.turnId}`, sessionId: fallback.sessionId, turnId: fallback.turnId, graphRevision, payload: {}, idempotencyKey: `v6-idempotency-${fallback.turnId}`, ...(plan ?? {}) } : null);
  const fallbackContext = fallback.contextSnapshot ?? buildV6Context(fallback.scope);
  const response: AgentV6Response = {
    blocks,
    contextSnapshot: safeContextSnapshot(source.contextSnapshot, fallbackContext),
    executionState,
    graphRevision,
    pendingDecision,
    phase,
    sessionId: safeId(source.sessionId) || fallback.sessionId,
    turnId: safeId(source.turnId) || fallback.turnId,
  };
  if (plan && Object.keys(plan).length > 0) response.plan = plan;
  if (typeof source.prompt === "string") response.prompt = safeText(source.prompt, 8_000);
  if (typeof source.error === "string") response.error = safeText(source.error);
  if (source.progress !== undefined) response.progress = safeValue(source.progress);
  if (source.results !== undefined) response.results = safeValue(source.results);
  return response;
}

export function decisionForV6(input: AgentV6DecisionInput) {
  return input.type === "select_choice"
    ? { type: input.type, blockId: input.blockId, optionId: input.optionId }
    : input.type === "update_brief"
      ? { type: input.type, field: input.field, value: input.value }
      : input.type === "cancel"
        ? { type: input.type, ...(input.reason ? { reason: input.reason } : {}) }
        : input.type === "refine"
          ? { type: input.type, ...(input.resultId ? { resultId: input.resultId } : {}), ...(input.prompt ? { prompt: input.prompt } : {}) }
          : { type: input.type };
}
