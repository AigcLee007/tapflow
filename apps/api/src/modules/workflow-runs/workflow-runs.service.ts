import { createHash, randomUUID } from "node:crypto";

import {
  applyMembershipDiscount,
  BillingService,
  BillingServiceError,
  createPgPool,
  PersonalWalletService,
  PersonalWalletServiceError,
  resolveMembershipDiscount,
  safeRecordAuditLog,
  withTenantTransaction,
} from "@aigc-flow/db";
import {
  QUEUE_NAMES,
  assertLightweightJobPayload,
  resolveNodeExecuteQueueName,
  type NodeExecuteJobPayload,
} from "@aigc-flow/redis";
import {
  checksumGraph,
  compileGraph,
  type CompiledWorkflow,
  type CompiledWorkflowNode,
  type FlowGraph,
  validateGraph,
  WorkflowGraphValidationError,
} from "@aigc-flow/workflow-core";
import {
  readVideoCapabilities,
  resolveTextGenerationCapabilities,
  validateTextImageInput,
  validateVideoGenerationRequest,
  type AssetReferenceInput,
  type TextGenerationCapabilities,
  type VideoGenerationCapabilities,
  type VideoGenerationParams,
  type VideoGenerationRequest,
} from "@aigc-flow/ai-gateway-core";
import type { Pool, PoolClient } from "pg";
import { assertDraftGraphSafe, normalizeDraftGraph } from "../flows/flows.service.js";

type PgPool = Pool;

type WorkflowRunContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

type NodeExecuteQueueLike = {
  add: (name: string, data: NodeExecuteJobPayload) => Promise<unknown>;
};

type NodeExecuteQueueMapLike = Partial<Record<"default" | "image" | "legacy" | "video", NodeExecuteQueueLike>>;

type FlowRuntimeRecord = {
  compiled_graph_json: CompiledWorkflow;
  current_version_id: string | null;
  draft_revision?: number | null;
  graph_checksum?: string | null;
  graph_source?: "draft" | "flow_version" | "snapshot";
  flow_id: string;
  flow_status: string;
};

type FlowDraftGraph = {
  edges: Record<string, unknown>[];
  nodes: Record<string, unknown>[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

type FlowDraftRecord = {
  graph_json: FlowDraftGraph;
  revision?: number;
};

type WorkflowRunMode = "flow" | "target_node" | "group";

type FlowVersionRecord = {
  checksum?: string;
  compiled_graph_json?: CompiledWorkflow;
  id: string;
};

type ExternalGroupDependencySnapshot = {
  dataType: "any" | "audio" | "image" | "json" | "text" | "video";
  nodeId: string;
  nodeType: string;
  outputJson: Record<string, unknown>;
  sourceWorkflowRunId: string;
};

type CreatedRunTransactionResult = {
  enqueuePayloads: NodeExecuteJobPayload[];
  flowRowLockUsed: boolean;
  graphChecksum: string | null;
  graphRevision: number | null;
  graphSource: string;
  nodeRunIds: string[];
  run: WorkflowRunView;
};

type PricingRow = {
  metadata?: Record<string, unknown> | null;
  min_charge_credits: string;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unit_credits: string;
};

export type PricingMatchInfo = {
  model: string;
  provider: string;
  route: string;
  unit: string;
};

export type ResolvedNodePricing = {
  amountCents: number;
  fallbackLevel: 1 | 2 | 3 | 4 | null;
  pricingMatch: PricingMatchInfo | null;
  quantity: number;
  unit: string | null;
};

type RouteRuntimeContext = {
  capabilities: Partial<VideoGenerationCapabilities> & TextGenerationCapabilities & {
    supportedGenerationModes: string[];
    supportedVideoWorkflows: string[];
  };
  modelKey: string;
  providerKey: string;
  requireExactPricing?: boolean;
  routeKey: string;
};

type WorkflowRunRecord = {
  canceled_at: string | null;
  created_at: string;
  created_by: string | null;
  error_json: Record<string, unknown> | null;
  finished_at: string | null;
  flow_id: string;
  flow_version_id: string;
  id: string;
  idempotency_key: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  started_at: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
};

type NodeRunRecord = {
  attempt: number;
  cost_json: Record<string, unknown>;
  created_at: string;
  error_json: Record<string, unknown> | null;
  finished_at: string | null;
  id: string;
  input_json: Record<string, unknown>;
  max_attempts: number;
  node_id: string;
  node_type: string;
  output_json: Record<string, unknown> | null;
  provider_task_id: string | null;
  started_at: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
  workflow_run_id: string;
};

type WorkflowRunEventRecord = {
  created_at: string;
  event_type: string;
  id: string;
  node_run_id: string | null;
  payload: Record<string, unknown>;
  sequence: number;
  tenant_id: string;
  workflow_run_id: string;
};

export type WorkflowRunView = {
  canceledAt: string | null;
  createdAt: string;
  createdBy: string | null;
  errorJson: Record<string, unknown> | null;
  finishedAt: string | null;
  flowId: string;
  flowVersionId: string;
  id: string;
  idempotencyKey: string | null;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  startedAt: string | null;
  status: string;
  tenantId: string;
  updatedAt: string;
};

export type WorkflowRunStatusView = Pick<
  WorkflowRunView,
  "canceledAt" | "finishedAt" | "id" | "status" | "tenantId"
>;

export type NodeRunView = {
  attempt: number;
  costJson: Record<string, unknown>;
  createdAt: string;
  errorJson: Record<string, unknown> | null;
  finishedAt: string | null;
  id: string;
  inputJson: Record<string, unknown>;
  maxAttempts: number;
  nodeId: string;
  nodeType: string;
  outputJson: Record<string, unknown> | null;
  providerTaskId: string | null;
  startedAt: string | null;
  status: string;
  tenantId: string;
  updatedAt: string;
  workflowRunId: string;
};

export type WorkflowRunEventView = {
  createdAt: string;
  eventType: string;
  id: string;
  nodeRunId: string | null;
  payload: Record<string, unknown>;
  sequence: number;
  tenantId: string;
  workflowRunId: string;
};

export class WorkflowRunsApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "WorkflowRunsApiError";
    this.statusCode = statusCode;
  }
}

const AUTO_RUN_SNAPSHOT_CHANGELOG = "auto_run_snapshot";
const DEFAULT_ROUTE_BY_NODE_TYPE: Record<string, string> = {
  "image.generate": "image.default",
  "text.generate": "text.gpt-5-5",
  "video.generate": "video.default",
};
const SUPPORTED_VIDEO_EDITOR_EXPORT_WORKFLOW = "video_editor_export";
const VIDEO_GENERATION_WORKFLOW = "video_generation";
const KNOWN_VIDEO_WORKFLOWS = new Set([
  SUPPORTED_VIDEO_EDITOR_EXPORT_WORKFLOW,
  VIDEO_GENERATION_WORKFLOW,
]);
const KNOWN_IMAGE_GENERATION_MODES = new Set([
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
]);
const UNIT_BY_NODE_TYPE: Record<string, string> = {
  "image.generate": "image_generation",
  "text.generate": "text_generation",
  "video.generate": "video_generation",
};

export function resolveNodePricing(input: {
  configuredRouteKey: string | null;
  nodeConfig?: Record<string, unknown> | null;
  nodeType: string;
  pricingRows: PricingRow[];
  quantity?: number;
  routeContext: RouteRuntimeContext | null;
}): ResolvedNodePricing {
  const unit = UNIT_BY_NODE_TYPE[input.nodeType] ?? null;
  if (!unit) {
    return {
      amountCents: 0,
      fallbackLevel: null,
      pricingMatch: null,
      quantity: 1,
      unit: null,
    };
  }

  const configuredRoute = input.configuredRouteKey?.trim() ?? "";
  const effectiveRoute = configuredRoute || DEFAULT_ROUTE_BY_NODE_TYPE[input.nodeType] || "default";
  const provider = input.routeContext?.providerKey ?? "default";
  const model = input.routeContext?.modelKey ?? "default";
  const rawCandidates: Array<{ fallbackLevel: 1 | 2 | 3 | 4; model: string; provider: string; route: string }> = [
    { fallbackLevel: 1, model, provider, route: effectiveRoute },
    { fallbackLevel: 2, model, provider, route: "default" },
    { fallbackLevel: 3, model: "default", provider, route: "default" },
    { fallbackLevel: 4, model: "default", provider: "default", route: "default" },
  ];
  const dedupedCandidates = new Map<string, { fallbackLevel: 1 | 2 | 3 | 4; model: string; provider: string; route: string }>();
  for (const candidate of rawCandidates) {
    const key = `${candidate.provider}::${candidate.model}::${candidate.route}`;
    const existing = dedupedCandidates.get(key);
    if (!existing || candidate.fallbackLevel > existing.fallbackLevel) {
      dedupedCandidates.set(key, candidate);
    }
  }
  const candidates = input.routeContext?.requireExactPricing
    ? rawCandidates.filter((candidate) => candidate.fallbackLevel === 1)
    : Array.from(dedupedCandidates.values())
      .sort((left, right) => left.fallbackLevel - right.fallbackLevel);

  const matched = candidates
    .map((candidate) => ({
      candidate,
      row: input.pricingRows.find((pricing) =>
        pricing.unit === unit &&
        pricing.provider === candidate.provider &&
        pricing.model === candidate.model &&
        pricing.route === candidate.route),
    }))
    .find((entry) => entry.row);

  if (!matched || !matched.row) {
    return {
      amountCents: 0,
      fallbackLevel: null,
      pricingMatch: null,
      quantity: 1,
      unit,
    };
  }

  const durationSeconds = readVideoDurationSeconds(input.nodeConfig);
  const isDurationSecondBilling = input.nodeType === "video.generate"
    && matched.row.metadata?.billingBasis === "duration_second";
  if (isDurationSecondBilling && durationSeconds === null) {
    return {
      amountCents: 0,
      fallbackLevel: null,
      pricingMatch: null,
      quantity: 1,
      unit,
    };
  }
  const quantity = isDurationSecondBilling
    ? durationSeconds!
    : Math.max(1, Math.floor(input.quantity ?? 1));
  const tierCredits = resolvePricingTierCredits(matched.row.metadata, input.nodeConfig);
  const unitCredits = tierCredits ?? readPositivePricingNumber(matched.row.unit_credits);
  const minChargeCredits = tierCredits ?? readPositivePricingNumber(matched.row.min_charge_credits);

  return {
    amountCents: Math.max(minChargeCredits, unitCredits * quantity),
    fallbackLevel: matched.candidate.fallbackLevel,
    pricingMatch: {
      model: matched.row.model,
      provider: matched.row.provider,
      route: matched.row.route,
      unit,
    },
    quantity,
    unit,
  };
}

function readVideoDurationSeconds(nodeConfig: Record<string, unknown> | null | undefined): number | null {
  const config = isRecord(nodeConfig) ? nodeConfig : {};
  const params = isRecord(config.params) ? config.params : {};
  const videoGeneration = isRecord(params.videoGeneration) ? params.videoGeneration : {};
  const durationSeconds = videoGeneration.durationSeconds;
  return typeof durationSeconds === "number" && Number.isInteger(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : null;
}

function normalizePricingSizeTier(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized === "1K" || normalized === "2K" || normalized === "4K" ? normalized : null;
}

function readPricingSizeTierFromNodeConfig(nodeConfig: Record<string, unknown> | null | undefined): string | null {
  const config = isRecord(nodeConfig) ? nodeConfig : {};
  const params = isRecord(config.params) ? config.params : {};
  return normalizePricingSizeTier(params.size)
    ?? normalizePricingSizeTier(params.imageSize)
    ?? normalizePricingSizeTier(params.image_size)
    ?? normalizePricingSizeTier(config.size)
    ?? normalizePricingSizeTier(config.imageSize)
    ?? normalizePricingSizeTier(config.image_size);
}

function resolvePricingTierCredits(
  metadata: Record<string, unknown> | null | undefined,
  nodeConfig: Record<string, unknown> | null | undefined,
): number | null {
  const tiers = isRecord(metadata?.sizeTiers) ? metadata.sizeTiers : null;
  if (!tiers) {
    return null;
  }
  const tier = readPricingSizeTierFromNodeConfig(nodeConfig);
  if (!tier) {
    return null;
  }
  const value = tiers[tier] ?? tiers[tier.toLowerCase()];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readPositivePricingNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSupportedVideoWorkflows(source: unknown): string[] {
  const direct = isRecord(source) ? source.supportedVideoWorkflows : undefined;
  return (Array.isArray(direct) ? direct : [])
    .map((item) => String(item || "").trim())
    .filter((item) => KNOWN_VIDEO_WORKFLOWS.has(item))
    .filter(Boolean);
}

function readSupportedGenerationModes(source: unknown): string[] {
  const direct = isRecord(source) ? source.supportedGenerationModes : undefined;
  return (Array.isArray(direct) ? direct : [])
    .map((item) => String(item || "").trim())
    .filter((item) => KNOWN_IMAGE_GENERATION_MODES.has(item))
    .filter(Boolean);
}

function mergeRouteRuntimeCapabilities(input: {
  modelCapabilities?: Record<string, unknown> | null;
  requestConfig?: Record<string, unknown> | null;
}): RouteRuntimeContext["capabilities"] {
  const routeCapabilities = isRecord(input.requestConfig?.capabilities)
    ? input.requestConfig.capabilities
    : {};
  const supportedGenerationModes = Array.from(new Set([
    ...readSupportedGenerationModes(input.modelCapabilities),
    ...readSupportedGenerationModes(routeCapabilities),
  ]));
  const videoCapabilities = readVideoCapabilities(routeCapabilities)
    ?? readVideoCapabilities(input.modelCapabilities);
  const textCapabilities = resolveTextGenerationCapabilities(input.modelCapabilities, routeCapabilities);
  return {
    ...(videoCapabilities ?? {}),
    ...textCapabilities,
    supportedGenerationModes: supportedGenerationModes.length > 0 ? supportedGenerationModes : ["standard"],
    supportedVideoWorkflows: Array.from(new Set([
      ...readSupportedVideoWorkflows(input.modelCapabilities),
      ...readSupportedVideoWorkflows(routeCapabilities),
    ])),
  };
}

function getOrderedDependencyIds(node: Pick<CompiledWorkflow["nodes"][number], "config"> & { dependencies?: string[] }): string[] {
  const dependencies = Array.isArray(node.dependencies) ? node.dependencies : [];
  const requestedOrder = Array.isArray(node.config?.inputOrder)
    ? node.config.inputOrder
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.startsWith("upstream:") ? value.slice("upstream:".length) : "")
      .filter((dependencyId) => dependencies.includes(dependencyId))
    : [];
  return Array.from(new Set([...requestedOrder, ...dependencies]));
}

export function getTextImageInputCandidates(
  node: CompiledWorkflow["nodes"][number],
  workflow: CompiledWorkflow,
  capabilities: TextGenerationCapabilities,
): AssetReferenceInput[] {
  const nodesById = new Map(workflow.nodes.map((candidate) => [candidate.id, candidate]));
  return getOrderedDependencyIds(node)
    .map((dependencyId) => nodesById.get(dependencyId))
    .filter((dependency): dependency is CompiledWorkflow["nodes"][number] =>
      dependency?.type === "image.asset" || dependency?.type === "image.generate")
    .map((dependency) => ({
      // The API validates deterministic topology only. The Worker validates real tenant assets and MIME types.
      assetId: dependency.id,
      kind: "image",
      mimeType: capabilities.supportedImageMimeTypes[0] ?? "image/png",
    }));
}

export function assertTextImageInputsSupportedByRuntimeGraph(input: {
  node: CompiledWorkflow["nodes"][number];
  routeContext: RouteRuntimeContext | null;
  workflow: CompiledWorkflow;
}): void {
  if (input.node.type !== "text.generate") return;
  const nodesById = new Map(input.workflow.nodes.map((candidate) => [candidate.id, candidate]));
  const unsupportedMediaDependency = getOrderedDependencyIds(input.node)
    .map((dependencyId) => nodesById.get(dependencyId))
    .find((dependency) => dependency?.type === "video.asset" || dependency?.type === "video.generate" || dependency?.type === "audio.asset" || dependency?.type === "audio.generate");
  if (unsupportedMediaDependency) {
    throw new WorkflowRunsApiError(
      422,
      "TEXT_IMAGE_TYPE_UNSUPPORTED",
      "Only image inputs are supported for text generation.",
    );
  }
  const issue = validateTextImageInput({
    capabilities: input.routeContext?.capabilities ?? {
      maxImages: 0,
      supportedImageMimeTypes: [],
      supportsImageInput: false,
    },
    inputAssets: getTextImageInputCandidates(
      input.node,
      input.workflow,
      input.routeContext?.capabilities ?? {
        maxImages: 0,
        supportedImageMimeTypes: [],
        supportsImageInput: false,
      },
    ),
  });
  if (issue) {
    throw new WorkflowRunsApiError(422, issue.code, issue.message);
  }
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveConfiguredRouteKey(node: Pick<CompiledWorkflow["nodes"][number], "config" | "type">): string | null {
  const config = isRecord(node.config) ? node.config : {};
  const params = isRecord(config.params) ? config.params : {};
  const imageEditRequest = isRecord(config.imageEditRequest) ? config.imageEditRequest : {};
  const imageEditMapping = isRecord(params.imageEditMapping) ? params.imageEditMapping : {};

  return readTrimmedString(config.routeKey)
    ?? readTrimmedString(imageEditRequest.routeKey)
    ?? readTrimmedString(imageEditMapping.routeKey)
    ?? null;
}

function resolveEffectiveRouteKey(node: Pick<CompiledWorkflow["nodes"][number], "config" | "type">): string {
  return resolveConfiguredRouteKey(node) ?? DEFAULT_ROUTE_BY_NODE_TYPE[node.type] ?? "default";
}

function hasVideoEditorExportMetadata(node: Pick<CompiledWorkflow["nodes"][number], "config" | "type">): boolean {
  if (node.type !== "video.generate") {
    return false;
  }
  const config = isRecord(node.config) ? node.config : {};
  const params = isRecord(config.params) ? config.params : {};
  return isRecord(params.videoEditor);
}

function readImageGenerationMode(node: Pick<CompiledWorkflow["nodes"][number], "config" | "type">): string {
  if (node.type !== "image.generate") {
    return "standard";
  }
  const config = isRecord(node.config) ? node.config : {};
  const params = isRecord(config.params) ? config.params : {};
  const rawMode = readTrimmedString(config.generationMode) ?? readTrimmedString(params.generationMode);
  return rawMode && KNOWN_IMAGE_GENERATION_MODES.has(rawMode) ? rawMode : "standard";
}

function extractStaticTextFromConfig(config: Record<string, unknown>): string {
  for (const candidate of [config.text, config.generationPrompt, config.prompt, config.content, config.value]) {
    const text = readTrimmedString(candidate);
    if (text) return text;
  }
  return "";
}

function resolveVideoPreflightPrompt(
  node: Pick<CompiledWorkflowNode, "config"> & { dependencies?: string[] },
  compiledGraph?: Pick<CompiledWorkflow, "nodes">,
): string {
  const upstreamText = getOrderedDependencyIds(node)
    .map((dependencyId) => compiledGraph?.nodes.find((candidate) => candidate.id === dependencyId))
    .map((dependencyNode) => dependencyNode ? extractStaticTextFromConfig(dependencyNode.config) : "")
    .filter(Boolean)
    .join("\n");
  const localPrompt = readTrimmedString(node.config.generationPrompt)
    ?? readTrimmedString(node.config.prompt)
    ?? "";
  return [upstreamText, localPrompt].filter(Boolean).join("\n");
}

function readStructuredVideoGenerationRequest(
  node: Pick<CompiledWorkflow["nodes"][number], "config" | "type">,
  prompt: string,
): VideoGenerationRequest | null {
  if (node.type !== "video.generate") return null;
  const config = isRecord(node.config) ? node.config : {};
  const params = isRecord(config.params) ? config.params : {};
  const videoGeneration = isRecord(params.videoGeneration) ? params.videoGeneration : null;
  if (!videoGeneration || videoGeneration.schemaVersion !== 2) return null;
  if (!Array.isArray(videoGeneration.referenceInputs)) {
    throw new WorkflowRunsApiError(
      422,
      "REFERENCE_ASSET_NOT_FOUND",
      "REFERENCE_ASSET_NOT_FOUND: Structured video references must be an array.",
    );
  }
  const references = videoGeneration.referenceInputs;
  const inputAssets: AssetReferenceInput[] = references.map((reference, index) => {
    if (!isRecord(reference) || !isRecord(reference.source)) {
      throw new WorkflowRunsApiError(
        422,
        "REFERENCE_ASSET_NOT_FOUND",
        `REFERENCE_ASSET_NOT_FOUND: Structured video reference ${index} is invalid.`,
      );
    }
    const sourceKind = reference.source.kind;
    const sourceId = readTrimmedString(reference.source.id);
    const mediaKind = readTrimmedString(reference.mediaKind);
    const referenceKey = readTrimmedString(reference.referenceKey);
    const role = readTrimmedString(reference.role);
    const order = reference.order;
    if (
      !sourceId || !mediaKind || !referenceKey || !role || !Number.isInteger(order)
      || (sourceKind !== "asset" && sourceKind !== "upstream")
    ) {
      throw new WorkflowRunsApiError(
        422,
        "REFERENCE_ASSET_NOT_FOUND",
        `REFERENCE_ASSET_NOT_FOUND: Structured video reference ${index} is invalid.`,
      );
    }
    return {
      assetId: sourceId,
      kind: mediaKind,
      metadata: {
        videoReference: {
          mediaKind,
          order,
          referenceKey,
          role,
          sourceKind,
          sourceNodeId: sourceKind === "upstream" ? sourceId : null,
        },
      },
      mimeType: null,
    };
  });
  return {
    inputAssets,
    metadata: null,
    model: null,
    params: {
      aspectRatio: videoGeneration.aspectRatio,
      count: videoGeneration.count,
      durationSeconds: videoGeneration.durationSeconds,
      generateAudio: videoGeneration.generateAudio,
      mode: videoGeneration.mode,
      resolution: videoGeneration.resolution,
    } as VideoGenerationParams,
    prompt,
    routeKey: resolveConfiguredRouteKey(node),
  };
}

export function assertNodeRouteSupportsRuntimeRequest(input: {
  compiledGraph?: Pick<CompiledWorkflow, "nodes">;
  node: Pick<CompiledWorkflow["nodes"][number], "config" | "id" | "type"> & { dependencies?: string[] };
  routeContext: RouteRuntimeContext | null;
}): void {
  const generationMode = readImageGenerationMode(input.node);
  if (generationMode !== "standard") {
    const supportedGenerationModes = input.routeContext?.capabilities.supportedGenerationModes ?? ["standard"];
    if (!supportedGenerationModes.includes(generationMode)) {
      throw new WorkflowRunsApiError(
        422,
        "UNSUPPORTED_GENERATION_MODE",
        `UNSUPPORTED_GENERATION_MODE: Route ${input.routeContext?.routeKey ?? resolveEffectiveRouteKey(input.node)} does not support ${generationMode} for node ${input.node.id}.`,
      );
    }
  }

  if (!hasVideoEditorExportMetadata(input.node)) {
    const request = readStructuredVideoGenerationRequest(
      input.node,
      resolveVideoPreflightPrompt(input.node, input.compiledGraph),
    );
    if (!request) return;
    const capabilities = readVideoCapabilities(input.routeContext?.capabilities);
    if (!capabilities || !input.routeContext?.capabilities.supportedVideoWorkflows.includes("video_generation")) {
      throw new WorkflowRunsApiError(
        422,
        "UNSUPPORTED_VIDEO_MODE",
        `UNSUPPORTED_VIDEO_MODE: Route ${input.routeContext?.routeKey ?? resolveEffectiveRouteKey(input.node)} does not support structured video generation for node ${input.node.id}.`,
      );
    }
    const [issue] = validateVideoGenerationRequest(request, capabilities);
    if (issue) {
      throw new WorkflowRunsApiError(422, issue.code, issue.message);
    }
    return;
  }
  const supportedVideoWorkflows = input.routeContext?.capabilities.supportedVideoWorkflows ?? [];
  if (supportedVideoWorkflows.includes(SUPPORTED_VIDEO_EDITOR_EXPORT_WORKFLOW)) {
    return;
  }

  throw new WorkflowRunsApiError(
    422,
    "UNSUPPORTED_VIDEO_EDITOR_EXPORT",
    `UNSUPPORTED_VIDEO_EDITOR_EXPORT: Route ${input.routeContext?.routeKey ?? resolveEffectiveRouteKey(input.node)} does not support video editor export for node ${input.node.id}.`,
  );
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
}

function resolveNodePricingQuantity(node: CompiledWorkflow["nodes"][number]): number {
  if (node.type !== "image.generate") {
    return 1;
  }

  const params = isRecord(node.config?.params) ? node.config.params : {};
  return readPositiveInteger(node.config?.batchCount)
    ?? readPositiveInteger(params.n)
    ?? readPositiveInteger(node.config?.n)
    ?? 1;
}

function normalizeNodeTypeForRuntime(type: string): string {
  if (type === "text") {
    return "text.generate";
  }
  if (type === "image") {
    return "image.generate";
  }
  if (type === "video") {
    return "video.generate";
  }
  return type;
}

function normalizeGraphForRuntime(graph: FlowGraph): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      type: normalizeNodeTypeForRuntime(node.type),
    })),
  };
}

function hasLegacySimplifiedNodeType(compiled: CompiledWorkflow | null | undefined): boolean {
  if (!compiled?.nodes?.length) {
    return false;
  }
  return compiled.nodes.some((node) =>
    node.type === "image" || node.type === "text" || node.type === "video"
  );
}

function mapWorkflowRun(row: WorkflowRunRecord): WorkflowRunView {
  return {
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    errorJson: row.error_json,
    finishedAt: row.finished_at,
    flowId: row.flow_id,
    flowVersionId: row.flow_version_id,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    inputJson: row.input_json ?? {},
    outputJson: row.output_json,
    startedAt: row.started_at,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function mapNodeRun(row: NodeRunRecord): NodeRunView {
  return {
    attempt: row.attempt,
    costJson: row.cost_json ?? {},
    createdAt: row.created_at,
    errorJson: row.error_json,
    finishedAt: row.finished_at,
    id: row.id,
    inputJson: row.input_json ?? {},
    maxAttempts: row.max_attempts,
    nodeId: row.node_id,
    nodeType: row.node_type,
    outputJson: row.output_json,
    providerTaskId: row.provider_task_id,
    startedAt: row.started_at,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    workflowRunId: row.workflow_run_id,
  };
}

function mapWorkflowRunEvent(row: WorkflowRunEventRecord): WorkflowRunEventView {
  return {
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    nodeRunId: row.node_run_id,
    payload: row.payload ?? {},
    sequence: row.sequence,
    tenantId: row.tenant_id,
    workflowRunId: row.workflow_run_id,
  };
}

function isTerminalRunStatus(status: string): boolean {
  return status === "failed" || status === "canceled" || status === "succeeded";
}

function getRequestedRunMode(input: Record<string, unknown> | undefined): WorkflowRunMode {
  if (input?.runMode === "target_node" || input?.runMode === "group") {
    return input.runMode;
  }
  return "flow";
}

function getRequestedTargetNodeId(input: Record<string, unknown> | undefined): string | null {
  return typeof input?.targetNodeId === "string" && input.targetNodeId.trim()
    ? input.targetNodeId.trim()
    : null;
}

function getRequestedGroupId(input: Record<string, unknown> | undefined): string | null {
  return typeof input?.groupId === "string" && input.groupId.trim() ? input.groupId.trim() : null;
}

function buildGroupPlanHash(groupId: string, nodeIds: string[], workflow: CompiledWorkflow): string {
  const nodes = workflow.nodes
    .filter((node) => nodeIds.includes(node.id))
    .map((node) => ({ dependencies: node.dependencies.filter((id) => nodeIds.includes(id)), id: node.id, type: node.type }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify({ groupId, nodes })).digest("hex");
}

function readExternalEdgeDataType(
  workflow: CompiledWorkflow,
  sourceNodeId: string,
  targetNodeId: string,
): ExternalGroupDependencySnapshot["dataType"] {
  const value = workflow.edges.find((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)?.data?.dataType;
  return value === "audio" || value === "image" || value === "json" || value === "text" || value === "video"
    ? value
    : "any";
}

function outputMatchesExternalDataType(
  output: Record<string, unknown>,
  dataType: ExternalGroupDependencySnapshot["dataType"],
): boolean {
  if (dataType === "text") return typeof output.text === "string" && output.text.trim().length > 0;
  if (dataType === "json") return Object.keys(output).length > 0;
  if (dataType === "any") return Object.keys(output).length > 0;
  const assets = Array.isArray(output.assets) ? output.assets : [];
  return assets.some((asset) => isRecord(asset) && asset.kind === dataType && typeof asset.assetId === "string" && asset.assetId.trim());
}

export function assertGroupNodeConfiguration(node: CompiledWorkflowNode): void {
  const config = isRecord(node.config) ? node.config : {};
  if (!readTrimmedString(config.generationPrompt)) {
    throw new WorkflowRunsApiError(422, "GROUP_MISSING_GENERATION_PROMPT", `Node ${node.id} requires a generation prompt.`);
  }
  if (!readTrimmedString(config.routeId) && !resolveConfiguredRouteKey(node) && !readTrimmedString(config.modelId)) {
    throw new WorkflowRunsApiError(422, "GROUP_MISSING_ROUTE", `Node ${node.id} requires a model route.`);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

export class WorkflowRunsService {
  readonly billingService: BillingService;
  readonly personalWalletService: PersonalWalletService;
  readonly nodeExecuteQueues: NodeExecuteQueueMapLike;
  readonly nodeExecuteQueue: NodeExecuteQueueLike;
  readonly pool: PgPool;

  constructor(options: {
    billingService?: BillingService;
    personalWalletService?: PersonalWalletService;
    nodeExecuteQueue: NodeExecuteQueueLike;
    nodeExecuteQueues?: NodeExecuteQueueMapLike;
    pool?: PgPool;
  }) {
    this.nodeExecuteQueue = options.nodeExecuteQueue;
    this.nodeExecuteQueues = {
      legacy: options.nodeExecuteQueue,
      ...options.nodeExecuteQueues,
    };
    this.pool = options.pool ?? createPgPool();
    this.billingService = options.billingService ?? new BillingService({ pool: this.pool });
    this.personalWalletService = options.personalWalletService ?? new PersonalWalletService({ pool: this.pool });
  }

  async createWorkflowRun(
    context: WorkflowRunContext,
    flowId: string,
    input: {
      idempotencyKey?: string;
      input?: Record<string, unknown>;
    },
  ): Promise<{
    runId: string;
    status: string;
  }> {
    if (!context.userId) {
      throw new WorkflowRunsApiError(401, "AUTH_REQUIRED", "Authentication is required to run a workflow");
    }
    const billedUserId = context.userId;
    const startedAt = Date.now();
    const runInput = input.input ?? {};
    const runMode = getRequestedRunMode(runInput);
    const targetNodeId = getRequestedTargetNodeId(runInput);
    const groupId = getRequestedGroupId(runInput);
    this.logCreateRunDiagnostic(
      {
        flowId,
        flowRowLockUsed: runMode !== "target_node",
        runMode,
        startTimestamp: new Date(startedAt).toISOString(),
        targetNodeId,
        tenantId: context.tenantId,
        traceId: context.traceId ?? null,
      },
      "workflow run creation started",
    );

    let createdRun: CreatedRunTransactionResult;
    try {
      createdRun = await withTenantTransaction(context, async (client) => {
        const runtimeStartedAt = Date.now();
        const runtimeFlow = runMode === "target_node"
          ? await this.getTargetNodeFlowRuntimeWithoutFlowRowLock(client, context, flowId, targetNodeId)
          : await this.getCurrentFlowRuntimeOrCreateSnapshot(client, context, flowId);
        this.logCreateRunDiagnostic(
          {
            flowId,
            flowRowLockUsed: runMode !== "target_node",
            graphChecksum: runtimeFlow.graph_checksum ?? null,
            graphRevision: runtimeFlow.draft_revision ?? null,
            graphSource: runtimeFlow.graph_source ?? (runMode === "target_node" ? "draft" : "snapshot"),
            runMode,
            targetNodeId,
            timeBeforeDbInsertMs: Date.now() - runtimeStartedAt,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
          },
          "workflow run runtime graph loaded",
        );
        const routeContextStartedAt = Date.now();
        const routeContexts = await this.loadRouteRuntimeContexts(
          client,
          context.tenantId,
          runtimeFlow.compiled_graph_json.nodes,
        );
        this.logCreateRunDiagnostic(
          {
            flowId,
            routeContextLoadMs: Date.now() - routeContextStartedAt,
            runMode,
            targetNodeId,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
          },
          "workflow run route contexts loaded",
        );
        const targetNode =
          runMode === "target_node"
            ? runtimeFlow.compiled_graph_json.nodes.find((node) => node.id === targetNodeId)
            : null;

        if (runMode === "group" && !groupId) {
          throw new WorkflowRunsApiError(400, "GROUP_ID_REQUIRED", "A groupId is required to run a group.");
        }
        const groupNode = runMode === "group"
          ? runtimeFlow.compiled_graph_json.nodes.find((node) => node.id === groupId)
          : null;
        if (runMode === "group" && (!groupNode || groupNode.type !== "group")) {
          throw new WorkflowRunsApiError(400, "GROUP_NOT_FOUND", "The requested group was not found in the current draft.");
        }
        const groupNodeIds = runMode === "group"
          ? runtimeFlow.compiled_graph_json.nodes
            .filter((node) => node.parentId === groupId)
            .map((node) => node.id)
          : [];
        if (runMode === "group" && groupNodeIds.length === 0) {
          throw new WorkflowRunsApiError(422, "GROUP_EMPTY", "The group has no direct runnable children.");
        }
        const groupNodes = runMode === "group"
          ? runtimeFlow.compiled_graph_json.nodes.filter((node) => groupNodeIds.includes(node.id))
          : [];
        if (runMode === "group") {
          const nestedGroup = groupNodes.find((node) => node.type === "group");
          if (nestedGroup) {
            throw new WorkflowRunsApiError(422, "GROUP_NESTED_GROUP", `Nested group ${nestedGroup.id} cannot be run.`);
          }
          const unsupported = groupNodes.find((node) =>
            node.type !== "text.generate" && node.type !== "image.generate" && node.type !== "video.generate",
          );
          if (unsupported) {
            throw new WorkflowRunsApiError(422, "GROUP_NODE_UNSUPPORTED", `Node ${unsupported.id} is not executable in a group.`);
          }
          groupNodes.forEach(assertGroupNodeConfiguration);
        }
        const externalDependencyIds = runMode === "group"
          ? Array.from(new Set(groupNodes.flatMap((node) => node.dependencies.filter((dependencyId) => !groupNodeIds.includes(dependencyId)))))
          : [];
        const externalDependencies = await this.loadVerifiedExternalGroupDependencies(
          client,
          context.tenantId,
          runtimeFlow.flow_id,
          runtimeFlow.graph_checksum ?? "",
          externalDependencyIds.map((nodeId) => ({
            dataType: readExternalEdgeDataType(
              runtimeFlow.compiled_graph_json,
              nodeId,
              groupNodes.find((node) => node.dependencies.includes(nodeId))?.id ?? "",
            ),
            nodeId,
          })),
        );
        if (externalDependencies.length !== externalDependencyIds.length) {
          const verified = new Set(externalDependencies.map((dependency) => dependency.nodeId));
          throw new WorkflowRunsApiError(
            422,
            "GROUP_EXTERNAL_DEPENDENCY_INVALID",
            "Each external group dependency must have a successful current output in this flow.",
            { missingNodeIds: externalDependencyIds.filter((nodeId) => !verified.has(nodeId)) },
          );
        }

        if (runMode === "target_node" && !targetNode) {
          throw new WorkflowRunsApiError(400, "TARGET_NODE_NOT_FOUND", "未在当前画布中找到目标节点");
        }

        if (input.idempotencyKey) {
          const idempotencyStartedAt = Date.now();
          const existing = await client.query<WorkflowRunRecord>(
          `
            SELECT
              id::text AS id,
              tenant_id::text AS tenant_id,
              flow_id::text AS flow_id,
              flow_version_id::text AS flow_version_id,
              status,
              input_json,
              output_json,
              error_json,
              idempotency_key,
              created_by::text AS created_by,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              canceled_at::text AS canceled_at,
              created_at::text AS created_at,
              updated_at::text AS updated_at
            FROM workflow_runs
            WHERE tenant_id = $1::uuid
              AND idempotency_key = $2
            LIMIT 1
          `,
          [context.tenantId, input.idempotencyKey],
        );
          this.logCreateRunDiagnostic(
            {
              flowId,
              idempotencyLookupMs: Date.now() - idempotencyStartedAt,
              runMode,
              targetNodeId,
              tenantId: context.tenantId,
              traceId: context.traceId ?? null,
            },
            "workflow run idempotency checked",
          );

          if (existing.rows[0]) {
            return {
              enqueuePayloads: [],
              flowRowLockUsed: runMode !== "target_node",
              graphChecksum: runtimeFlow.graph_checksum ?? null,
              graphRevision: runtimeFlow.draft_revision ?? null,
              graphSource: runtimeFlow.graph_source ?? (runMode === "target_node" ? "draft" : "snapshot"),
              nodeRunIds: [],
              run: mapWorkflowRun(existing.rows[0]),
            } satisfies CreatedRunTransactionResult;
          }
        }

        const nodesToRun =
          runMode === "target_node" && targetNode
            ? [targetNode]
            : runMode === "group"
              ? groupNodes
            : runtimeFlow.compiled_graph_json.nodes;

        for (const node of nodesToRun) {
          const effectiveRoute = resolveEffectiveRouteKey(node);
          const routeContext = routeContexts.get(effectiveRoute) ?? null;
          assertTextImageInputsSupportedByRuntimeGraph({
            node,
            routeContext,
            workflow: runtimeFlow.compiled_graph_json,
          });
          assertNodeRouteSupportsRuntimeRequest({
            compiledGraph: runtimeFlow.compiled_graph_json,
            node,
            routeContext,
          });
        }

        const pricingStartedAt = Date.now();
        const pricingRows = await this.loadActivePricing(client);
        this.logCreateRunDiagnostic(
          {
            flowId,
            pricingLoadMs: Date.now() - pricingStartedAt,
            runMode,
            targetNodeId,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
          },
          "workflow run pricing loaded",
        );

        const normalizedRunInput: Record<string, unknown> = runMode === "group"
          ? {
              ...runInput,
              groupId,
              planHash: buildGroupPlanHash(groupId!, groupNodeIds, runtimeFlow.compiled_graph_json),
              runMode,
              scopeNodeIds: groupNodeIds.sort(),
              verifiedExternalDependencies: externalDependencies,
            }
          : runInput;
        const runId = randomUUID();
        const runInsertStartedAt = Date.now();
        const runInsert = await client.query<WorkflowRunRecord>(
        `
          INSERT INTO workflow_runs (
            id,
            tenant_id,
            flow_id,
            flow_version_id,
            status,
            input_json,
            idempotency_key,
            created_by,
            billed_user_id,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            'pending',
            $5::jsonb,
            $6,
            $7::uuid,
            $7::uuid,
            now()
          )
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            flow_version_id::text AS flow_version_id,
            status,
            input_json,
            output_json,
            error_json,
            idempotency_key,
            created_by::text AS created_by,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            canceled_at::text AS canceled_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
          [
            runId,
            context.tenantId,
            runtimeFlow.flow_id,
            runtimeFlow.current_version_id,
          JSON.stringify(normalizedRunInput),
          input.idempotencyKey ?? null,
          context.userId,
        ],
      );
        this.logCreateRunDiagnostic(
          {
            flowId,
            runInsertMs: Date.now() - runInsertStartedAt,
            runMode,
            targetNodeId,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
            workflowRunId: runId,
          },
          "workflow run row inserted",
        );

        const run = mapWorkflowRun(runInsert.rows[0]);

        await this.appendWorkflowRunEvent(client, {
          eventType: "workflow.run.created",
          payload: {
            flowId: runtimeFlow.flow_id,
            flowVersionId: runtimeFlow.current_version_id,
            status: run.status,
          },
          tenantId: context.tenantId,
          workflowRunId: run.id,
        });

        const payloadsToEnqueue: NodeExecuteJobPayload[] = [];
        const nodeRunIds: string[] = [];
        const membership = await this.loadMembershipDiscount(client, context.tenantId);

        for (const node of nodesToRun) {
          const isEntryNode =
            runMode === "target_node"
              ? node.id === targetNode?.id
              : runMode === "group"
                ? node.dependencies.every((dependencyId) => !groupNodeIds.includes(dependencyId))
                : runtimeFlow.compiled_graph_json.entryNodeIds.includes(node.id);
          const nodeRunId = randomUUID();
          nodeRunIds.push(nodeRunId);
          const estimatedCost = this.estimateNodeReserveCents(node, routeContexts, pricingRows);
          const originalCredits = estimatedCost.amountCents;
          const discountedCredits = applyMembershipDiscount(originalCredits, membership);
          if (estimatedCost.unit && estimatedCost.amountCents <= 0) {
            throw new WorkflowRunsApiError(
              422,
              "PRICING_NOT_FOUND",
              `No active pricing found for node ${node.id} (${node.type})`,
            );
          }

          const nodeRunInsertStartedAt = Date.now();
          await client.query(
          `
            INSERT INTO node_runs (
              id,
              tenant_id,
              workflow_run_id,
              node_id,
              node_type,
              status,
              input_json,
              cost_json,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4,
              $5,
              $6,
              $7::jsonb,
              $8::jsonb,
              now()
            )
          `,
          [
            nodeRunId,
            context.tenantId,
            run.id,
            node.id,
            node.type,
            isEntryNode ? "runnable" : "pending",
            JSON.stringify(node.config ?? {}),
            JSON.stringify({
              estimatedCredits: discountedCredits,
              estimatedCents: discountedCredits,
              discountMultiplier: membership.multiplier,
              membershipTier: membership.tier,
              originalCredits,
              originalCents: originalCredits,
              pricingFallbackLevel: estimatedCost.fallbackLevel,
              pricingMatch: estimatedCost.pricingMatch,
              pricingQuantity: estimatedCost.quantity,
              pricingUnit: estimatedCost.unit,
              reservedCredits: 0,
              reservedCents: 0,
              reserveLedgerId: null,
              reserveStatus: estimatedCost.amountCents > 0 ? "pending" : "not_required",
            }),
          ],
        );
          this.logCreateRunDiagnostic(
            {
              flowId,
              nodeRunId,
              nodeRunInsertMs: Date.now() - nodeRunInsertStartedAt,
              runMode,
              targetNodeId,
              tenantId: context.tenantId,
              traceId: context.traceId ?? null,
              workflowRunId: run.id,
            },
            "workflow node_run row inserted",
          );

          if (discountedCredits > 0 && (runMode !== "group" || isEntryNode)) {
            const reserveStartedAt = Date.now();
            let reserve;
            try {
              reserve = await this.personalWalletService.reserveUsageWithClient(client, { tenantId: context.tenantId, userId: billedUserId }, {
                amountCredits: discountedCredits,
                idempotencyKey: `reserve:${context.tenantId}:${run.id}:${nodeRunId}`,
                metadata: {
                  discountMultiplier: membership.multiplier,
                  discountedCredits,
                  flowId: runtimeFlow.flow_id,
                  flowVersionId: runtimeFlow.current_version_id,
                  membershipTier: membership.tier,
                  nodeId: node.id,
                  nodeRunId,
                  nodeType: node.type,
                  originalCredits,
                  pricingFallbackLevel: estimatedCost.fallbackLevel,
                  pricingMatch: estimatedCost.pricingMatch,
                  pricingQuantity: estimatedCost.quantity,
                  pricingUnit: estimatedCost.unit,
                  workflowRunId: run.id,
                },
              });
            } catch (error) {
              if ((error instanceof BillingServiceError || error instanceof PersonalWalletServiceError) && error.code === "INSUFFICIENT_BALANCE") {
                const account = await client.query<{
                  balance_cents: string;
                  reserved_cents: string;
                }>(
                  `
                    SELECT balance_cents::text AS balance_cents, reserved_cents::text AS reserved_cents
                    FROM billing_accounts
                    WHERE tenant_id = $1::uuid
                    LIMIT 1
                  `,
                  [context.tenantId],
                );
                const balanceCredits = Number(account.rows[0]?.balance_cents ?? "0") || 0;
                const reservedCredits = Number(account.rows[0]?.reserved_cents ?? "0") || 0;
                const availableCredits = Math.max(balanceCredits - reservedCredits, 0);
                throw new WorkflowRunsApiError(
                  402,
                  "INSUFFICIENT_CREDITS",
                  "余额不足，请充值或兑换点数后继续生成。",
                  {
                    availableCredits,
                    balanceCredits,
                    nodeId: node.id,
                    nodeRunId,
                    requiredCredits: discountedCredits,
                    reservedCredits,
                    workflowRunId: run.id,
                  },
                );
              }
              throw error;
            }

            await client.query(
            `
              UPDATE node_runs
              SET cost_json = cost_json || $2::jsonb
              WHERE id = $1::uuid
            `,
            [
              nodeRunId,
              JSON.stringify({
                estimatedCredits: discountedCredits,
                reservedCredits: discountedCredits,
                reservedCents: discountedCredits,
                reserveLedgerId: reserve.id,
                reserveStatus: "reserved",
              }),
            ],
          );
            this.logCreateRunDiagnostic(
              {
                billingReserveMs: Date.now() - reserveStartedAt,
                flowId,
                nodeRunId,
                reservedCents: discountedCredits,
                runMode,
                targetNodeId,
                tenantId: context.tenantId,
                traceId: context.traceId ?? null,
                workflowRunId: run.id,
              },
              "workflow node billing reserved",
            );
          }

          if (isEntryNode) {
            await this.appendWorkflowRunEvent(client, {
              eventType: "node.run.runnable",
              nodeRunId,
              payload: {
                nodeId: node.id,
                nodeType: node.type,
                status: "runnable",
              },
              tenantId: context.tenantId,
              workflowRunId: run.id,
            });

            const queuePayload: NodeExecuteJobPayload = {
              nodeRunId,
              nodeType: node.type,
              tenantId: context.tenantId,
              traceId: context.traceId ?? undefined,
              workflowRunId: run.id,
            };
            assertLightweightJobPayload(queuePayload);
            payloadsToEnqueue.push(queuePayload);
          }
        }

        return {
          enqueuePayloads: payloadsToEnqueue,
          flowRowLockUsed: runMode !== "target_node",
          graphChecksum: runtimeFlow.graph_checksum ?? null,
          graphRevision: runtimeFlow.draft_revision ?? null,
          graphSource: runtimeFlow.graph_source ?? (runMode === "target_node" ? "draft" : "snapshot"),
          nodeRunIds,
          run,
        } satisfies CreatedRunTransactionResult;
      }, this.pool);
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw new WorkflowRunsApiError(error.statusCode, error.code, error.message);
      }
      throw error;
    }

    try {
      for (const payload of createdRun.enqueuePayloads) {
        const enqueueStartedAt = Date.now();
        const queueName = resolveNodeExecuteQueueName(payload.nodeType);
        const queuedJob = await this.resolveNodeExecuteQueue(queueName).add(queueName, payload);
        this.logCreateRunDiagnostic(
          {
            enqueueJobId: this.extractQueueJobId(queuedJob),
            enqueueMs: Date.now() - enqueueStartedAt,
            flowId,
            nodeRunId: payload.nodeRunId,
            queueName,
            runMode,
            targetNodeId,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
            workflowRunId: payload.workflowRunId,
          },
          "workflow run node.execute job enqueued",
        );
      }
    } catch (error) {
      await this.markWorkflowRunQueueUnavailable(context, createdRun.run.id, error);
      throw new WorkflowRunsApiError(503, "QUEUE_UNAVAILABLE", "任务暂时无法加入执行队列，请稍后重试。");
    }

    await safeRecordAuditLog(
      {
        action: "workflow.run.create",
        actorType: context.userId ? "user" : "system",
        actorUserId: context.userId,
        ipHash: context.ipHash,
        metadata: {
          flowId,
          idempotencyKey: input.idempotencyKey ?? null,
          status: createdRun.run.status,
        },
        requestId: context.requestId,
        resourceId: createdRun.run.id,
        resourceType: "workflow_run",
        tenantId: context.tenantId,
        traceId: context.traceId,
        userAgent: context.userAgent,
      },
      {
        pool: this.pool,
      },
    );

    this.logCreateRunDiagnostic(
      {
        flowId,
        flowRowLockUsed: createdRun.flowRowLockUsed,
        graphChecksum: createdRun.graphChecksum,
        graphRevision: createdRun.graphRevision,
        graphSource: createdRun.graphSource,
        nodeRunIds: createdRun.nodeRunIds,
        runMode,
        targetNodeId,
        tenantId: context.tenantId,
        totalCreateRunLatencyMs: Date.now() - startedAt,
        traceId: context.traceId ?? null,
        workflowRunId: createdRun.run.id,
      },
      "workflow run creation completed",
    );

    return {
      runId: createdRun.run.id,
      status: createdRun.run.status,
    };
  }

  private resolveNodeExecuteQueue(queueName: string): NodeExecuteQueueLike {
    if (queueName === QUEUE_NAMES.nodeExecuteImage) {
      return this.nodeExecuteQueues.image ?? this.nodeExecuteQueue;
    }
    if (queueName === QUEUE_NAMES.nodeExecuteVideo) {
      return this.nodeExecuteQueues.video ?? this.nodeExecuteQueue;
    }
    if (queueName === QUEUE_NAMES.nodeExecuteDefault) {
      return this.nodeExecuteQueues.default ?? this.nodeExecuteQueue;
    }
    return this.nodeExecuteQueues.legacy ?? this.nodeExecuteQueue;
  }

  private async loadVerifiedExternalGroupDependencies(
    client: PoolClient,
    tenantId: string,
    flowId: string,
    graphChecksum: string,
    dependencies: Array<{ dataType: ExternalGroupDependencySnapshot["dataType"]; nodeId: string }>,
  ): Promise<ExternalGroupDependencySnapshot[]> {
    if (dependencies.length === 0) return [];
    const result = await client.query<{
      node_id: string;
      node_type: string;
      output_json: Record<string, unknown>;
      workflow_run_id: string;
    }>(
      `
        SELECT DISTINCT ON (node_runs.node_id)
          node_runs.node_id,
          node_runs.node_type,
          node_runs.output_json,
          node_runs.workflow_run_id::text AS workflow_run_id
        FROM node_runs
        JOIN workflow_runs ON workflow_runs.id = node_runs.workflow_run_id
        JOIN flow_versions ON flow_versions.id = workflow_runs.flow_version_id
        WHERE workflow_runs.tenant_id = $1::uuid
          AND workflow_runs.flow_id = $2::uuid
          AND flow_versions.checksum = $3
          AND workflow_runs.status = 'succeeded'
          AND node_runs.node_id = ANY($4::text[])
          AND node_runs.status = 'succeeded'
          AND node_runs.output_json IS NOT NULL
          AND node_runs.output_json <> '{}'::jsonb
          AND node_runs.error_json IS NULL
          AND NOT (node_runs.output_json ? 'error')
          AND NOT (node_runs.output_json ? 'providerError')
          AND NOT (node_runs.output_json ? 'providerFailure')
        ORDER BY node_runs.node_id, node_runs.finished_at DESC NULLS LAST, node_runs.updated_at DESC
      `,
      [tenantId, flowId, graphChecksum, dependencies.map((dependency) => dependency.nodeId)],
    );
    const typeByNodeId = new Map(dependencies.map((dependency) => [dependency.nodeId, dependency.dataType]));
    return result.rows.flatMap((row) => {
      const dataType = typeByNodeId.get(row.node_id) ?? "any";
      if (!outputMatchesExternalDataType(row.output_json, dataType)) return [];
      return [{
        dataType,
      nodeId: row.node_id,
      nodeType: row.node_type,
      outputJson: row.output_json,
      sourceWorkflowRunId: row.workflow_run_id,
      }];
    });
  }

  async getWorkflowRun(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<{
    nodeRuns: NodeRunView[];
    workflowRun: WorkflowRunView;
  }> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.getWorkflowRunOrThrow(client, runId);
      const nodeRuns = await client.query<NodeRunRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            workflow_run_id::text AS workflow_run_id,
            node_id,
            node_type,
            status,
            attempt,
            max_attempts,
            input_json,
            output_json,
            error_json,
            provider_task_id,
            cost_json,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM node_runs
          WHERE workflow_run_id = $1::uuid
          ORDER BY created_at ASC, id ASC
        `,
        [runId],
      );

      return {
        nodeRuns: nodeRuns.rows.map(mapNodeRun),
        workflowRun,
      };
    }, this.pool);
  }

  async listFlowWorkflowRuns(
    context: WorkflowRunContext,
    flowId: string,
    options?: {
      limit?: number;
      runMode?: WorkflowRunMode;
    },
  ): Promise<Array<{
    nodeRuns: NodeRunView[];
    workflowRun: WorkflowRunView;
  }>> {
    return withTenantTransaction(context, async (client) => {
      await this.getCurrentFlowRuntimeOrThrow(client, flowId);
      const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
      const runModeFilter = options?.runMode ?? null;
      const runsResult = await client.query<WorkflowRunRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            flow_version_id::text AS flow_version_id,
            status,
            input_json,
            output_json,
            error_json,
            idempotency_key,
            created_by::text AS created_by,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            canceled_at::text AS canceled_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM workflow_runs
          WHERE tenant_id = $1::uuid
            AND flow_id = $2::uuid
            AND ($3::text IS NULL OR input_json->>'runMode' = $3::text)
          ORDER BY created_at DESC, id DESC
          LIMIT $4::int
        `,
        [context.tenantId, flowId, runModeFilter, limit],
      );

      const workflowRuns = runsResult.rows.map(mapWorkflowRun);
      if (workflowRuns.length === 0) {
        return [];
      }

      const nodeRunsResult = await client.query<NodeRunRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            workflow_run_id::text AS workflow_run_id,
            node_id,
            node_type,
            status,
            attempt,
            max_attempts,
            input_json,
            output_json,
            error_json,
            provider_task_id,
            cost_json,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM node_runs
          WHERE tenant_id = $1::uuid
            AND workflow_run_id = ANY($2::uuid[])
          ORDER BY created_at ASC, id ASC
        `,
        [context.tenantId, workflowRuns.map((run) => run.id)],
      );

      const nodeRunsByRunId = new Map<string, NodeRunView[]>();
      for (const nodeRun of nodeRunsResult.rows.map(mapNodeRun)) {
        const list = nodeRunsByRunId.get(nodeRun.workflowRunId) ?? [];
        list.push(nodeRun);
        nodeRunsByRunId.set(nodeRun.workflowRunId, list);
      }

      return workflowRuns.map((workflowRun) => ({
        nodeRuns: nodeRunsByRunId.get(workflowRun.id) ?? [],
        workflowRun,
      }));
    }, this.pool);
  }

  async listWorkflowRunEvents(
    context: WorkflowRunContext,
    runId: string,
    options?: {
      afterSequence?: number;
    },
  ): Promise<WorkflowRunEventView[]> {
    return withTenantTransaction(context, async (client) => {
      await this.getWorkflowRunOrThrow(client, runId);

      const result = await client.query<WorkflowRunEventRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            workflow_run_id::text AS workflow_run_id,
            node_run_id::text AS node_run_id,
            event_type,
            sequence,
            payload,
            created_at::text AS created_at
          FROM workflow_run_events
          WHERE workflow_run_id = $1::uuid
            AND sequence > $2::int
          ORDER BY sequence ASC, id ASC
        `,
        [runId, options?.afterSequence ?? 0],
      );

      return result.rows.map(mapWorkflowRunEvent);
    }, this.pool);
  }

  async cancelWorkflowRun(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<WorkflowRunView> {
    const result = await withTenantTransaction(context, async (client) => {
      const current = await this.getWorkflowRunOrThrow(client, runId, true);
      if (isTerminalRunStatus(current.status)) {
        return {
          didCancel: false,
          workflowRun: current,
        };
      }

      await this.refundOpenReservations(client, runId, context.tenantId);

      const updated = await client.query<WorkflowRunRecord>(
        `
          UPDATE workflow_runs
          SET
            status = 'canceled',
            canceled_at = now(),
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            flow_id::text AS flow_id,
            flow_version_id::text AS flow_version_id,
            status,
            input_json,
            output_json,
            error_json,
            idempotency_key,
            created_by::text AS created_by,
            started_at::text AS started_at,
            finished_at::text AS finished_at,
            canceled_at::text AS canceled_at,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [runId],
      );

      await this.appendWorkflowRunEvent(client, {
        eventType: "workflow.run.canceled",
        payload: {
          status: "canceled",
        },
        tenantId: context.tenantId,
        workflowRunId: runId,
      });

      return {
        didCancel: true,
        workflowRun: mapWorkflowRun(updated.rows[0]),
      };
    }, this.pool);

    if (result.didCancel) {
      await safeRecordAuditLog(
        {
          action: "workflow.run.cancel",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            status: result.workflowRun.status,
          },
          requestId: context.requestId,
          resourceId: result.workflowRun.id,
          resourceType: "workflow_run",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
    }

    return result.workflowRun;
  }

  async getWorkflowRunStatus(
    context: WorkflowRunContext,
    runId: string,
  ): Promise<WorkflowRunStatusView> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.getWorkflowRunOrThrow(client, runId);
      return {
        canceledAt: workflowRun.canceledAt,
        finishedAt: workflowRun.finishedAt,
        id: workflowRun.id,
        status: workflowRun.status,
        tenantId: workflowRun.tenantId,
      };
    }, this.pool);
  }

  isTerminalWorkflowRunStatus(status: string): boolean {
    return isTerminalRunStatus(status);
  }

  private async appendWorkflowRunEvent(
    client: PoolClient,
    input: {
      eventType: string;
      nodeRunId?: string;
      payload: Record<string, unknown>;
      tenantId: string;
      workflowRunId: string;
    },
  ): Promise<void> {
    const sequenceResult = await client.query<{ next_sequence: number }>(
      `
        SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
        FROM workflow_run_events
        WHERE workflow_run_id = $1::uuid
      `,
      [input.workflowRunId],
    );

    await client.query(
      `
        INSERT INTO workflow_run_events (
          tenant_id,
          workflow_run_id,
          node_run_id,
          event_type,
          sequence,
          payload
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5::int,
          $6::jsonb
        )
      `,
      [
        input.tenantId,
        input.workflowRunId,
        input.nodeRunId ?? null,
        input.eventType,
        sequenceResult.rows[0]?.next_sequence ?? 1,
        JSON.stringify(input.payload),
      ],
    );
  }

  private async loadActivePricing(client: PoolClient): Promise<PricingRow[]> {
    const result = await client.query<PricingRow>(
      `
        SELECT
          provider,
          model,
          route,
          unit,
          unit_credits::text AS unit_credits,
          min_charge_credits::text AS min_charge_credits,
          metadata
        FROM model_pricing
        WHERE active = true
      `,
    );
    return result.rows;
  }

  private async loadMembershipDiscount(client: PoolClient, tenantId: string) {
    const result = await client.query<{ membership_tier: string }>(
      `
        SELECT membership_tier
        FROM billing_accounts
        WHERE tenant_id = $1::uuid
        LIMIT 1
      `,
      [tenantId],
    );
    return resolveMembershipDiscount(result.rows[0]?.membership_tier);
  }

  private async loadRouteRuntimeContexts(
    client: PoolClient,
    tenantId: string,
    nodes: CompiledWorkflow["nodes"],
  ): Promise<Map<string, RouteRuntimeContext>> {
    const routeKeys = Array.from(new Set(nodes
      .map((node) => {
        return resolveEffectiveRouteKey(node);
      })
      .filter((routeKey) => routeKey.length > 0)));

    if (routeKeys.length === 0) {
      return new Map();
    }

    const result = await client.query<{
      model_capabilities: Record<string, unknown>;
      model_key: string;
      provider_key: string;
      request_config: Record<string, unknown>;
      route_key: string;
      tenant_id: string | null;
    }>(
      `
        SELECT DISTINCT ON (route.route_key)
          route.route_key,
          provider.key AS provider_key,
          model.model_key,
          COALESCE(model.capabilities, '{}'::jsonb) AS model_capabilities,
          COALESCE(route.request_config, '{}'::jsonb) AS request_config,
          route.tenant_id::text AS tenant_id
        FROM ai_routes AS route
        JOIN ai_providers AS provider
          ON provider.id = route.provider_id
        LEFT JOIN ai_models AS model
          ON model.id = route.model_id
        WHERE route.status = 'active'
          AND route.route_key = ANY($1::text[])
          AND (route.tenant_id = $2::uuid OR route.tenant_id IS NULL)
        ORDER BY
          route.route_key ASC,
          CASE WHEN route.tenant_id = $2::uuid THEN 0 ELSE 1 END ASC,
          route.updated_at DESC
      `,
      [routeKeys, tenantId],
    );

    const contexts = new Map<string, RouteRuntimeContext>();
    for (const row of result.rows) {
      contexts.set(row.route_key, {
        capabilities: mergeRouteRuntimeCapabilities({
          modelCapabilities: row.model_capabilities,
          requestConfig: row.request_config,
        }),
        modelKey: row.model_key || "default",
        providerKey: row.provider_key || "default",
        requireExactPricing: row.request_config?.requireExactPricing === true,
        routeKey: row.route_key,
      });
    }

    return contexts;
  }

  private estimateNodeReserveCents(
    node: CompiledWorkflow["nodes"][number],
    routeContexts: Map<string, RouteRuntimeContext>,
    pricingRows: PricingRow[],
  ): ResolvedNodePricing {
    const configuredRoute = resolveConfiguredRouteKey(node);
    const effectiveRoute = resolveEffectiveRouteKey(node);
    const routeContext = routeContexts.get(effectiveRoute) ?? null;
    return resolveNodePricing({
      configuredRouteKey: configuredRoute,
      nodeConfig: node.config ?? {},
      nodeType: node.type,
      pricingRows,
      quantity: resolveNodePricingQuantity(node),
      routeContext,
    });
  }

  private async getCurrentFlowRuntimeOrThrow(
    client: PoolClient,
    flowId: string,
  ): Promise<FlowRuntimeRecord> {
    const result = await client.query<FlowRuntimeRecord>(
      `
        SELECT
          flows.id::text AS flow_id,
          flows.status AS flow_status,
          flows.current_version_id::text AS current_version_id,
          flow_versions.compiled_graph_json
        FROM flows
        LEFT JOIN flow_versions
          ON flow_versions.id = flows.current_version_id
        WHERE flows.id = $1::uuid
          AND flows.deleted_at IS NULL
        LIMIT 1
      `,
      [flowId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new WorkflowRunsApiError(404, "FLOW_NOT_FOUND", "未找到对应画布");
    }

    return row;
  }

  private logCreateRunDiagnostic(fields: Record<string, unknown>, message: string): void {
    console.info(JSON.stringify({
      ...fields,
      message,
      service: "workflow-runs",
    }));
  }

  private extractQueueJobId(job: unknown): string | null {
    if (job && typeof job === "object" && "id" in job) {
      const id = (job as { id?: unknown }).id;
      return typeof id === "string" || typeof id === "number" ? String(id) : null;
    }
    return null;
  }

  private async getTargetNodeFlowRuntimeWithoutFlowRowLock(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
    targetNodeId: string | null,
  ): Promise<FlowRuntimeRecord> {
    if (!targetNodeId) {
      throw new WorkflowRunsApiError(400, "TARGET_NODE_REQUIRED", "当前运行方式缺少目标节点 ID");
    }

    const flowRow = await client.query<{
      current_version_id: string | null;
      id: string;
      status: string;
    }>(
      `
        SELECT
          id::text AS id,
          status,
          current_version_id::text AS current_version_id
        FROM flows
        WHERE id = $1::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [flowId],
    );

    const flow = flowRow.rows[0];
    if (!flow) {
      throw new WorkflowRunsApiError(404, "FLOW_NOT_FOUND", "未找到对应画布");
    }
    this.logCreateRunDiagnostic(
      {
        flowId,
        flowRowLockUsed: false,
        selectForUpdateUsed: false,
        targetNodeId,
        tenantId: context.tenantId,
        traceId: context.traceId ?? null,
      },
      "workflow run target-node flow metadata read without row lock",
    );

    const draftResult = await client.query<FlowDraftRecord>(
      `
        SELECT graph_json, revision
        FROM flow_drafts
        WHERE flow_id = $1::uuid
        LIMIT 1
      `,
      [flowId],
    );
    const draft = draftResult.rows[0];
    if (!draft) {
      throw new WorkflowRunsApiError(400, "FLOW_DRAFT_MISSING", "当前画布还没有可运行的草稿");
    }

    const { checksum, compiledGraph, graph } = this.compileDraftGraph(draft.graph_json);
    const targetNode = compiledGraph.nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
      throw new WorkflowRunsApiError(400, "TARGET_NODE_NOT_FOUND", "未在当前草稿中找到目标节点");
    }

    const currentVersion = flow.current_version_id
      ? await client.query<FlowVersionRecord>(
          `
            SELECT
              id::text AS id,
              checksum,
              compiled_graph_json
            FROM flow_versions
            WHERE id = $1::uuid
            LIMIT 1
          `,
          [flow.current_version_id],
        )
      : null;
    const current = currentVersion?.rows[0];
    if (
      current?.id &&
      current.checksum === checksum &&
      !hasLegacySimplifiedNodeType(current.compiled_graph_json)
    ) {
      return {
        compiled_graph_json: current.compiled_graph_json ?? compiledGraph,
        current_version_id: current.id,
        draft_revision: draft.revision ?? null,
        flow_id: flow.id,
        flow_status: flow.status,
        graph_checksum: checksum,
        graph_source: "flow_version",
      };
    }

    const existingSnapshot = await this.findReusableFlowVersionByChecksum(client, flow.id, checksum);
    if (existingSnapshot) {
      return {
        compiled_graph_json: existingSnapshot.compiled_graph_json ?? compiledGraph,
        current_version_id: existingSnapshot.id,
        draft_revision: draft.revision ?? null,
        flow_id: flow.id,
        flow_status: flow.status,
        graph_checksum: checksum,
        graph_source: "flow_version",
      };
    }

    const version = await this.createUnlockedRunSnapshotVersion(
      client,
      context,
      flow.id,
      graph,
      compiledGraph,
      checksum,
    );

    return {
      compiled_graph_json: version.compiled_graph_json ?? compiledGraph,
      current_version_id: version.id,
      draft_revision: draft.revision ?? null,
      flow_id: flow.id,
      flow_status: flow.status,
      graph_checksum: checksum,
      graph_source: "draft",
    };
  }

  private compileDraftGraph(draftGraph: FlowDraftGraph): {
    checksum: string;
    compiledGraph: CompiledWorkflow;
    graph: FlowGraph;
  } {
    const normalizedDraft = normalizeDraftGraph(draftGraph);
    assertDraftGraphSafe(normalizedDraft);
    const rawGraph = {
      edges: normalizedDraft.edges,
      nodes: normalizedDraft.nodes,
      viewport: normalizedDraft.viewport,
    } as unknown as FlowGraph;
    const graph = normalizeGraphForRuntime(rawGraph);

    try {
      validateGraph(graph);
      return {
        checksum: checksumGraph(graph),
        compiledGraph: compileGraph(graph),
        graph,
      };
    } catch (error) {
      if (error instanceof WorkflowGraphValidationError) {
        throw new WorkflowRunsApiError(400, "INVALID_GRAPH", error.message);
      }
      throw error;
    }
  }

  private async findReusableFlowVersionByChecksum(
    client: PoolClient,
    flowId: string,
    checksum: string,
  ): Promise<FlowVersionRecord | null> {
    const existingVersion = await client.query<FlowVersionRecord>(
      `
        SELECT
          id::text AS id,
          checksum,
          compiled_graph_json
        FROM flow_versions
        WHERE flow_id = $1::uuid
          AND checksum = $2
        LIMIT 1
      `,
      [flowId, checksum],
    );
    const existing = existingVersion.rows[0];
    if (!existing?.id || hasLegacySimplifiedNodeType(existing.compiled_graph_json)) {
      return null;
    }
    return existing;
  }

  private async createUnlockedRunSnapshotVersion(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
    graph: FlowGraph,
    compiledGraph: CompiledWorkflow,
    checksum: string,
  ): Promise<FlowVersionRecord> {
    const existing = await this.findReusableFlowVersionByChecksum(client, flowId, checksum);
    if (existing) {
      return existing;
    }

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const savepoint = `flow_version_insert_${attempt}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const versionId = randomUUID();
        const inserted = await client.query<FlowVersionRecord>(
          `
            WITH next_version AS (
              SELECT COALESCE(MAX(version), 0) + 1 AS version
              FROM flow_versions
              WHERE flow_id = $3::uuid
            )
            INSERT INTO flow_versions (
              id,
              tenant_id,
              flow_id,
              version,
              graph_json,
              compiled_graph_json,
              checksum,
              changelog,
              published_by,
              published_at
            )
            SELECT
              $1::uuid,
              $2::uuid,
              $3::uuid,
              next_version.version::int,
              $4::jsonb,
              $5::jsonb,
              $6,
              $7,
              $8::uuid,
              now()
            FROM next_version
            RETURNING id::text AS id, checksum, compiled_graph_json
          `,
          [
            versionId,
            context.tenantId,
            flowId,
            JSON.stringify(graph),
            JSON.stringify(compiledGraph),
            checksum,
            AUTO_RUN_SNAPSHOT_CHANGELOG,
            context.userId,
          ],
        );
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);

        const version = inserted.rows[0];
        if (version?.id) {
          return version;
        }
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const reusable = await this.findReusableFlowVersionByChecksum(client, flowId, checksum);
        if (reusable) {
          this.logCreateRunDiagnostic(
            {
              attempt: attempt + 1,
              flowId,
              graphChecksum: checksum,
              recoveredFlowVersionId: reusable.id,
              tenantId: context.tenantId,
              traceId: context.traceId ?? null,
            },
            "workflow target-node snapshot reused after unique conflict",
          );
          return reusable;
        }

        this.logCreateRunDiagnostic(
          {
            attempt: attempt + 1,
            flowId,
            graphChecksum: checksum,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
          },
          "workflow target-node snapshot version conflict retrying",
        );
      }
    }

    const reusable = await this.findReusableFlowVersionByChecksum(client, flowId, checksum);
    if (reusable) {
      return reusable;
    }
    throw new WorkflowRunsApiError(409, "FLOW_SNAPSHOT_CONFLICT", "当前画布正在被其他修改影响，暂时无法创建可运行快照，请稍后重试。");
  }

  private async getCurrentFlowRuntimeOrCreateSnapshot(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
  ): Promise<FlowRuntimeRecord> {
    const lockStartedAt = Date.now();
    const flowRow = await client.query<{
      current_version_id: string | null;
      id: string;
      status: string;
    }>(
      `
        SELECT
          id::text AS id,
          status,
          current_version_id::text AS current_version_id
        FROM flows
        WHERE id = $1::uuid
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [flowId],
    );
    this.logCreateRunDiagnostic(
      {
        flowId,
        flowRowLockUsed: true,
        lockWaitDurationMs: Date.now() - lockStartedAt,
        selectForUpdateUsed: true,
        tenantId: context.tenantId,
        traceId: context.traceId ?? null,
      },
      "workflow run full-flow snapshot lock acquired",
    );

    const flow = flowRow.rows[0];
    if (!flow) {
      throw new WorkflowRunsApiError(404, "FLOW_NOT_FOUND", "未找到对应画布");
    }

    await this.createRunSnapshotFromDraft(client, context, flow.id, flow.current_version_id);

    const runtimeFlow = await this.getCurrentFlowRuntimeOrThrow(client, flowId);
    if (!runtimeFlow.current_version_id) {
      throw new WorkflowRunsApiError(400, "FLOW_NOT_PUBLISHED", "当前画布还没有可运行版本");
    }
    return runtimeFlow;
  }

  private async createRunSnapshotFromDraft(
    client: PoolClient,
    context: WorkflowRunContext,
    flowId: string,
    currentVersionId: string | null,
  ): Promise<void> {
    const draftResult = await client.query<FlowDraftRecord>(
      `
        SELECT graph_json
        FROM flow_drafts
        WHERE flow_id = $1::uuid
        LIMIT 1
      `,
      [flowId],
    );

    const draft = draftResult.rows[0];
    if (!draft) {
      throw new WorkflowRunsApiError(400, "FLOW_DRAFT_MISSING", "当前画布还没有可运行的草稿");
    }

    const normalizedDraft = normalizeDraftGraph(draft.graph_json);
    assertDraftGraphSafe(normalizedDraft);
    const rawGraph = {
      edges: normalizedDraft.edges,
      nodes: normalizedDraft.nodes,
      viewport: normalizedDraft.viewport,
    } as unknown as FlowGraph;
    const graph = normalizeGraphForRuntime(rawGraph);

    let compiledGraph: CompiledWorkflow;
    let checksum: string;
    try {
      validateGraph(graph);
      compiledGraph = compileGraph(graph);
      checksum = checksumGraph(graph);
    } catch (error) {
      if (error instanceof WorkflowGraphValidationError) {
        throw new WorkflowRunsApiError(400, "INVALID_GRAPH", error.message);
      }
      throw error;
    }

    if (currentVersionId) {
      const currentVersion = await client.query<FlowVersionRecord>(
        `
          SELECT
            id::text AS id,
            checksum,
            compiled_graph_json
          FROM flow_versions
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [currentVersionId],
      );
      const current = currentVersion.rows[0];
      if (
        current?.id &&
        current.checksum === checksum &&
        !hasLegacySimplifiedNodeType(current.compiled_graph_json)
      ) {
        return;
      }
    }

    const existingVersion = await client.query<FlowVersionRecord>(
      `
        SELECT
          id::text AS id,
          compiled_graph_json
        FROM flow_versions
        WHERE flow_id = $1::uuid
          AND checksum = $2
        LIMIT 1
      `,
      [flowId, checksum],
    );
    const reusableVersion = existingVersion.rows[0] && !hasLegacySimplifiedNodeType(existingVersion.rows[0].compiled_graph_json)
      ? existingVersion.rows[0]
      : null;
    const versionId = reusableVersion?.id ?? randomUUID();
    if (!reusableVersion) {
      const nextVersionResult = await client.query<{ next_version: number }>(
        `
          SELECT COALESCE(MAX(version), 0) + 1 AS next_version
          FROM flow_versions
          WHERE flow_id = $1::uuid
        `,
        [flowId],
      );
      const nextVersion = Number(nextVersionResult.rows[0]?.next_version ?? 1);

      await client.query(
        `
          INSERT INTO flow_versions (
            id,
            tenant_id,
            flow_id,
            version,
            graph_json,
            compiled_graph_json,
            checksum,
            changelog,
            published_by,
            published_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::int,
            $5::jsonb,
            $6::jsonb,
            $7,
            $8,
            $9::uuid,
            now()
          )
        `,
        [
          versionId,
          context.tenantId,
          flowId,
          nextVersion,
          JSON.stringify(graph),
          JSON.stringify(compiledGraph),
          checksum,
          AUTO_RUN_SNAPSHOT_CHANGELOG,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        UPDATE flows
        SET
          current_version_id = $2::uuid,
          status = 'published',
          updated_by = $3::uuid,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [flowId, versionId, context.userId],
    );
  }

  private async refundOpenReservations(
    client: PoolClient,
    workflowRunId: string,
    tenantId: string,
  ): Promise<void> {
    const owner = await client.query<{ billed_user_id: string }>(
      "SELECT billed_user_id::text AS billed_user_id FROM workflow_runs WHERE id = $1::uuid",
      [workflowRunId],
    );
    const billedUserId = owner.rows[0]?.billed_user_id;
    if (!billedUserId) {
      throw new Error(`Workflow run ${workflowRunId} has no billing owner`);
    }

    const result = await client.query<{
      cost_json: Record<string, unknown>;
      id: string;
      node_id: string;
    }>(
      `
        SELECT id::text AS id, node_id, cost_json
        FROM node_runs
        WHERE workflow_run_id = $1::uuid
          AND COALESCE(cost_json->>'reserveStatus', '') = 'reserved'
      `,
      [workflowRunId],
    );

    for (const row of result.rows) {
      const reservedCents = typeof row.cost_json?.reservedCents === "number"
        ? row.cost_json.reservedCents
        : 0;
      if (reservedCents <= 0) {
        continue;
      }

      const reserveLedgerId = typeof row.cost_json?.reserveLedgerId === "string"
        ? row.cost_json.reserveLedgerId
        : null;
      if (!reserveLedgerId) {
        throw new Error(`Workflow node run ${row.id} has a reserved charge without a reserve ledger`);
      }

      const ledgerEntry = await this.personalWalletService.refundUsageWithClient(client, { tenantId, userId: billedUserId }, {
        idempotencyKey: `refund:${tenantId}:${workflowRunId}:${row.id}`,
        metadata: {
          nodeId: row.node_id,
          nodeRunId: row.id,
          reserveLedgerId,
          workflowRunId,
        },
        reserveLedgerId,
      });

      await client.query(
        `
          UPDATE node_runs
          SET cost_json = cost_json || $2::jsonb
          WHERE id = $1::uuid
        `,
        [
          row.id,
          JSON.stringify({
            refundLedgerId: ledgerEntry.id,
            reserveStatus: "refunded",
          }),
        ],
      );
    }
  }

  private async markWorkflowRunQueueUnavailable(
    context: WorkflowRunContext,
    workflowRunId: string,
    error: unknown,
  ): Promise<void> {
    const normalized = {
      code: "QUEUE_UNAVAILABLE",
      message: "任务暂时无法加入执行队列",
      details: error instanceof Error ? error.message : String(error),
    };

    await withTenantTransaction(context, async (client) => {
      await this.refundOpenReservations(client, workflowRunId, context.tenantId);
      await client.query(
        `
          UPDATE node_runs
          SET
            status = 'failed',
            error_json = $2::jsonb,
            finished_at = now(),
            updated_at = now()
          WHERE workflow_run_id = $1::uuid
            AND status IN ('pending', 'runnable')
        `,
        [workflowRunId, JSON.stringify(normalized)],
      );
      await client.query(
        `
          UPDATE workflow_runs
          SET
            status = 'failed',
            error_json = $2::jsonb,
            finished_at = now(),
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [workflowRunId, JSON.stringify(normalized)],
      );
      await this.appendWorkflowRunEvent(client, {
        eventType: "workflow.run.failed",
        payload: normalized,
        tenantId: context.tenantId,
        workflowRunId,
      });
    }, this.pool);
  }

  private async getWorkflowRunOrThrow(
    client: PoolClient,
    runId: string,
    forUpdate = false,
  ): Promise<WorkflowRunView> {
    const result = await client.query<WorkflowRunRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          flow_id::text AS flow_id,
          flow_version_id::text AS flow_version_id,
          status,
          input_json,
          output_json,
          error_json,
          idempotency_key,
          created_by::text AS created_by,
          started_at::text AS started_at,
          finished_at::text AS finished_at,
          canceled_at::text AS canceled_at,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM workflow_runs
        WHERE id = $1::uuid
        ${forUpdate ? "FOR UPDATE" : ""}
      `,
      [runId],
    );

    if (!result.rows[0]) {
      throw new WorkflowRunsApiError(404, "WORKFLOW_RUN_NOT_FOUND", "未找到对应任务记录");
    }

    return mapWorkflowRun(result.rows[0]);
  }
}
