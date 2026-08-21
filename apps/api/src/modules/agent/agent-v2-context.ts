type Point = { x: number; y: number };

type CanvasNodeInput = {
  assetId?: unknown;
  errorMessage?: unknown;
  id?: unknown;
  kind?: unknown;
  position?: unknown;
  selected?: unknown;
  status?: unknown;
  title?: unknown;
};

type CanvasEdgeInput = { source?: unknown; target?: unknown };

export type ScopedV2AgentNode = {
  assetRef?: { assetId: string; label: string };
  errorMessage?: string;
  id: string;
  kind: string;
  outputText?: string;
  position: Point;
  selected: boolean;
  status?: string;
  title: string;
};

export type ScopedV2AgentContext = {
  capabilityScope: string[];
  contextScope: "selection+viewport+graph";
  downstreamNodes: ScopedV2AgentNode[];
  modelCatalog: ScopedV2AgentModel[];
  recentRuns: ScopedV2AgentRun[];
  flowId?: string;
  graphRevision: number;
  projectId?: string;
  redactionVersion: "v2";
  selectedNodes: ScopedV2AgentNode[];
  untrustedPrompt?: string;
  untrustedSkill?: {
    id: string;
    normalized: Record<string, unknown>;
    source: Record<string, unknown>;
    version: number;
  };
  upstreamNodes: ScopedV2AgentNode[];
  viewportNodes: ScopedV2AgentNode[];
};

export type ScopedV2AgentModel = {
  availability: "active" | "inactive";
  capabilities: Record<string, unknown>;
  displayName: string;
  pricing: { unitCredits: number; minChargeCredits: number; unit: string; exact: boolean } | null;
  priceRange?: { minCredits: number; maxCredits: number };
  modality: string;
};

export type ScopedV2AgentRun = {
  id: string;
  status: string;
  modality?: string;
  summary?: string;
  createdAt?: string;
  nodeIds?: string[];
  assetRefs?: Array<{ assetId: string; kind?: string; label?: string }>;
};

export type BuildScopedV2AgentContextInput = {
  canvas: {
    edges?: unknown;
    flowId?: unknown;
    nodes?: unknown;
    nodeOutputs?: unknown;
    projectId?: unknown;
    selectedNodeIds?: unknown;
    viewport?: unknown;
  };
  graphRevision: number;
  prompt?: unknown;
  skill?: {
    id?: unknown;
    normalized?: unknown;
    source?: unknown;
    version?: unknown;
  };
  modelCatalog?: unknown;
  recentRuns?: unknown;
};

const MAX_TEXT = 1200;
const MAX_NODES = 20;
const MAX_CONTEXT_NODES = 60;
const INTERNAL_VALUE_PATTERN = /(?:https?:\/\/[^\s"'<>]+|data:[^\s"'<>]+|blob:[^\s"'<>]+|(?:api[_ -]?key|authorization|base[_ -]?url|credential|provider|route[_ -]?key|signed[_ -]?url)\s*[:=]\s*[^\s,;]+|\bprovider\b\s+(?:with|at|named)\s+[^,;.]+)/gi;
const INTERNAL_FIELD_PATTERN = /(?:api[_ -]?key|authorization|base[_ -]?url|credential|provider|route[_ -]?key|signed[_ -]?url|preview[_ -]?url|data[_ -]?url|blob[_ -]?url|secret)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maxLength = MAX_TEXT): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .replace(INTERNAL_VALUE_PATTERN, "[redacted]")
    .replace(/\b(?:provider|credential|authorization|api[_ -]?key|base[_ -]?url|route[_ -]?key|signed[_ -]?url)\b/gi, "[redacted]")
    .replace(/(?:javascript:)/gi, "[redacted]")
    .slice(0, maxLength);
}

function safeId(value: unknown, maxLength = 200): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function safePoint(value: unknown): Point {
  if (!isRecord(value)) return { x: 0, y: 0 };
  const x = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0;
  return { x, y };
}

function safeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_CONTEXT_NODES) : [];
}

/** Redact untrusted tool output before feeding it back into the model loop. */
export function redactV2AgentContextValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") return safeText(value, MAX_TEXT);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_CONTEXT_NODES).map((item) => redactV2AgentContextValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_CONTEXT_NODES)) {
    if (INTERNAL_FIELD_PATTERN.test(key)) continue;
    const safeValue = redactV2AgentContextValue(child, depth + 1);
    if (safeValue !== undefined) output[key] = safeValue;
  }
  return output;
}

function summarizeNode(input: CanvasNodeInput, outputs: Record<string, unknown>): ScopedV2AgentNode | null {
  const id = safeId(input.id);
  if (!id) return null;
  const title = safeText(input.title, 160) ?? (typeof input.kind === "string" ? String(input.kind) : "Canvas node");
  const kind = safeText(input.kind, 80) ?? "unknown";
  const selected = input.selected === true;
  const summary: ScopedV2AgentNode = {
    id,
    kind,
    position: safePoint(input.position),
    selected,
    title,
  };
  const assetId = safeId(input.assetId);
  if (assetId) summary.assetRef = { assetId, label: title };
  const status = safeText(input.status, 80);
  if (status) summary.status = status;
  const errorMessage = safeText(input.errorMessage, 400);
  if (errorMessage) summary.errorMessage = errorMessage;
  const output = isRecord(outputs[id]) ? outputs[id] : undefined;
  const outputText = safeText(output?.text, MAX_TEXT);
  if (outputText) summary.outputText = outputText;
  return summary;
}

function nodeIdsConnected(edges: CanvasEdgeInput[], selected: Set<string>, direction: "upstream" | "downstream"): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const source = safeId(edge.source);
    const target = safeId(edge.target);
    if (!source || !target) continue;
    const from = direction === "upstream" ? target : source;
    const to = direction === "upstream" ? source : target;
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  const result = new Set<string>();
  const queue = [...selected];
  while (queue.length > 0 && result.size < MAX_NODES) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (selected.has(next) || result.has(next)) continue;
      result.add(next);
      queue.push(next);
    }
  }
  return result;
}

function viewportBounds(value: unknown): { center: Point; radius: number } {
  if (!isRecord(value)) return { center: { x: 0, y: 0 }, radius: 900 };
  const x = typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0;
  const zoom = typeof value.zoom === "number" && Number.isFinite(value.zoom) && value.zoom > 0 ? value.zoom : 1;
  return { center: { x: -x / zoom + 600, y: -y / zoom + 400 }, radius: Math.max(500, 1000 / zoom) };
}

function isInViewport(node: ScopedV2AgentNode, bounds: { center: Point; radius: number }): boolean {
  return Math.abs(node.position.x - bounds.center.x) <= bounds.radius && Math.abs(node.position.y - bounds.center.y) <= bounds.radius;
}

function safeSkill(skill: BuildScopedV2AgentContextInput["skill"]): ScopedV2AgentContext["untrustedSkill"] {
  if (!skill) return undefined;
  const id = safeId(skill.id);
  const version = typeof skill.version === "number" && Number.isSafeInteger(skill.version) ? skill.version : undefined;
  if (!id || version === undefined) return undefined;
  const source = isRecord(skill.source) ? skill.source : {};
  const normalized = isRecord(skill.normalized) ? skill.normalized : {};
  const project = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.flatMap((key) => {
    const text = safeText(value[key], MAX_TEXT);
    return text ? [[key, text]] : [];
  }));
  return {
    id,
    version,
    source: project(source, ["name", "summary", "modality", "inputs", "outputs", "askWhen", "usageScenarios", "method"]),
    normalized: {
      ...(safeText(normalized.modality, 80) ? { modality: safeText(normalized.modality, 80) } : {}),
      ...(Array.isArray(normalized.inputHints) ? {
        inputHints: normalized.inputHints.map((hint) => {
          if (!isRecord(hint)) return null;
          const key = safeText(hint.key, 80);
          const label = safeText(hint.label, 200);
          const kind = safeText(hint.kind, 40);
          return key && label && kind ? { key, label, kind, required: hint.required === true } : null;
        }).filter(Boolean).slice(0, 20),
      } : {}),
      ...(Array.isArray(normalized.methodSteps) ? { methodSteps: normalized.methodSteps.slice(0, 12).map((step) => isRecord(step) ? { id: safeId(step.id), action: safeText(step.action, 80), instruction: safeText(step.instruction, MAX_TEXT) } : null).filter(Boolean) } : {}),
      ...(Array.isArray(normalized.deliveryChecks) ? { deliveryChecks: normalized.deliveryChecks.map((value) => safeText(value, 300)).filter(Boolean).slice(0, 12) } : {}),
    },
  };
}

function safeModelCatalog(value: unknown): ScopedV2AgentModel[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((item) => {
    if (!isRecord(item)) return [];
    const displayName = safeText(item.displayName, 160);
    const modality = safeText(item.modality, 40);
    if (!displayName || !modality) return [];
    const capabilities = redactV2AgentContextValue(isRecord(item.capabilities) ? item.capabilities : {});
    const routes = Array.isArray(item.routes) ? item.routes : [];
    const activeRoutes = routes.filter((route) => isRecord(route) && route.status === "active");
    const prices = activeRoutes.flatMap((route) => {
      if (!isRecord(route) || route.status !== "active") return [];
      const estimated = typeof route.estimatedCredits === "number" && Number.isFinite(route.estimatedCredits) && route.estimatedCredits >= 0 ? route.estimatedCredits : null;
      return estimated === null ? [] : [estimated];
    });
    const pricing = activeRoutes.map((route) => {
      if (!isRecord(route) || !isRecord(route.pricing)) return null;
      const unitCredits = typeof route.pricing.unitCredits === "number" && Number.isFinite(route.pricing.unitCredits) && route.pricing.unitCredits > 0 ? route.pricing.unitCredits : null;
      const minChargeCredits = typeof route.pricing.minChargeCredits === "number" && Number.isFinite(route.pricing.minChargeCredits) && route.pricing.minChargeCredits > 0 ? route.pricing.minChargeCredits : null;
      const unit = safeText(route.pricing.unit, 80);
      return unitCredits !== null && minChargeCredits !== null && unit ? { unitCredits, minChargeCredits, unit, exact: route.pricing.exact === true } : null;
    }).find((candidate): candidate is NonNullable<typeof candidate> => candidate !== null) ?? null;
    const result: ScopedV2AgentModel = {
      availability: item.status === "active" ? "active" : "inactive",
      capabilities: isRecord(capabilities) ? capabilities : {},
      displayName,
      modality,
      pricing,
    };
    if (prices.length) result.priceRange = { minCredits: Math.min(...prices), maxCredits: Math.max(...prices) };
    return [result];
  });
}

function safeRecentRuns(value: unknown): ScopedV2AgentRun[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = safeId(item.id);
    const status = safeText(item.status, 40);
    if (!id || !status) return [];
    const modality = safeText(item.modality, 40);
    const summary = safeText(item.summary, 240);
    const createdAt = safeText(item.createdAt, 40);
    const nodeIds = Array.isArray(item.nodeIds) ? item.nodeIds.map((value) => safeId(value, 200)).filter((value): value is string => Boolean(value)).slice(0, 12) : undefined;
    const assetRefs = Array.isArray(item.assetRefs) ? item.assetRefs.slice(0, 12).flatMap((asset) => {
      if (!isRecord(asset)) return [];
      const assetId = safeId(asset.assetId);
      if (!assetId) return [];
      const kind = safeText(asset.kind, 40);
      const label = safeText(asset.label, 160);
      return [{ assetId, ...(kind ? { kind } : {}), ...(label ? { label } : {}) }];
    }) : undefined;
    return [{ id, status, ...(modality ? { modality } : {}), ...(summary ? { summary } : {}), ...(createdAt ? { createdAt } : {}), ...(nodeIds?.length ? { nodeIds } : {}), ...(assetRefs?.length ? { assetRefs } : {}) }];
  });
}

export function buildScopedV2AgentContext(input: BuildScopedV2AgentContextInput): ScopedV2AgentContext {
  const canvas = input.canvas ?? {};
  const outputs = isRecord(canvas.nodeOutputs) ? canvas.nodeOutputs : {};
  const nodes = safeList(canvas.nodes).map((node) => summarizeNode(isRecord(node) ? node : {}, outputs)).filter((node): node is ScopedV2AgentNode => node !== null);
  const selectedIds = new Set((Array.isArray(canvas.selectedNodeIds) ? canvas.selectedNodeIds : []).map(safeId).filter((id): id is string => Boolean(id)));
  nodes.forEach((node) => { if (node.selected) selectedIds.add(node.id); });
  const edges = safeList(canvas.edges).map((edge) => isRecord(edge) ? edge : {});
  const upstreamIds = nodeIdsConnected(edges, selectedIds, "upstream");
  const downstreamIds = nodeIdsConnected(edges, selectedIds, "downstream");
  const bounds = viewportBounds(canvas.viewport);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selectedNodes = [...selectedIds].map((id) => byId.get(id)).filter((node): node is ScopedV2AgentNode => Boolean(node)).slice(0, MAX_NODES);
  const upstreamNodes = [...upstreamIds].map((id) => byId.get(id)).filter((node): node is ScopedV2AgentNode => Boolean(node)).slice(0, MAX_NODES);
  const downstreamNodes = [...downstreamIds].map((id) => byId.get(id)).filter((node): node is ScopedV2AgentNode => Boolean(node)).slice(0, MAX_NODES);
  const viewportNodes = nodes.filter((node) => isInViewport(node, bounds)).slice(0, MAX_NODES);
  const result: ScopedV2AgentContext = {
    capabilityScope: ["canvas.read", "canvas.write", "skill.load", "workflow.run"],
    contextScope: "selection+viewport+graph",
    downstreamNodes,
    graphRevision: Number.isSafeInteger(input.graphRevision) && input.graphRevision >= 0 ? input.graphRevision : 0,
    redactionVersion: "v2",
    modelCatalog: safeModelCatalog(input.modelCatalog),
    recentRuns: safeRecentRuns(input.recentRuns),
    selectedNodes,
    upstreamNodes,
    viewportNodes,
  };
  const flowId = safeId(canvas.flowId);
  const projectId = safeId(canvas.projectId);
  if (flowId) result.flowId = flowId;
  if (projectId) result.projectId = projectId;
  const prompt = safeText(input.prompt, 4000);
  if (prompt) result.untrustedPrompt = prompt;
  const skill = safeSkill(input.skill);
  if (skill) result.untrustedSkill = skill;
  return result;
}
