import { rm } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";

import {
  BillingService,
  createPgPool,
  safeRecordAuditLog,
  type AuditLogInput,
  withTenantTransaction,
} from "@aigc-flow/db";
import { AiGatewayError } from "@aigc-flow/ai-gateway-core";
import type {
  AiGatewayMediaResult,
  AiGatewayTextResult,
  AssetReferenceInput,
  DatabaseMediaRuntime,
  DatabaseTextGenerationRuntime,
  ImageGenerationRequest,
  MediaOutput,
  ProviderTaskResult,
  TextGenerationRequest,
  VideoGenerationRequest,
} from "@aigc-flow/ai-gateway-core";
import {
  QUEUE_NAMES,
  assertLightweightJobPayload,
  resolveNodeExecuteQueueName,
  type NodeExecuteJobPayload,
  type ProviderPollJobPayload,
} from "@aigc-flow/redis";
import type { StorageProvider } from "@aigc-flow/storage";
import type { CompiledWorkflow, CompiledWorkflowNode } from "@aigc-flow/workflow-core";
import type { Pool, PoolClient } from "pg";

import type { WorkerLogger } from "../logger.js";
import type { ProcessorResult } from "../processors/shared.js";
import {
  type AssetRef,
  type DeferredVariantJob,
  type FetchLike,
  type MediaVariantQueue,
  MediaAssetStore,
} from "./media-asset-store.js";
import {
  VideoEditorLocalRenderService,
  type VideoEditorLocalRenderResult,
  type VideoEditorRenderAssetLookup,
} from "./video-editor-local-render-service.js";
import { buildVideoEditorRenderPlan } from "./video-editor-render-plan.js";

type WorkflowRunRecord = {
  error_json: Record<string, unknown> | null;
  flow_id: string;
  flow_version_id: string;
  id: string;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  project_id: string | null;
  started_at: string | null;
  status: string;
  tenant_id: string;
};

type NodeRunRecord = {
  attempt: number;
  cost_json: Record<string, unknown>;
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
  workflow_run_id: string;
};

type WorkflowRunEventAppendInput = {
  eventType: string;
  nodeRunId?: string;
  payload: Record<string, unknown>;
  tenantId: string;
  workflowRunId: string;
};

type WorkflowExecutionContext = {
  tenantId: string;
  traceId: string | null;
  userId: string | null;
};

type WorkflowRunMode = "flow" | "target_node";
const UNKNOWN_PROVIDER_RECONCILE_PREFIX = "timeout-unknown:";
const UNKNOWN_PROVIDER_RECONCILE_WINDOW_MS = 10 * 60 * 1000;
const VIDEO_EDITOR_EXPORT_WORKFLOW = "video_editor_export";
const VIDEO_EDITOR_FFMPEG_RENDER_ENGINE = "ffmpeg";

type TextGenerationRuntimeLike = Pick<DatabaseTextGenerationRuntime, "generateText">;
type MediaGenerationRuntimeLike = Pick<DatabaseMediaRuntime, "generateImage" | "generateVideo" | "pollTask">;

type NodeExecuteQueueLike = {
  add: (name: string, data: NodeExecuteJobPayload) => Promise<unknown>;
};

type NodeExecuteQueueMapLike = Partial<Record<"default" | "image" | "legacy" | "video", NodeExecuteQueueLike>>;

type ProviderPollQueueLike = {
  add: (
    name: string,
    data: ProviderPollJobPayload,
    options?: {
      delay?: number;
    },
  ) => Promise<unknown>;
};

type RuntimeExecutionResult = {
  auditLogs: AuditLogInput[];
  deferredVariantJobs: DeferredVariantJob[];
  errorToThrow?: Error;
  nodeEnqueuePayloads: NodeExecuteJobPayload[];
  pollEnqueuePayloads: Array<{
    delayMs?: number;
    payload: ProviderPollJobPayload;
  }>;
  processorResult: ProcessorResult;
};

type RuntimeFlowRecord = {
  compiled_graph_json: CompiledWorkflow;
  flow_id: string;
  flow_version_id: string;
  project_id: string | null;
  workflow_run_id: string;
};

type AssetStorageLookup = {
  bucket: string;
  durationMs?: number | null;
  height?: number | null;
  kind: string;
  mimeType: string;
  objectKey: string;
  width?: number | null;
};

type VideoEditorRenderRouteCapability = {
  renderEngine: "ffmpeg" | null;
  routeKey: string;
};

type SerializableAssetRef = Omit<AssetRef, "timing">;

type PersistedMediaOutput = {
  assetTimings: Array<Record<string, number | string>>;
  deferredVariantJobs: DeferredVariantJob[];
  outputJson: Record<string, unknown>;
};

type NodeExecutionOutcome =
  | {
      deferredVariantJobs?: DeferredVariantJob[];
      usageRecord?: UsageRecordInput;
      outputJson: Record<string, unknown>;
      type: "succeeded";
    }
  | {
      outputJson: Record<string, unknown>;
      pollPayloads: ProviderPollJobPayload[];
      type: "waiting_provider";
    };

type WaitingProviderTaskState = {
  modelId: string | null;
  modelKey: string | null;
  outputs?: MediaOutput[] | null;
  providerId: string | null;
  providerKey: string | null;
  providerTaskId: string;
  routeId: string | null;
  routeKey: string | null;
  status: "pending" | "running" | "succeeded" | "waiting_provider";
};

type AiGatewayMediaResultWithTaskIds = AiGatewayMediaResult & {
  providerTaskIds?: string[] | null;
};

type MediaProviderOutcome = {
  cleanupDir?: string | null;
  kind: "image" | "video";
  node: CompiledWorkflowNode;
  nodeRun: NodeRunRecord;
  result: AiGatewayMediaResult;
  runtimeFlow: RuntimeFlowRecord;
  type: "media_provider_succeeded";
  workflowRun: WorkflowRunRecord;
};

type PreparedNodeExecution = {
  currentNode: CompiledWorkflowNode;
  currentNodeRun: NodeRunRecord;
  input: NodeExecuteJobPayload;
  processorResult: ProcessorResult;
  runtimeFlow: RuntimeFlowRecord;
  upstreamOutputs: Array<Record<string, unknown> | null>;
  workflowRun: WorkflowRunRecord;
};

type PreparedNodeExecutionResult =
  | {
      prepared: PreparedNodeExecution;
      type: "prepared";
    }
  | {
      result: RuntimeExecutionResult;
      type: "done";
    };

type ProviderExecutionOutcome = NodeExecutionOutcome | MediaProviderOutcome;

type UsageRecordInput = {
  metadata?: Record<string, unknown>;
  billableCents: number;
  eventType: string;
  idempotencyKey: string;
  inputTokens: number | null;
  modality: "image" | "text" | "video";
  modelId?: string | null;
  nodeRunId: string;
  outputTokens: number | null;
  providerId?: string | null;
  rawCost?: string | number | null;
  reserveLedgerId?: string | null;
  routeId?: string | null;
  routeKey?: string | null;
  modelKey?: string | null;
  totalTokens: number | null;
  unitType?: string | null;
  units?: number | null;
  workflowRunId: string;
};

function buildAiRuntimeDiagnostic(input: {
  modelId?: string | null;
  modelKey?: string | null;
  providerId?: string | null;
  providerKey?: string | null;
  routeId?: string | null;
  routeKey?: string | null;
}): Record<string, string | null> {
  return {
    modelId: input.modelId ?? null,
    modelKey: input.modelKey ?? null,
    providerId: input.providerId ?? null,
    providerKey: input.providerKey ?? null,
    routeId: input.routeId ?? null,
    routeKey: input.routeKey ?? null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isWaitingProviderTaskState(value: unknown): value is WaitingProviderTaskState {
  if (!isPlainObject(value)) {
    return false;
  }
  return typeof value.providerTaskId === "string" && value.providerTaskId.trim().length > 0;
}

function isTerminalStatus(status: string): boolean {
  return status === "failed" || status === "canceled" || status === "succeeded";
}

function getWorkflowRunMode(workflowRun: WorkflowRunRecord): WorkflowRunMode {
  return workflowRun.input_json?.runMode === "target_node" ? "target_node" : "flow";
}

function getWorkflowRunTargetNodeId(workflowRun: WorkflowRunRecord): string | null {
  return typeof workflowRun.input_json?.targetNodeId === "string" && workflowRun.input_json.targetNodeId.trim()
    ? workflowRun.input_json.targetNodeId.trim()
    : null;
}

function normalizeError(error: unknown): {
  code: string;
  details?: unknown;
  message: string;
} {
  if (typeof error === "object" && error && "code" in error && "message" in error) {
    return {
      code: String(error.code),
      details: "details" in error ? (error as { details?: unknown }).details : undefined,
      message: String((error as { message: unknown }).message),
    };
  }

  if (error instanceof Error) {
    return {
      code: "WORKFLOW_NODE_FAILED",
      message: error.message,
    };
  }

  return {
    code: "WORKFLOW_NODE_FAILED",
    message: String(error),
  };
}

function isProviderResultUnknownError(error: unknown): boolean {
  if (error instanceof AiGatewayError) {
    return error.code === "PROVIDER_TIMEOUT";
  }
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError" || /aborted due to timeout|timed out/i.test(error.message);
  }
  return false;
}

function buildTextMessages(
  upstreamOutputs: Array<Record<string, unknown> | null>,
  config: Record<string, unknown>,
): TextGenerationRequest {
  const messages: Array<{ content: string; role: "assistant" | "system" | "user" }> = [];
  if (typeof config.systemPrompt === "string" && config.systemPrompt.trim()) {
    messages.push({
      content: config.systemPrompt.trim(),
      role: "system",
    });
  }

  const upstreamText = upstreamOutputs
    .map((value) => {
      if (!value) {
        return "";
      }

      const directText = value.text;
      if (typeof directText === "string" && directText.trim()) {
        return directText.trim();
      }

      return JSON.stringify(value);
    })
    .filter(Boolean)
    .join("\n");

  const fallbackPrompt = extractStaticTextFromConfig(config);

  const content = upstreamText || fallbackPrompt || JSON.stringify(upstreamOutputs);
  messages.push({
    content,
    role: "user",
  });

  return {
    maxTokens: typeof config.maxTokens === "number" ? config.maxTokens : null,
    messages,
    routeKey: typeof config.routeKey === "string" ? config.routeKey : null,
    temperature: typeof config.temperature === "number" ? config.temperature : null,
  };
}

function extractAssetInputs(upstreamOutputs: Array<Record<string, unknown> | null>): AssetReferenceInput[] {
  const assets: AssetReferenceInput[] = [];

  for (const output of upstreamOutputs) {
    if (!output || !Array.isArray(output.assets)) {
      continue;
    }

    for (const asset of output.assets) {
      if (!isPlainObject(asset) || typeof asset.assetId !== "string") {
        continue;
      }

      assets.push({
        assetId: asset.assetId,
        durationMs: typeof asset.durationMs === "number" ? asset.durationMs : null,
        height: typeof asset.height === "number" ? asset.height : null,
        kind: typeof asset.kind === "string" ? asset.kind : null,
        metadata: isPlainObject(asset.metadata) ? asset.metadata : null,
        mimeType: typeof asset.mimeType === "string" ? asset.mimeType : null,
        width: typeof asset.width === "number" ? asset.width : null,
      });
    }
  }

  return assets;
}

function extractStaticTextFromConfig(config: Record<string, unknown>): string {
  const candidates = [
    config.text,
    config.generationPrompt,
    config.prompt,
    config.content,
    config.value,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function extractAssetOutputsFromConfig(config: Record<string, unknown>): AssetReferenceInput[] {
  const assetIds = new Set<string>();
  const referenceUploadId = typeof config.referenceUploadId === "string" ? config.referenceUploadId.trim() : "";
  const directAssetId = typeof config.assetId === "string" ? config.assetId.trim() : "";
  if (referenceUploadId) {
    assetIds.add(referenceUploadId);
  }
  if (directAssetId) {
    assetIds.add(directAssetId);
  }
  if (Array.isArray(config.assetIds)) {
    for (const item of config.assetIds) {
      if (typeof item === "string" && item.trim()) {
        assetIds.add(item.trim());
      }
    }
  }
  if (typeof config.sourceAssetId === "string" && config.sourceAssetId.trim()) {
    assetIds.add(config.sourceAssetId.trim());
  }

  return [...assetIds].map((assetId) => {
    const isTemporaryReference = referenceUploadId && assetId === referenceUploadId;
    return {
      assetId,
      durationMs: typeof config.durationMs === "number" ? config.durationMs : null,
      height:
        typeof config.naturalHeight === "number"
          ? config.naturalHeight
          : typeof config.height === "number"
            ? config.height
            : null,
      kind:
        typeof config.kind === "string"
          ? config.kind
          : typeof config.mimeType === "string" && config.mimeType.startsWith("video/")
            ? "video"
            : "image",
      metadata: isTemporaryReference
        ? {
            referenceUploadId,
            source: "temporary-reference-upload",
          }
        : null,
      mimeType: typeof config.mimeType === "string" ? config.mimeType : null,
      width:
        typeof config.naturalWidth === "number"
          ? config.naturalWidth
          : typeof config.width === "number"
            ? config.width
            : null,
    };
  });
}

function buildOutputFromNodeConfig(node: CompiledWorkflowNode | undefined): Record<string, unknown> | null {
  if (!node) {
    return null;
  }

  const staticText = extractStaticTextFromConfig(node.config ?? {});
  const assets = extractAssetOutputsFromConfig(node.config ?? {});
  if (!staticText && assets.length === 0) {
    return null;
  }

  return {
    ...(staticText ? { text: staticText } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}

function getDependencyOutputsFromRuntimeGraph(
  node: Pick<CompiledWorkflowNode, "dependencies">,
  nodeRuns: Array<Pick<NodeRunRecord, "node_id" | "output_json">>,
  runtimeFlow: Pick<RuntimeFlowRecord, "compiled_graph_json">,
): Array<Record<string, unknown> | null> {
  return node.dependencies.map((dependencyId) => {
    const dependencyRun = nodeRuns.find((row) => row.node_id === dependencyId);
    if (dependencyRun?.output_json) {
      return dependencyRun.output_json;
    }
    const dependencyNode = runtimeFlow.compiled_graph_json.nodes.find((candidate) => candidate.id === dependencyId);
    return buildOutputFromNodeConfig(dependencyNode);
  });
}

function extractPromptFromUpstreamOutputs(
  upstreamOutputs: Array<Record<string, unknown> | null>,
  fallbackPrompt: string,
): string {
  const upstreamText = extractTextPromptFromUpstreamOutputs(upstreamOutputs);

  if (upstreamText) {
    return upstreamText;
  }

  if (fallbackPrompt.trim()) {
    return fallbackPrompt.trim();
  }

  return JSON.stringify(upstreamOutputs);
}

function extractTextPromptFromUpstreamOutputs(
  upstreamOutputs: Array<Record<string, unknown> | null>,
): string {
  const fragments = upstreamOutputs
    .flatMap((output) => {
      if (!output) {
        return [];
      }
      if (Array.isArray(output.assets) && output.assets.length > 0) {
        return [];
      }

      const values: string[] = [];
      if (typeof output.prompt === "string" && output.prompt.trim()) {
        values.push(output.prompt.trim());
      }
      if (typeof output.text === "string" && output.text.trim()) {
        values.push(output.text.trim());
      }
      return values;
    })
    .filter(Boolean);

  return fragments.join("\n");
}

function mergeImageGenerationPrompt(
  upstreamOutputs: Array<Record<string, unknown> | null>,
  generationPrompt: string | null,
  fallbackPrompt: string,
): string {
  const upstreamText = extractTextPromptFromUpstreamOutputs(upstreamOutputs);
  const ownPrompt = generationPrompt ?? (fallbackPrompt.trim() ? fallbackPrompt.trim() : "");
  const fragments = [upstreamText, ownPrompt].filter((value) => value.trim());
  if (fragments.length > 0) {
    return fragments.join("\n");
  }
  return JSON.stringify(upstreamOutputs);
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAgentToolConfig(config: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(config.agentTool) ? config.agentTool : {};
}

function buildAgentToolInputAssets(agentTool: Record<string, unknown>): AssetReferenceInput[] {
  if (!Array.isArray(agentTool.referenceAssetIds)) {
    return [];
  }

  return agentTool.referenceAssetIds.flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }
    return [{
      assetId: value.trim(),
      kind: "image",
      metadata: { source: "agent-tool-reference" },
      mimeType: null,
    }];
  });
}

function buildNodeReferenceInputAssets(config: Record<string, unknown>): AssetReferenceInput[] {
  if (!Array.isArray(config.referenceAssetItemIds)) {
    return [];
  }

  return config.referenceAssetItemIds.flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }
    return [{
      assetId: value.trim(),
      kind: "image",
      metadata: { source: "node-reference-asset" },
      mimeType: null,
    }];
  });
}

function mergeAssetInputs(
  ...groups: AssetReferenceInput[][]
): AssetReferenceInput[] {
  const seen = new Set<string>();
  const merged: AssetReferenceInput[] = [];

  for (const asset of groups.flat()) {
    if (!asset.assetId || seen.has(asset.assetId)) {
      continue;
    }
    seen.add(asset.assetId);
    merged.push(asset);
  }

  return merged;
}

function mergeImageReferenceInputAssets(input: {
  agentAssets: AssetReferenceInput[];
  config: Record<string, unknown>;
  nodeAssets: AssetReferenceInput[];
  upstreamAssets: AssetReferenceInput[];
}): AssetReferenceInput[] {
  const referenceOrder = Array.isArray(input.config.referenceOrder)
    ? input.config.referenceOrder.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (referenceOrder.length === 0) {
    return mergeAssetInputs(input.upstreamAssets, input.nodeAssets, input.agentAssets);
  }

  const nodeAssetsById = new Map(input.nodeAssets.map((asset) => [asset.assetId, asset]));
  const ordered: AssetReferenceInput[] = [];
  let upstreamInserted = false;

  for (const key of referenceOrder) {
    if (key.startsWith("asset:")) {
      const assetId = key.slice("asset:".length).trim();
      const asset = nodeAssetsById.get(assetId);
      if (asset) {
        ordered.push(asset);
      }
      continue;
    }

    if (key.startsWith("upstream:") && !upstreamInserted) {
      upstreamInserted = true;
      ordered.push(...input.upstreamAssets);
    }
  }

  return mergeAssetInputs(
    ordered,
    upstreamInserted ? [] : input.upstreamAssets,
    input.nodeAssets,
    input.agentAssets,
  );
}

function withOptionalParam(
  params: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return value === undefined || value === null || value === "" ? params : { ...params, [key]: value };
}

function buildAgentImageParams(
  params: Record<string, unknown>,
  agentTool: Record<string, unknown>,
): Record<string, unknown> {
  let next = { ...params };
  next = withOptionalParam(next, "size", readTrimmedString(agentTool.size));
  next = withOptionalParam(next, "aspectRatio", readTrimmedString(agentTool.aspectRatio));
  next = withOptionalParam(next, "quality", readTrimmedString(agentTool.quality));
  next = withOptionalParam(next, "format", readTrimmedString(agentTool.format));
  next = withOptionalParam(next, "output_format", readTrimmedString(agentTool.format));
  next = withOptionalParam(next, "moderation", readTrimmedString(agentTool.moderation));
  next = withOptionalParam(next, "n", readPositiveInteger(agentTool.n) ?? undefined);
  return next;
}

function mergeAgentToolIntoImageNodeConfig(
  config: Record<string, unknown>,
  workflowInput: Record<string, unknown>,
  nodeId: string,
): Record<string, unknown> {
  const targetNodeId = getWorkflowInputTargetNodeId(workflowInput);
  if (targetNodeId && targetNodeId !== nodeId) {
    return config;
  }
  if (!isPlainObject(workflowInput.agentTool)) {
    return config;
  }
  return {
    ...config,
    agentTool: workflowInput.agentTool,
  };
}

function getWorkflowInputTargetNodeId(workflowInput: Record<string, unknown>): string | null {
  return typeof workflowInput.targetNodeId === "string" && workflowInput.targetNodeId.trim()
    ? workflowInput.targetNodeId.trim()
    : null;
}

function resolveNestedImageRouteKey(config: Record<string, unknown>): string | null {
  const imageEditRequest = isPlainObject(config.imageEditRequest) ? config.imageEditRequest : null;
  const params = isPlainObject(config.params) ? config.params : null;
  const imageEditMapping = params && isPlainObject(params.imageEditMapping) ? params.imageEditMapping : null;

  return readTrimmedString(imageEditRequest?.routeKey)
    ?? readTrimmedString(imageEditMapping?.routeKey)
    ?? null;
}

function resolveImageRequestRouteKey(config: Record<string, unknown>): string {
  const agentTool = readAgentToolConfig(config);
  return readTrimmedString(agentTool.routeKey)
    ?? readTrimmedString(config.routeKey)
    ?? resolveNestedImageRouteKey(config)
    ?? "image.default";
}

function resolveVideoRequestRouteKey(config: Record<string, unknown>): string {
  return readTrimmedString(config.routeKey) ?? "video.default";
}

function readVideoEditorRenderEngine(requestConfig: Record<string, unknown> | null): "ffmpeg" | null {
  const capabilities = isPlainObject(requestConfig?.capabilities) ? requestConfig.capabilities : {};
  const supportedVideoWorkflows = Array.isArray(capabilities.supportedVideoWorkflows)
    ? capabilities.supportedVideoWorkflows.map((item) => String(item || "").trim())
    : [];
  if (!supportedVideoWorkflows.includes(VIDEO_EDITOR_EXPORT_WORKFLOW)) {
    return null;
  }
  return capabilities.videoEditorRenderEngine === VIDEO_EDITOR_FFMPEG_RENDER_ENGINE
    ? VIDEO_EDITOR_FFMPEG_RENDER_ENGINE
    : null;
}

function readVideoEditorExportRenderPlan(request: VideoGenerationRequest): unknown | null {
  const metadata = isPlainObject(request.metadata) ? request.metadata : {};
  const videoEditorExport = isPlainObject(metadata.videoEditorExport) ? metadata.videoEditorExport : {};
  return videoEditorExport.source === VIDEO_EDITOR_EXPORT_WORKFLOW ? videoEditorExport.renderPlan ?? null : null;
}

function localOutputDirFromRenderResult(result: VideoEditorLocalRenderResult): string | null {
  const localFilePath = typeof result.output.localFilePath === "string" ? result.output.localFilePath.trim() : "";
  if (!localFilePath) {
    return null;
  }
  const outputDir = dirname(localFilePath);
  return isAbsolute(outputDir) && basename(outputDir).startsWith("tapflow-video-render-output-")
    ? outputDir
    : null;
}

function buildImageRequest(
  upstreamOutputs: Array<Record<string, unknown> | null>,
  config: Record<string, unknown>,
): ImageGenerationRequest {
  const params = isPlainObject(config.params) ? config.params : {};
  const agentTool = readAgentToolConfig(config);
  const agentParams = buildAgentImageParams(params, agentTool);
  const batchCount = readPositiveInteger(config.batchCount)
    ?? readPositiveInteger(agentParams.n)
    ?? readPositiveInteger(config.n);
  const normalizedParams = batchCount ? { ...agentParams, n: batchCount } : agentParams;
  const metadata = {
    ...(isPlainObject(config.metadata) ? config.metadata : {}),
    aspectRatio:
      typeof normalizedParams.aspectRatio === "string"
        ? normalizedParams.aspectRatio
        : typeof normalizedParams.aspect_ratio === "string"
          ? normalizedParams.aspect_ratio
          : undefined,
    imageSize:
      typeof normalizedParams.imageSize === "string"
        ? normalizedParams.imageSize
        : typeof normalizedParams.image_size === "string"
          ? normalizedParams.image_size
          : typeof normalizedParams.size === "string"
            ? normalizedParams.size
            : undefined,
    optimizeChineseText:
      typeof normalizedParams.optimizeChineseText === "boolean"
        ? normalizedParams.optimizeChineseText
        : typeof normalizedParams.optimize_chinese_text === "boolean"
          ? normalizedParams.optimize_chinese_text
          : undefined,
    ...(batchCount ? { n: batchCount } : {}),
    params: normalizedParams,
  };
  const routeKey = resolveImageRequestRouteKey(config);
  const generationPrompt = readTrimmedString(agentTool.prompt) ?? readTrimmedString(config.generationPrompt);
  const fallbackPrompt = typeof config.prompt === "string" ? config.prompt : "";
  const inputAssets = mergeImageReferenceInputAssets({
    agentAssets: buildAgentToolInputAssets(agentTool),
    config,
    nodeAssets: buildNodeReferenceInputAssets(config),
    upstreamAssets: extractAssetInputs(upstreamOutputs),
  });

  return {
    inputAssets,
    metadata: {
      ...metadata,
      ...(isPlainObject(config.imageEditRequest) ? { imageEditRequest: config.imageEditRequest } : {}),
      referenceImages: Array.isArray(config.referenceImages)
        ? config.referenceImages
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : undefined,
    },
    model:
      typeof config.model === "string"
        ? config.model
        : typeof config.modelId === "string"
          ? config.modelId === "nano-banana"
            ? "nano-banana-pro"
            : config.modelId
          : null,
    prompt: mergeImageGenerationPrompt(upstreamOutputs, generationPrompt, fallbackPrompt),
    routeKey,
  };
}

function classifyReferenceDebugValue(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "unknown";
  if (/^data:/i.test(text)) return "dataUrl";
  if (/^https?:\/\//i.test(text)) return "httpsUrl";
  if (/^[a-z0-9+/=]+$/i.test(text) && text.length > 32) return "base64";
  return "other";
}

function classifyRequestInputAssetKind(asset: AssetReferenceInput): string {
  const metadata = isPlainObject(asset.metadata) ? asset.metadata : {};
  const candidates = [
    metadata.base64,
    metadata.url,
    metadata.signedUrl,
    metadata.uri,
    metadata.fileUri,
    metadata.publicUrl,
  ];
  for (const candidate of candidates) {
    const kind = classifyReferenceDebugValue(candidate);
    if (kind !== "unknown") {
      return kind === "httpsUrl" ? "signedUrl" : kind;
    }
  }
  return "unknown";
}

function pickImageRequestDebugParams(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const params = isPlainObject(metadata?.params) ? metadata.params as Record<string, unknown> : {};
  const next: Record<string, unknown> = {};
  for (const key of ["size", "imageSize", "image_size", "aspect_ratio", "aspectRatio", "quality", "moderation", "output_format"]) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      next[key] = value;
    }
  }
  return next;
}

function normalizeMediaOutputs(
  outputs: Array<Record<string, unknown> | MediaOutput | null | undefined>,
  outputUrls: string[] = [],
  outputBase64: string[] = [],
  mimeType: string | null = null,
): MediaOutput[] {
  const normalized: MediaOutput[] = [];

  for (const output of outputs) {
    if (!output || !isPlainObject(output)) {
      continue;
    }

    normalized.push({
      ...(typeof output.base64 === "string" ? { base64: output.base64 } : {}),
      ...(typeof output.durationMs === "number" ? { durationMs: output.durationMs } : {}),
      ...(typeof output.filename === "string" ? { filename: output.filename } : {}),
      ...(typeof output.height === "number" ? { height: output.height } : {}),
      ...(typeof output.localFilePath === "string" ? { localFilePath: output.localFilePath } : {}),
      ...(typeof output.mimeType === "string" ? { mimeType: output.mimeType } : mimeType ? { mimeType } : {}),
      ...(typeof output.url === "string" ? { url: output.url } : {}),
      ...(typeof output.width === "number" ? { width: output.width } : {}),
    });
  }

  for (const url of outputUrls) {
    normalized.push({
      mimeType,
      url,
    });
  }

  for (const base64 of outputBase64) {
    normalized.push({
      base64,
      mimeType,
    });
  }

  return normalized;
}

export const __workerTestUtils = {
  buildAiRuntimeDiagnostic,
  buildImageRequest,
  buildMediaUsageMetadata,
  buildVideoRequest,
  getDependencyOutputs: getDependencyOutputsFromRuntimeGraph,
  localOutputDirFromRenderResult,
  normalizeMediaOutputs,
  readVideoEditorRenderEngine,
  resolveImageRequestRouteKey,
};

function readVideoEditorConfig(config: Record<string, unknown>): Record<string, unknown> | null {
  const params = isPlainObject(config.params) ? config.params : {};
  return isPlainObject(params.videoEditor) ? params.videoEditor : null;
}

function readFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTimelineDurationMs(item: Record<string, unknown>): number | null {
  const inMs = readFiniteNumberOrNull(item.inMs);
  const outMs = readFiniteNumberOrNull(item.outMs);
  if (inMs === null || outMs === null) {
    return null;
  }
  return Math.max(0, outMs - inMs);
}

function buildVideoEditorTimelineAssets(videoEditor: Record<string, unknown> | null): AssetReferenceInput[] {
  const timeline = isPlainObject(videoEditor?.timeline) ? videoEditor.timeline : {};
  const clips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const audio = Array.isArray(timeline.audio) ? timeline.audio : [];
  const assets: AssetReferenceInput[] = [];

  for (const clip of clips) {
    if (!isPlainObject(clip) || typeof clip.assetId !== "string" || !clip.assetId.trim()) {
      continue;
    }
    assets.push({
      assetId: clip.assetId.trim(),
      durationMs: readTimelineDurationMs(clip),
      kind: readTrimmedString(clip.kind) ?? "video",
      metadata: {
        clipId: readTrimmedString(clip.id),
        source: "video-editor-timeline",
        startMs: readFiniteNumberOrNull(clip.startMs),
        track: readFiniteNumberOrNull(clip.track),
      },
      mimeType: null,
    });
  }

  for (const item of audio) {
    if (!isPlainObject(item) || typeof item.assetId !== "string" || !item.assetId.trim()) {
      continue;
    }
    assets.push({
      assetId: item.assetId.trim(),
      durationMs: readTimelineDurationMs(item),
      kind: "audio",
      metadata: {
        audioId: readTrimmedString(item.id),
        source: "video-editor-timeline",
        startMs: readFiniteNumberOrNull(item.startMs),
        track: readFiniteNumberOrNull(item.track),
      },
      mimeType: null,
    });
  }

  return assets;
}

function sanitizeVideoEditorTimelineItem(item: unknown): Record<string, unknown> | null {
  if (!isPlainObject(item)) {
    return null;
  }
  const transitionOut = sanitizeVideoEditorTransitionOut(item.transitionOut);
  return {
    ...(readTrimmedString(item.id) ? { id: readTrimmedString(item.id) } : {}),
    ...(readTrimmedString(item.assetId) ? { assetId: readTrimmedString(item.assetId) } : {}),
    ...(readTrimmedString(item.kind) ? { kind: readTrimmedString(item.kind) } : {}),
    ...(readFiniteNumberOrNull(item.track) !== null ? { track: readFiniteNumberOrNull(item.track) } : {}),
    ...(readFiniteNumberOrNull(item.startMs) !== null ? { startMs: readFiniteNumberOrNull(item.startMs) } : {}),
    ...(readFiniteNumberOrNull(item.inMs) !== null ? { inMs: readFiniteNumberOrNull(item.inMs) } : {}),
    ...(readFiniteNumberOrNull(item.outMs) !== null ? { outMs: readFiniteNumberOrNull(item.outMs) } : {}),
    ...(readFiniteNumberOrNull(item.speed) !== null ? { speed: readFiniteNumberOrNull(item.speed) } : {}),
    ...(transitionOut ? { transitionOut } : {}),
    ...(readFiniteNumberOrNull(item.volume) !== null ? { volume: readFiniteNumberOrNull(item.volume) } : {}),
  };
}

function sanitizeVideoEditorTransitionOut(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const type = value.type === "fade" || value.type === "crossfade" ? value.type : null;
  const durationMs = readFiniteNumberOrNull(value.durationMs);
  if (!type || durationMs === null || durationMs <= 0) {
    return null;
  }
  return {
    durationMs: Math.round(durationMs),
    type,
  };
}

function sanitizeVideoEditorSubtitle(item: unknown): Record<string, unknown> | null {
  if (!isPlainObject(item)) {
    return null;
  }
  return {
    ...(readTrimmedString(item.id) ? { id: readTrimmedString(item.id) } : {}),
    ...(typeof item.text === "string" ? { text: item.text } : {}),
    ...(readFiniteNumberOrNull(item.startMs) !== null ? { startMs: readFiniteNumberOrNull(item.startMs) } : {}),
    ...(readFiniteNumberOrNull(item.endMs) !== null ? { endMs: readFiniteNumberOrNull(item.endMs) } : {}),
  };
}

function buildVideoEditorRequestMetadata(videoEditor: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!videoEditor) {
    return null;
  }
  const timeline = isPlainObject(videoEditor.timeline) ? videoEditor.timeline : {};
  const clips = Array.isArray(timeline.clips)
    ? timeline.clips.map(sanitizeVideoEditorTimelineItem).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const audio = Array.isArray(timeline.audio)
    ? timeline.audio.map(sanitizeVideoEditorTimelineItem).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const subtitles = Array.isArray(timeline.subtitles)
    ? timeline.subtitles.map(sanitizeVideoEditorSubtitle).filter((item): item is Record<string, unknown> => item !== null)
    : [];

  return {
    ...(readTrimmedString(videoEditor.sourceVideoEditorNodeId)
      ? { sourceVideoEditorNodeId: readTrimmedString(videoEditor.sourceVideoEditorNodeId) }
      : {}),
    ...(readTrimmedString(videoEditor.aspect) ? { aspect: readTrimmedString(videoEditor.aspect) } : {}),
    ...(readTrimmedString(videoEditor.resolution) ? { resolution: readTrimmedString(videoEditor.resolution) } : {}),
    timeline: {
      audio,
      clips,
      durationMs: readFiniteNumberOrNull(timeline.durationMs) ?? 0,
      subtitles,
    },
  };
}

function countTimelineAssetRefs(items: unknown): number {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.filter((item) => isPlainObject(item) && readTrimmedString(item.assetId)).length;
}

function buildVideoEditorExportMetadata(
  videoEditor: Record<string, unknown> | null,
  options: { includeRenderPlan?: boolean } = {},
): Record<string, unknown> | null {
  if (!videoEditor) {
    return null;
  }
  const timeline = isPlainObject(videoEditor.timeline) ? videoEditor.timeline : {};
  const renderPlan = options.includeRenderPlan ? buildVideoEditorRenderPlan(videoEditor) : null;
  return {
    ...(readTrimmedString(videoEditor.sourceVideoEditorNodeId)
      ? { sourceVideoEditorNodeId: readTrimmedString(videoEditor.sourceVideoEditorNodeId) }
      : {}),
    ...(readTrimmedString(videoEditor.aspect) ? { aspect: readTrimmedString(videoEditor.aspect) } : {}),
    ...(readTrimmedString(videoEditor.resolution) ? { resolution: readTrimmedString(videoEditor.resolution) } : {}),
    billingUnit: "video_generation",
    durationMs: readFiniteNumberOrNull(timeline.durationMs) ?? 0,
    ...(renderPlan ? { renderPlan } : {}),
    source: "video_editor_export",
    timelineAssetCounts: {
      audio: countTimelineAssetRefs(timeline.audio),
      clips: countTimelineAssetRefs(timeline.clips),
    },
  };
}

function buildVideoRequest(
  upstreamOutputs: Array<Record<string, unknown> | null>,
  config: Record<string, unknown>,
): VideoGenerationRequest {
  const videoEditor = readVideoEditorConfig(config);
  const videoEditorMetadata = buildVideoEditorRequestMetadata(videoEditor);
  const videoEditorExportMetadata = buildVideoEditorExportMetadata(videoEditor, { includeRenderPlan: true });
  const baseMetadata = isPlainObject(config.metadata) ? config.metadata : {};
  const metadata = {
    ...baseMetadata,
    ...(videoEditorMetadata ? { videoEditor: videoEditorMetadata } : {}),
    ...(videoEditorExportMetadata ? { videoEditorExport: videoEditorExportMetadata } : {}),
  };
  const fallbackPrompt = readTrimmedString(config.generationPrompt)
    ?? readTrimmedString(config.prompt)
    ?? "";

  return {
    inputAssets: mergeAssetInputs(
      extractAssetInputs(upstreamOutputs),
      buildVideoEditorTimelineAssets(videoEditor),
    ),
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    model: typeof config.model === "string"
      ? config.model
      : typeof config.modelId === "string"
        ? config.modelId
        : null,
    prompt: extractPromptFromUpstreamOutputs(upstreamOutputs, fallbackPrompt),
    routeKey: typeof config.routeKey === "string" ? config.routeKey : null,
  };
}

function buildMediaUsageMetadata(
  kind: "image" | "video",
  node: Pick<CompiledWorkflowNode, "config" | "type">,
): Record<string, unknown> {
  const base = { sourceNodeType: node.type };
  if (kind !== "video") {
    return base;
  }
  const videoEditorExport = buildVideoEditorExportMetadata(readVideoEditorConfig(node.config ?? {}));
  return videoEditorExport ? { ...base, videoEditorExport } : base;
}

function resolveInputNodeOutput(
  workflowInput: Record<string, unknown>,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const inputKey = typeof config.inputKey === "string" ? config.inputKey.trim() : "";
  if (inputKey && workflowInput[inputKey] !== undefined) {
    return {
      [inputKey]: workflowInput[inputKey],
    };
  }

  return workflowInput;
}

function resolveOutputNodeOutput(upstreamOutputs: Array<Record<string, unknown> | null>): Record<string, unknown> {
  if (upstreamOutputs.length === 1 && upstreamOutputs[0]) {
    return upstreamOutputs[0];
  }

  return {
    outputs: upstreamOutputs.filter((value) => value !== null),
  };
}

export class WorkflowNodeExecutionService {
  readonly assetStore: MediaAssetStore;
  readonly billingService: BillingService;
  readonly imageVariantQueue: MediaVariantQueue | null;
  readonly mediaGenerationRuntime: MediaGenerationRuntimeLike;
  readonly nodeExecuteQueues: NodeExecuteQueueMapLike;
  readonly nodeExecuteQueue: NodeExecuteQueueLike;
  readonly pollDelayMs: number;
  readonly pool: Pool;
  readonly providerPollQueue: ProviderPollQueueLike;
  readonly textGenerationRuntime: TextGenerationRuntimeLike;
  readonly videoEditorLocalRenderService: Pick<VideoEditorLocalRenderService, "render">;

  constructor(options: {
    assetBucket: string;
    billingService?: BillingService;
    fetchFn?: FetchLike;
    imageVariantQueue?: MediaVariantQueue | null;
    imageVariantsMode?: "async" | "sync";
    mediaGenerationRuntime: MediaGenerationRuntimeLike;
    nodeExecuteQueue: NodeExecuteQueueLike;
    nodeExecuteQueues?: NodeExecuteQueueMapLike;
    pollDelayMs?: number;
    pool?: Pool;
    providerPollQueue: ProviderPollQueueLike;
    storageProvider: StorageProvider;
    textGenerationRuntime: TextGenerationRuntimeLike;
    videoEditorLocalRenderService?: Pick<VideoEditorLocalRenderService, "render">;
  }) {
    this.assetStore = new MediaAssetStore({
      assetBucket: options.assetBucket,
      fetchFn: options.fetchFn,
      storageProvider: options.storageProvider,
      variantMode: options.imageVariantsMode,
      variantQueue: options.imageVariantQueue,
    });
    this.billingService = options.billingService ?? new BillingService({
      pool: options.pool,
    });
    this.imageVariantQueue = options.imageVariantQueue ?? null;
    this.mediaGenerationRuntime = options.mediaGenerationRuntime;
    this.nodeExecuteQueue = options.nodeExecuteQueue;
    this.nodeExecuteQueues = {
      legacy: options.nodeExecuteQueue,
      ...options.nodeExecuteQueues,
    };
    this.pollDelayMs = options.pollDelayMs ?? 250;
    this.pool = options.pool ?? createPgPool();
    this.providerPollQueue = options.providerPollQueue;
    this.textGenerationRuntime = options.textGenerationRuntime;
    this.videoEditorLocalRenderService = options.videoEditorLocalRenderService ?? new VideoEditorLocalRenderService({
      storageProvider: options.storageProvider,
    });
  }

  async executeNode(
    input: NodeExecuteJobPayload,
    logger: WorkerLogger,
  ): Promise<ProcessorResult> {
    const preparedResult = await this.prepareNodeExecutionInTransaction(
      {
        tenantId: input.tenantId,
        traceId: input.traceId ?? null,
        userId: null,
      },
      input,
      logger,
    );
    const execution = preparedResult.type === "done"
      ? preparedResult.result
      : await this.executePreparedNode(
          {
            tenantId: input.tenantId,
            traceId: input.traceId ?? null,
            userId: null,
          },
          preparedResult.prepared,
          logger,
        );

    await this.flushEnqueues(execution);
    await this.flushAuditLogs(execution.auditLogs);

    if (execution.errorToThrow) {
      throw execution.errorToThrow;
    }

    return execution.processorResult;
  }

  async pollProviderTask(
    input: ProviderPollJobPayload,
    logger: WorkerLogger,
  ): Promise<ProcessorResult> {
    const execution = await this.pollProviderTaskInTransaction(
      {
        tenantId: input.tenantId,
        traceId: input.traceId ?? null,
        userId: null,
      },
      input,
      logger,
    );

    await this.flushEnqueues(execution);
    await this.flushAuditLogs(execution.auditLogs);

    if (execution.errorToThrow) {
      throw execution.errorToThrow;
    }

    return execution.processorResult;
  }

  private async flushEnqueues(execution: RuntimeExecutionResult): Promise<void> {
    for (const payload of execution.nodeEnqueuePayloads) {
      assertLightweightJobPayload(payload);
      const queueName = resolveNodeExecuteQueueName(payload.nodeType);
      await this.resolveNodeExecuteQueue(queueName).add(queueName, payload);
    }

    for (const instruction of execution.pollEnqueuePayloads) {
      assertLightweightJobPayload(instruction.payload);
      await this.providerPollQueue.add(QUEUE_NAMES.providerPoll, instruction.payload, {
        delay: instruction.delayMs,
      });
    }

    for (const job of execution.deferredVariantJobs) {
      if (!this.imageVariantQueue) {
        throw new Error("imageVariantQueue is required when deferred variant jobs are present");
      }
      assertLightweightJobPayload(job);
      await this.imageVariantQueue.add("asset.image-variants.create", job);
    }
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

  private async flushAuditLogs(auditLogs: AuditLogInput[]): Promise<void> {
    for (const auditLog of auditLogs) {
      await safeRecordAuditLog(auditLog, {
        pool: this.pool,
      });
    }
  }

  private async prepareNodeExecutionInTransaction(
    context: WorkflowExecutionContext,
    input: NodeExecuteJobPayload,
    logger: WorkerLogger,
  ): Promise<PreparedNodeExecutionResult> {
    return withTenantTransaction(context, async (client) => {
      const transactionStartedAt = Date.now();
      const workflowRun = await this.lockWorkflowRun(client, input.workflowRunId);
      logger.info(
        {
          nodeRunId: input.nodeRunId,
          transaction_started_at: new Date(transactionStartedAt).toISOString(),
          workflowRunId: input.workflowRunId,
        },
        "node.execute prepare transaction started",
      );
      if (isTerminalStatus(workflowRun.status)) {
        return {
          result: this.noOpResult(QUEUE_NAMES.nodeExecute, input),
          type: "done",
        };
      }

      const runtimeLoadStartedAt = Date.now();
      const runtimeFlow = await this.getRuntimeFlow(client, input.workflowRunId);
      const nodeRuns = await this.listNodeRuns(client, input.workflowRunId);
      logger.info(
        {
          nodeRunId: input.nodeRunId,
          runtime_graph_loaded_at: new Date().toISOString(),
          runtime_graph_load_ms: Date.now() - runtimeLoadStartedAt,
          workflowRunId: input.workflowRunId,
        },
        "node.execute runtime graph loaded",
      );
      const currentNodeRun = nodeRuns.find((nodeRun) => nodeRun.id === input.nodeRunId);

      if (!currentNodeRun) {
        throw new Error(`Node run not found: ${input.nodeRunId}`);
      }

      const currentNode = runtimeFlow.compiled_graph_json.nodes.find(
        (node) => node.id === currentNodeRun.node_id,
      );
      if (!currentNode) {
        throw new Error(`Compiled node not found: ${currentNodeRun.node_id}`);
      }

      if (
        isTerminalStatus(currentNodeRun.status) ||
        currentNodeRun.status === "running" ||
        currentNodeRun.status === "waiting_provider"
      ) {
        return {
          result: this.noOpResult(QUEUE_NAMES.nodeExecute, input),
          type: "done",
        };
      }

      if (getWorkflowRunMode(workflowRun) !== "target_node" && !this.areDependenciesSatisfied(currentNode, nodeRuns)) {
        return {
          result: this.noOpResult(QUEUE_NAMES.nodeExecute, input),
          type: "done",
        };
      }

      const markRunningStartedAt = Date.now();
      await this.markNodeRunRunning(client, currentNodeRun.id);
      await this.markWorkflowRunRunning(client, workflowRun.id);
      await this.appendWorkflowRunEvent(client, {
        eventType: "node.run.started",
        nodeRunId: currentNodeRun.id,
        payload: {
          attempt: currentNodeRun.attempt + 1,
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          status: "running",
        },
        tenantId: input.tenantId,
        workflowRunId: workflowRun.id,
      });
      logger.info(
        {
          marked_running_at: new Date().toISOString(),
          marked_running_ms: Date.now() - markRunningStartedAt,
          nodeRunId: currentNodeRun.id,
          targetNodeId: currentNode.id,
          workflowRunId: workflowRun.id,
        },
        "node.execute marked node running",
      );

      const upstreamOutputs = this.getDependencyOutputs(currentNode, nodeRuns, runtimeFlow);

      return {
        prepared: {
          currentNode,
          currentNodeRun,
          input,
          processorResult: {
            jobId: null,
            queueName: QUEUE_NAMES.nodeExecute,
            status: "ok",
            tenantId: input.tenantId,
            traceId: input.traceId ?? null,
          },
          runtimeFlow,
          upstreamOutputs,
          workflowRun,
        },
        type: "prepared",
      };
    }, this.pool);
  }

  private async executePreparedNode(
    context: WorkflowExecutionContext,
    prepared: PreparedNodeExecution,
    logger: WorkerLogger,
  ): Promise<RuntimeExecutionResult> {
    try {
      const outcome = await this.executeNodeByType(
        prepared.currentNode,
        prepared.upstreamOutputs,
        prepared.workflowRun,
        prepared.runtimeFlow,
        prepared.currentNodeRun,
        context,
        logger,
      );

      return await this.finalizeNodeExecutionInTransaction(
        context,
        prepared,
        outcome,
        logger,
      );
    } catch (error) {
      return await this.finalizeNodeExecutionErrorInTransaction(
        context,
        prepared,
        error,
      );
    }
  }

  private async finalizeNodeExecutionInTransaction(
    context: WorkflowExecutionContext,
    prepared: PreparedNodeExecution,
    outcome: ProviderExecutionOutcome,
    logger: WorkerLogger,
  ): Promise<RuntimeExecutionResult> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.lockWorkflowRun(client, prepared.workflowRun.id);
      if (isTerminalStatus(workflowRun.status)) {
        return this.noOpResult(QUEUE_NAMES.nodeExecute, prepared.input);
      }
      const runtimeFlow = await this.getRuntimeFlow(client, prepared.workflowRun.id);
      const nodeRuns = await this.listNodeRuns(client, prepared.workflowRun.id);
      const currentNodeRun = nodeRuns.find((nodeRun) => nodeRun.id === prepared.currentNodeRun.id);
      const currentNode = runtimeFlow.compiled_graph_json.nodes.find((node) => node.id === prepared.currentNode.id);
      if (!currentNodeRun || !currentNode) {
        throw new Error(`Node run or node not found while finalizing: ${prepared.currentNodeRun.id}`);
      }
      if (isTerminalStatus(currentNodeRun.status)) {
        return this.noOpResult(QUEUE_NAMES.nodeExecute, prepared.input);
      }

      let resolvedOutcome: NodeExecutionOutcome;
      if (outcome.type === "media_provider_succeeded") {
        try {
          resolvedOutcome = await this.mapMediaOutcome(
            client,
            currentNode,
            workflowRun,
            runtimeFlow,
            currentNodeRun,
            context,
            outcome.result,
            outcome.kind,
            logger,
          );
        } finally {
          if (outcome.cleanupDir) {
            await rm(outcome.cleanupDir, { force: true, recursive: true });
          }
        }
      } else {
        resolvedOutcome = outcome;
      }

      if (resolvedOutcome.type === "waiting_provider") {
        const primaryProviderTaskId = resolvedOutcome.pollPayloads[0]?.providerTaskId ?? null;
        await client.query(
          `
            UPDATE node_runs
            SET
              status = 'waiting_provider',
              output_json = $2::jsonb,
              provider_task_id = $3,
              error_json = NULL,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [currentNodeRun.id, JSON.stringify(resolvedOutcome.outputJson), primaryProviderTaskId],
        );

        await this.appendWorkflowRunEvent(client, {
          eventType: "node.run.waiting_provider",
          nodeRunId: currentNodeRun.id,
          payload: resolvedOutcome.outputJson,
          tenantId: prepared.input.tenantId,
          workflowRunId: workflowRun.id,
        });

        logger.info(
          {
            nodeRunId: currentNodeRun.id,
            providerTaskCount: resolvedOutcome.pollPayloads.length,
            providerTaskId: primaryProviderTaskId,
            workflowRunId: workflowRun.id,
          },
          "workflow node waiting on provider task",
        );

        return {
          auditLogs: [],
          deferredVariantJobs: [],
          nodeEnqueuePayloads: [],
          pollEnqueuePayloads: resolvedOutcome.pollPayloads.map((payload) => ({
            delayMs: this.pollDelayMs,
            payload,
          })),
          processorResult: prepared.processorResult,
        };
      }

      const successResult = await this.markNodeSucceededAndUnlockDependents(
        client,
        currentNode,
        runtimeFlow,
        workflowRun,
        currentNodeRun,
        context,
        resolvedOutcome.outputJson,
        resolvedOutcome.type === "succeeded" ? resolvedOutcome.usageRecord : undefined,
        logger,
        resolvedOutcome.type === "succeeded" ? (resolvedOutcome.deferredVariantJobs ?? []) : [],
      );

      logger.info(
        {
          enqueuedNodeCount: successResult.nodeEnqueuePayloads.length,
          nodeRunId: currentNodeRun.id,
          workflowRunId: workflowRun.id,
        },
        "workflow node execution succeeded",
      );

      return {
        auditLogs: successResult.auditLogs,
        deferredVariantJobs: successResult.deferredVariantJobs,
        nodeEnqueuePayloads: successResult.nodeEnqueuePayloads,
        pollEnqueuePayloads: [],
        processorResult: prepared.processorResult,
      };
    }, this.pool);
  }

  private async finalizeNodeExecutionErrorInTransaction(
    context: WorkflowExecutionContext,
    prepared: PreparedNodeExecution,
    error: unknown,
  ): Promise<RuntimeExecutionResult> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.lockWorkflowRun(client, prepared.workflowRun.id);
      if (isTerminalStatus(workflowRun.status)) {
        return this.noOpResult(QUEUE_NAMES.nodeExecute, prepared.input);
      }
      const nodeRuns = await this.listNodeRuns(client, prepared.workflowRun.id);
      const currentNodeRun = nodeRuns.find((nodeRun) => nodeRun.id === prepared.currentNodeRun.id);
      if (!currentNodeRun) {
        throw new Error(`Node run not found while finalizing error: ${prepared.currentNodeRun.id}`);
      }

      if (isProviderResultUnknownError(error)) {
        const unknownOutput = this.buildProviderResultUnknownOutput(error, prepared.currentNode, workflowRun, currentNodeRun);
        const providerTaskId = `${UNKNOWN_PROVIDER_RECONCILE_PREFIX}${currentNodeRun.id}`;
        await client.query(
          `
            UPDATE node_runs
            SET
              status = 'waiting_provider',
              output_json = $2::jsonb,
              provider_task_id = $3,
              error_json = $4::jsonb,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [
            currentNodeRun.id,
            JSON.stringify(unknownOutput),
            providerTaskId,
            JSON.stringify({
              code: "PROVIDER_RESULT_UNKNOWN",
              message: "Provider request timed out locally after it was sent; keeping reservation open while checking for a recoverable result.",
            }),
          ],
        );
        await this.appendWorkflowRunEvent(client, {
          eventType: "node.run.waiting_provider",
          nodeRunId: currentNodeRun.id,
          payload: unknownOutput,
          tenantId: prepared.input.tenantId,
          workflowRunId: workflowRun.id,
        });
        return {
          auditLogs: [],
          deferredVariantJobs: [],
          nodeEnqueuePayloads: [],
          pollEnqueuePayloads: [
            {
              delayMs: this.pollDelayMs,
              payload: {
                nodeRunId: currentNodeRun.id,
                providerTaskId,
                tenantId: prepared.input.tenantId,
                traceId: prepared.input.traceId ?? undefined,
                workflowRunId: workflowRun.id,
              },
            },
          ],
          processorResult: prepared.processorResult,
        };
      }

      const normalized = normalizeError(error);
      await this.failNodeAndWorkflow(client, workflowRun.id, currentNodeRun.id, prepared.input.tenantId, normalized);

      return {
        auditLogs: [],
        deferredVariantJobs: [],
        errorToThrow: error instanceof Error ? error : new Error(String(error)),
        nodeEnqueuePayloads: [],
        pollEnqueuePayloads: [],
        processorResult: prepared.processorResult,
      };
    }, this.pool);
  }

  private async pollProviderTaskInTransaction(
    context: WorkflowExecutionContext,
    input: ProviderPollJobPayload,
    logger: WorkerLogger,
  ): Promise<RuntimeExecutionResult> {
    return withTenantTransaction(context, async (client) => {
      const workflowRun = await this.lockWorkflowRun(client, input.workflowRunId);
      if (isTerminalStatus(workflowRun.status)) {
        return this.noOpResult(QUEUE_NAMES.providerPoll, input);
      }

      const runtimeFlow = await this.getRuntimeFlow(client, input.workflowRunId);
      const nodeRuns = await this.listNodeRuns(client, input.workflowRunId);
      const currentNodeRun = nodeRuns.find((nodeRun) => nodeRun.id === input.nodeRunId);

      if (!currentNodeRun) {
        throw new Error(`Node run not found: ${input.nodeRunId}`);
      }

      if (currentNodeRun.status !== "waiting_provider") {
        return this.noOpResult(QUEUE_NAMES.providerPoll, input);
      }

      const currentNode = runtimeFlow.compiled_graph_json.nodes.find(
        (node) => node.id === currentNodeRun.node_id,
      );
      if (!currentNode) {
        throw new Error(`Compiled node not found: ${currentNodeRun.node_id}`);
      }

      if (input.providerTaskId.startsWith(UNKNOWN_PROVIDER_RECONCILE_PREFIX)) {
        const providerState = isPlainObject(currentNodeRun.output_json?.providerTask)
          ? currentNodeRun.output_json?.providerTask
          : {};
        const reconcileUntil =
          typeof providerState.reconcileUntil === "string"
            ? Date.parse(providerState.reconcileUntil)
            : 0;

        if (Number.isFinite(reconcileUntil) && Date.now() < reconcileUntil) {
          return {
            auditLogs: [],
            deferredVariantJobs: [],
            nodeEnqueuePayloads: [],
            pollEnqueuePayloads: [
              {
                delayMs: this.pollDelayMs,
                payload: {
                  nodeRunId: input.nodeRunId,
                  providerTaskId: input.providerTaskId,
                  tenantId: input.tenantId,
                  traceId: input.traceId ?? undefined,
                  workflowRunId: input.workflowRunId,
                },
              },
            ],
            processorResult: {
              jobId: null,
              queueName: QUEUE_NAMES.providerPoll,
              status: "ok",
              tenantId: input.tenantId,
              traceId: input.traceId ?? null,
            },
          };
        }

        const normalized = {
          code: "PROVIDER_RESULT_UNKNOWN_EXPIRED",
          details: currentNodeRun.output_json ?? {},
          message: "Provider result could not be recovered before the reconciliation window expired.",
        };
        await this.failNodeAndWorkflow(client, workflowRun.id, currentNodeRun.id, input.tenantId, normalized);
        return {
          auditLogs: [],
          deferredVariantJobs: [],
          nodeEnqueuePayloads: [],
          pollEnqueuePayloads: [],
          processorResult: {
            jobId: null,
            queueName: QUEUE_NAMES.providerPoll,
            status: "ok",
            tenantId: input.tenantId,
            traceId: input.traceId ?? null,
          },
        };
      }

      try {
        const waitingProviderTasks = this.readWaitingProviderTasks(currentNodeRun.output_json);
        const currentProviderTask =
          waitingProviderTasks.find((task) => task.providerTaskId === input.providerTaskId)
          ?? (isPlainObject(currentNodeRun.output_json?.providerTask) ? currentNodeRun.output_json?.providerTask : {});

        const pollResult = await this.mediaGenerationRuntime.pollTask(
          {
            tenantId: context.tenantId,
            userId: context.userId,
          },
          currentNode.type === "video.generate" ? "video" : "image",
          {
            providerTaskId: input.providerTaskId,
            routeId: typeof currentProviderTask.routeId === "string" ? currentProviderTask.routeId : null,
            routeKey: typeof currentProviderTask.routeKey === "string" ? currentProviderTask.routeKey : null,
          },
          {
            nodeRunId: currentNodeRun.id,
            workflowRunId: workflowRun.id,
          },
        );

        if (pollResult.status === "pending" || pollResult.status === "running") {
          const updatedTasks = this.updateWaitingProviderTaskStates(
            waitingProviderTasks,
            input.providerTaskId,
            {
              status: pollResult.status,
            },
          );
          const waitingJson = this.buildWaitingProviderOutput(updatedTasks);

          await client.query(
            `
              UPDATE node_runs
              SET
                output_json = $2::jsonb,
                updated_at = now()
              WHERE id = $1::uuid
            `,
            [currentNodeRun.id, JSON.stringify(waitingJson)],
          );

          await this.appendWorkflowRunEvent(client, {
            eventType: "node.run.waiting_provider",
            nodeRunId: currentNodeRun.id,
            payload: waitingJson,
            tenantId: input.tenantId,
            workflowRunId: workflowRun.id,
          });

          return {
            auditLogs: [],
            deferredVariantJobs: [],
            nodeEnqueuePayloads: [],
            pollEnqueuePayloads: [
              {
                delayMs: this.pollDelayMs,
                payload: {
                  nodeRunId: input.nodeRunId,
                  providerTaskId: input.providerTaskId,
                  tenantId: input.tenantId,
                  traceId: input.traceId ?? undefined,
                  workflowRunId: input.workflowRunId,
                },
              },
            ],
            processorResult: {
              jobId: null,
              queueName: QUEUE_NAMES.providerPoll,
              status: "ok",
              tenantId: input.tenantId,
              traceId: input.traceId ?? null,
            },
          };
        }

        if (pollResult.status === "failed") {
          const normalized = normalizeError(pollResult.error ?? { message: "Provider task failed" });
          await this.failNodeAndWorkflow(client, workflowRun.id, currentNodeRun.id, input.tenantId, normalized);
          return {
            auditLogs: [],
            deferredVariantJobs: [],
            errorToThrow: new Error(normalized.message),
            nodeEnqueuePayloads: [],
            pollEnqueuePayloads: [],
            processorResult: {
              jobId: null,
              queueName: QUEUE_NAMES.providerPoll,
              status: "ok",
              tenantId: input.tenantId,
              traceId: input.traceId ?? null,
            },
          };
        }

        const succeededOutputs = this.normalizeMediaOutputs(
          pollResult.outputs ?? [],
          pollResult.outputUrls ?? [],
          pollResult.outputBase64 ?? [],
          pollResult.mimeType ?? null,
        );
        const completedTasks = this.updateWaitingProviderTaskStates(
          waitingProviderTasks,
          input.providerTaskId,
          {
            outputs: succeededOutputs,
            status: "succeeded",
          },
        );
        const pendingTasks = completedTasks.filter((task) => task.status !== "succeeded");
        if (pendingTasks.length > 0) {
          const waitingJson = this.buildWaitingProviderOutput(completedTasks);
          await client.query(
            `
              UPDATE node_runs
              SET
                output_json = $2::jsonb,
                updated_at = now()
              WHERE id = $1::uuid
            `,
            [currentNodeRun.id, JSON.stringify(waitingJson)],
          );
          await this.appendWorkflowRunEvent(client, {
            eventType: "node.run.waiting_provider",
            nodeRunId: currentNodeRun.id,
            payload: waitingJson,
            tenantId: input.tenantId,
            workflowRunId: workflowRun.id,
          });
          return {
            auditLogs: [],
            deferredVariantJobs: [],
            nodeEnqueuePayloads: [],
            pollEnqueuePayloads: [],
            processorResult: {
              jobId: null,
              queueName: QUEUE_NAMES.providerPoll,
              status: "ok",
              tenantId: input.tenantId,
              traceId: input.traceId ?? null,
            },
          };
        }

        const aggregatedOutputs = completedTasks.flatMap((task) => task.outputs ?? []);
        const persistedMedia = await this.persistProviderResult(
          client,
          currentNode,
          workflowRun,
          runtimeFlow,
          currentNodeRun,
          {
            ...pollResult,
            outputs: aggregatedOutputs,
          },
        );
        const outputJson = persistedMedia.outputJson;
        const usageRecord = this.buildUsageRecord({
          billableCents: this.getReservedCents(currentNodeRun),
          eventType: currentNode.type === "video.generate" ? "ai.video.generate" : "ai.image.generate",
          idempotencyKey: this.buildUsageIdempotencyKey(
            context.tenantId,
            workflowRun.id,
            currentNodeRun.id,
            currentNode.type === "video.generate" ? "video" : "image",
          ),
          inputTokens: pollResult.usage?.inputTokens ?? null,
          modelKey: pollResult.modelKey ?? null,
          modality: currentNode.type === "video.generate" ? "video" : "image",
          modelId: pollResult.modelId ?? null,
          nodeRunId: currentNodeRun.id,
          outputTokens: pollResult.usage?.outputTokens ?? null,
          providerId: pollResult.providerId ?? null,
          rawCost: pollResult.usage?.rawCost ?? null,
          reserveLedgerId: this.getReserveLedgerId(currentNodeRun),
          routeId: pollResult.routeId ?? null,
          routeKey: pollResult.routeKey ?? null,
          totalTokens: pollResult.usage?.totalTokens ?? null,
          unitType: "output_count",
          units: outputJson.assets && Array.isArray(outputJson.assets) ? outputJson.assets.length : 0,
          workflowRunId: workflowRun.id,
        });
        const successResult = await this.markNodeSucceededAndUnlockDependents(
          client,
          currentNode,
          runtimeFlow,
          workflowRun,
          currentNodeRun,
          context,
          outputJson,
          usageRecord,
          logger,
          persistedMedia.deferredVariantJobs,
        );

        logger.info(
          {
            enqueuedNodeCount: successResult.nodeEnqueuePayloads.length,
            nodeRunId: currentNodeRun.id,
            providerTaskId: input.providerTaskId,
            workflowRunId: workflowRun.id,
          },
          "provider task polling succeeded",
        );

        return {
          auditLogs: successResult.auditLogs,
          deferredVariantJobs: successResult.deferredVariantJobs,
          nodeEnqueuePayloads: successResult.nodeEnqueuePayloads,
          pollEnqueuePayloads: [],
          processorResult: {
            jobId: null,
            queueName: QUEUE_NAMES.providerPoll,
            status: "ok",
            tenantId: input.tenantId,
            traceId: input.traceId ?? null,
          },
        };
      } catch (error) {
        const normalized = normalizeError(error);
        await this.failNodeAndWorkflow(client, workflowRun.id, currentNodeRun.id, input.tenantId, normalized);
        return {
          auditLogs: [],
          deferredVariantJobs: [],
          errorToThrow: error instanceof Error ? error : new Error(String(error)),
          nodeEnqueuePayloads: [],
          pollEnqueuePayloads: [],
          processorResult: {
            jobId: null,
            queueName: QUEUE_NAMES.providerPoll,
            status: "ok",
            tenantId: input.tenantId,
            traceId: input.traceId ?? null,
          },
        };
      }
    }, this.pool);
  }

  private noOpResult(
    queueName: string,
    input: {
      tenantId: string;
      traceId?: string;
    },
  ): RuntimeExecutionResult {
    return {
      auditLogs: [],
      deferredVariantJobs: [],
      nodeEnqueuePayloads: [],
      pollEnqueuePayloads: [],
      processorResult: {
        jobId: null,
        queueName,
        status: "no-op",
        tenantId: input.tenantId,
        traceId: input.traceId ?? null,
      },
    };
  }

  private areDependenciesSatisfied(
    node: CompiledWorkflowNode,
    nodeRuns: NodeRunRecord[],
  ): boolean {
    return node.dependencies.every((dependencyId) => {
      const dependencyRun = nodeRuns.find((row) => row.node_id === dependencyId);
      return dependencyRun?.status === "succeeded";
    });
  }

  private async appendWorkflowRunEvent(
    client: PoolClient,
    input: WorkflowRunEventAppendInput,
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

  private async executeNodeByType(
    node: CompiledWorkflowNode,
    upstreamOutputs: Array<Record<string, unknown> | null>,
    workflowRun: WorkflowRunRecord,
    runtimeFlow: RuntimeFlowRecord,
    nodeRun: NodeRunRecord,
    context: WorkflowExecutionContext,
    logger: WorkerLogger,
  ): Promise<ProviderExecutionOutcome> {
    if (node.type === "input") {
      return {
        outputJson: resolveInputNodeOutput(workflowRun.input_json ?? {}, node.config ?? {}),
        type: "succeeded",
      };
    }

    if (node.type === "text.generate") {
      const request = buildTextMessages(upstreamOutputs, node.config ?? {});
      const result = await this.textGenerationRuntime.generateText(
        {
          tenantId: context.tenantId,
          userId: context.userId,
        },
        request,
        {
          nodeRunId: nodeRun.id,
          workflowRunId: workflowRun.id,
        },
      );

      return {
        usageRecord: this.buildUsageRecord({
          billableCents: this.getReservedCents(nodeRun),
          eventType: "ai.text.generate",
          idempotencyKey: this.buildUsageIdempotencyKey(context.tenantId, workflowRun.id, nodeRun.id, "text"),
          inputTokens: result.usage.inputTokens,
          modelKey: result.modelKey ?? null,
          modality: "text",
          modelId: result.modelId ?? null,
          nodeRunId: nodeRun.id,
          outputTokens: result.usage.outputTokens,
          providerId: result.providerId ?? null,
          rawCost: result.usage.rawCost ?? null,
          reserveLedgerId: this.getReserveLedgerId(nodeRun),
          routeId: result.routeId ?? null,
          routeKey: result.routeKey ?? null,
          totalTokens: result.usage.totalTokens,
          workflowRunId: workflowRun.id,
        }),
        outputJson: this.mapTextGenerationOutput(result),
        type: "succeeded",
      };
    }

    if (node.type === "image.generate") {
      const nodeConfig = mergeAgentToolIntoImageNodeConfig(
        node.config ?? {},
        workflowRun.input_json ?? {},
        node.id,
      );
      const request = buildImageRequest(upstreamOutputs, nodeConfig);
      await this.hydrateInputAssetUrls(workflowRun.tenant_id, request.inputAssets ?? []);
      if (request.routeKey === "image.mouxihub.nano-banana-pro.t3") {
        const metadata = isPlainObject(request.metadata) ? request.metadata : {};
        const referenceImages = Array.isArray(metadata.referenceImages) ? metadata.referenceImages : [];
        logger.info(
          {
            event: "workflow.image.request_debug",
            inputAssetCount: request.inputAssets?.length ?? 0,
            inputAssetKinds: Array.isArray(request.inputAssets) ? request.inputAssets.map(classifyRequestInputAssetKind) : [],
            model: request.model ?? null,
            metadataReferenceImageCount: referenceImages.length,
            metadataReferenceImageKinds: referenceImages.map(classifyReferenceDebugValue),
            nodeRunId: nodeRun.id,
            params: pickImageRequestDebugParams(metadata),
            prompt: request.prompt,
            routeKey: request.routeKey,
            source: typeof metadata.source === "string" ? metadata.source : "workflow",
            targetNodeId: node.id,
            tenantId: context.tenantId,
            traceId: context.traceId ?? null,
            workflowRunId: workflowRun.id,
          },
          "workflow image request debug",
        );
      }
      const providerStartedAt = Date.now();
      logger.info(
        {
          nodeRunId: nodeRun.id,
          provider_started_at: new Date(providerStartedAt).toISOString(),
          targetNodeId: node.id,
          tenantId: context.tenantId,
          workflowRunId: workflowRun.id,
        },
        "provider image generation request started",
      );
      let result: AiGatewayMediaResult;
      try {
        result = await this.mediaGenerationRuntime.generateImage(
          {
            tenantId: context.tenantId,
            userId: context.userId,
          },
          request,
          {
            nodeRunId: nodeRun.id,
            workflowRunId: workflowRun.id,
          },
        );
      } finally {
        logger.info(
          {
            nodeRunId: nodeRun.id,
            provider_finished_at: new Date().toISOString(),
            provider_latency_ms: Math.max(0, Date.now() - providerStartedAt),
            targetNodeId: node.id,
            tenantId: context.tenantId,
            workflowRunId: workflowRun.id,
          },
          "provider image generation request finished",
        );
      }

      return {
        kind: "image",
        node,
        nodeRun,
        result,
        runtimeFlow,
        type: "media_provider_succeeded",
        workflowRun,
      };
    }

    if (node.type === "video.generate") {
      const request = buildVideoRequest(upstreamOutputs, node.config ?? {});
      const localRenderOutcome = await this.maybeRenderVideoEditorExportLocally(request, node, workflowRun, context, logger);
      if (localRenderOutcome) {
        return {
          cleanupDir: localRenderOutcome.cleanupDir,
          kind: "video",
          node,
          nodeRun,
          result: localRenderOutcome.result,
          runtimeFlow,
          type: "media_provider_succeeded",
          workflowRun,
        };
      }
      await this.hydrateInputAssetUrls(workflowRun.tenant_id, request.inputAssets ?? []);
      const providerStartedAt = Date.now();
      logger.info(
        {
          nodeRunId: nodeRun.id,
          provider_started_at: new Date(providerStartedAt).toISOString(),
          targetNodeId: node.id,
          tenantId: context.tenantId,
          workflowRunId: workflowRun.id,
        },
        "provider video generation request started",
      );
      let result: AiGatewayMediaResult;
      try {
        result = await this.mediaGenerationRuntime.generateVideo(
          {
            tenantId: context.tenantId,
            userId: context.userId,
          },
          request,
          {
            nodeRunId: nodeRun.id,
            workflowRunId: workflowRun.id,
          },
        );
      } finally {
        logger.info(
          {
            nodeRunId: nodeRun.id,
            provider_finished_at: new Date().toISOString(),
            provider_latency_ms: Math.max(0, Date.now() - providerStartedAt),
            targetNodeId: node.id,
            tenantId: context.tenantId,
            workflowRunId: workflowRun.id,
          },
          "provider video generation request finished",
        );
      }

      return {
        kind: "video",
        node,
        nodeRun,
        result,
        runtimeFlow,
        type: "media_provider_succeeded",
        workflowRun,
      };
    }

    if (node.type === "output") {
      return {
        outputJson: resolveOutputNodeOutput(upstreamOutputs),
        type: "succeeded",
      };
    }

    throw new Error(`Unsupported node type for PR-12: ${node.type}`);
  }

  private async mapMediaOutcome(
    client: PoolClient,
    node: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    runtimeFlow: RuntimeFlowRecord,
    nodeRun: NodeRunRecord,
    context: WorkflowExecutionContext,
    result: AiGatewayMediaResult,
    kind: "image" | "video",
    logger: WorkerLogger,
  ): Promise<NodeExecutionOutcome> {
    const routeKey = kind === "video"
      ? resolveVideoRequestRouteKey(node.config ?? {})
      : resolveImageRequestRouteKey(node.config);
    const providerFinishedAt = Date.now();

    if (result.status === "waiting_provider") {
      const taskAwareResult = result as AiGatewayMediaResultWithTaskIds;
      const providerTaskIds = Array.isArray(taskAwareResult.providerTaskIds)
        ? taskAwareResult.providerTaskIds.filter(
            (value: unknown): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : result.providerTaskId
          ? [result.providerTaskId]
          : [];
      if (providerTaskIds.length === 0) {
        throw new Error("Provider task ID is required for waiting_provider results");
      }

      const providerTasks = providerTaskIds.map<WaitingProviderTaskState>((providerTaskId: string) => ({
        modelId: result.modelId ?? null,
        modelKey: result.modelKey,
        providerId: result.providerId ?? null,
        providerKey: result.providerKey,
        providerTaskId,
        routeId: result.routeId ?? null,
        routeKey,
        status: "waiting_provider",
      }));

      return {
        outputJson: this.buildWaitingProviderOutput(providerTasks),
        pollPayloads: providerTaskIds.map((providerTaskId: string) => ({
          nodeRunId: nodeRun.id,
          providerTaskId,
          tenantId: context.tenantId,
          traceId: context.traceId ?? undefined,
          workflowRunId: workflowRun.id,
        })),
        type: "waiting_provider",
      };
    }

    const runtimeDiagnostic = buildAiRuntimeDiagnostic({
      modelId: result.modelId ?? null,
      modelKey: result.modelKey,
      providerId: result.providerId ?? null,
      providerKey: result.providerKey,
      routeId: result.routeId ?? null,
      routeKey,
    });
    const mediaPersistStartedAt = Date.now();
    const persistedMedia = await this.persistMediaOutputs(
      client,
      kind,
      workflowRun,
      runtimeFlow,
      nodeRun,
      this.normalizeMediaOutputs(result.outputs ?? []),
    );
    const mediaPersistTotalMs = Math.max(0, Date.now() - mediaPersistStartedAt);
    const outputJson: Record<string, unknown> = {
      ...persistedMedia.outputJson,
      aiRuntime: runtimeDiagnostic,
    };
    logger.info(
      {
        asset_persisted_at: new Date().toISOString(),
        assetTimings: persistedMedia.assetTimings,
        modelId: runtimeDiagnostic.modelId,
        modelKey: runtimeDiagnostic.modelKey,
        media_persist_total_ms: mediaPersistTotalMs,
        nodeRunId: nodeRun.id,
        outputCount: Array.isArray(outputJson.assets) ? outputJson.assets.length : 0,
        provider_finished_to_asset_persisted_ms: Math.max(0, Date.now() - providerFinishedAt),
        providerId: runtimeDiagnostic.providerId,
        providerKey: runtimeDiagnostic.providerKey,
        routeId: runtimeDiagnostic.routeId,
        routeKey: runtimeDiagnostic.routeKey,
        targetNodeId: node.id,
        tenantId: context.tenantId,
        workflowRunId: workflowRun.id,
      },
      "workflow media assets persisted",
    );

    return {
      deferredVariantJobs: persistedMedia.deferredVariantJobs,
      usageRecord: this.buildUsageRecord({
        billableCents: this.getReservedCents(nodeRun),
        eventType: kind === "image" ? "ai.image.generate" : "ai.video.generate",
        idempotencyKey: this.buildUsageIdempotencyKey(
          context.tenantId,
          workflowRun.id,
          nodeRun.id,
          kind,
        ),
        inputTokens: result.usage?.inputTokens ?? null,
        metadata: buildMediaUsageMetadata(kind, node),
        modelKey: result.modelKey ?? null,
        modality: kind,
        modelId: result.modelId ?? null,
        nodeRunId: nodeRun.id,
        outputTokens: result.usage?.outputTokens ?? null,
        providerId: result.providerId ?? null,
        rawCost: result.usage?.rawCost ?? null,
        reserveLedgerId: this.getReserveLedgerId(nodeRun),
        routeId: result.routeId ?? null,
        routeKey: result.routeKey ?? null,
        totalTokens: result.usage?.totalTokens ?? null,
        unitType: "output_count",
        units: outputJson.assets && Array.isArray(outputJson.assets) ? outputJson.assets.length : 0,
        workflowRunId: workflowRun.id,
      }),
      outputJson,
      type: "succeeded",
    };
  }

  private buildWaitingProviderOutput(input: WaitingProviderTaskState[]): Record<string, unknown> {
    const primary = input[0];
    if (!primary) {
      throw new Error("At least one provider task is required");
    }

    return {
      providerTask: {
        modelId: primary.modelId,
        modelKey: primary.modelKey,
        providerId: primary.providerId,
        providerKey: primary.providerKey,
        providerTaskId: primary.providerTaskId,
        routeId: primary.routeId,
        routeKey: primary.routeKey,
        status: primary.status,
      },
      providerTasks: input,
    };
  }

  private buildProviderResultUnknownOutput(
    error: unknown,
    node: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    nodeRun: NodeRunRecord,
  ): Record<string, unknown> {
    const providerRequest = error instanceof AiGatewayError ? error.providerRequest : null;
    return {
      providerTask: {
        nodeId: node.id,
        nodeRunId: nodeRun.id,
        providerRequest,
        providerTaskId: `${UNKNOWN_PROVIDER_RECONCILE_PREFIX}${nodeRun.id}`,
        reconcileReason: "provider_result_unknown",
        reconcileUntil: new Date(Date.now() + UNKNOWN_PROVIDER_RECONCILE_WINDOW_MS).toISOString(),
        status: "provider_result_unknown",
        workflowRunId: workflowRun.id,
      },
    };
  }

  private readWaitingProviderTasks(outputJson: Record<string, unknown> | null): WaitingProviderTaskState[] {
    const providerTasks = Array.isArray(outputJson?.providerTasks)
      ? outputJson.providerTasks.filter(isWaitingProviderTaskState)
      : [];
    if (providerTasks.length > 0) {
      return providerTasks;
    }

    const legacyTask = isWaitingProviderTaskState(outputJson?.providerTask)
      ? outputJson.providerTask
      : null;
    return legacyTask ? [legacyTask] : [];
  }

  private updateWaitingProviderTaskStates(
    tasks: WaitingProviderTaskState[],
    providerTaskId: string,
    patch: Partial<WaitingProviderTaskState>,
  ): WaitingProviderTaskState[] {
    return tasks.map((task) =>
      task.providerTaskId === providerTaskId
        ? {
            ...task,
            ...patch,
          }
        : task
    );
  }

  private normalizeMediaOutputs(
    outputs: Array<Record<string, unknown> | MediaOutput | null | undefined>,
    outputUrls: string[] = [],
    outputBase64: string[] = [],
    mimeType: string | null = null,
  ): MediaOutput[] {
    return normalizeMediaOutputs(outputs, outputUrls, outputBase64, mimeType);
  }

  private async persistProviderResult(
    client: PoolClient,
    node: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    runtimeFlow: RuntimeFlowRecord,
    nodeRun: NodeRunRecord,
    result: ProviderTaskResult,
  ): Promise<PersistedMediaOutput> {
    return this.persistMediaOutputs(
      client,
      node.type === "video.generate" ? "video" : "image",
      workflowRun,
      runtimeFlow,
      nodeRun,
      this.normalizeMediaOutputs(
        result.outputs ?? [],
        result.outputUrls ?? [],
        result.outputBase64 ?? [],
        result.mimeType ?? null,
      ),
    );
  }

  private async persistMediaOutputs(
    client: PoolClient,
    kind: "image" | "video",
    workflowRun: WorkflowRunRecord,
    runtimeFlow: RuntimeFlowRecord,
    nodeRun: NodeRunRecord,
    outputs: MediaOutput[],
  ): Promise<PersistedMediaOutput> {
    const persistedAssets = await this.assetStore.persistOutputs(client, {
      kind,
      nodeRunId: nodeRun.id,
      outputs,
      projectId: runtimeFlow.project_id,
      tenantId: workflowRun.tenant_id,
      workflowRunId: workflowRun.id,
    });
    const assets = persistedAssets.refs;
    const assetTimings = assets
      .filter((asset) => asset.timing)
      .map((asset) => ({
        assetId: asset.assetId,
        ...asset.timing,
      }));
    const serializableAssets: SerializableAssetRef[] = assets.map((asset) => {
      const { timing: _timing, ...serializable } = asset;
      return serializable;
    });

    return {
      assetTimings,
      deferredVariantJobs: persistedAssets.deferredVariantJobs,
      outputJson: {
        assets: serializableAssets,
        flowId: runtimeFlow.flow_id,
        nodeId: nodeRun.node_id,
        nodeRunId: nodeRun.id,
        projectId: runtimeFlow.project_id,
        targetNodeId: nodeRun.node_id,
        workflowRunId: workflowRun.id,
      },
    };
  }

  private async maybeRenderVideoEditorExportLocally(
    request: VideoGenerationRequest,
    node: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    context: WorkflowExecutionContext,
    logger: WorkerLogger,
  ): Promise<{ cleanupDir: string | null; result: AiGatewayMediaResult } | null> {
    if (!readVideoEditorExportRenderPlan(request)) {
      return null;
    }
    const videoEditor = readVideoEditorConfig(node.config ?? {});
    if (!videoEditor) {
      return null;
    }

    const routeKey = resolveVideoRequestRouteKey(node.config ?? {});
    const capability = await withTenantTransaction(
      { tenantId: context.tenantId, userId: null },
      async (client) => this.loadVideoEditorRenderRouteCapability(client, context.tenantId, routeKey),
      this.pool,
    );
    if (capability?.renderEngine !== VIDEO_EDITOR_FFMPEG_RENDER_ENGINE) {
      return null;
    }

    const plan = buildVideoEditorRenderPlan(videoEditor);
    logger.info(
      {
        event: "workflow.video_editor.local_render.started",
        renderAssetCount: plan.assetIds.length,
        renderEngine: VIDEO_EDITOR_FFMPEG_RENDER_ENGINE,
        routeKey,
        targetNodeId: node.id,
        tenantId: context.tenantId,
        traceId: context.traceId,
        workflowRunId: workflowRun.id,
      },
      "workflow video editor local render started",
    );
    const assetLookups = await withTenantTransaction(
      { tenantId: context.tenantId, userId: null },
      async (client) => this.loadAssetStorageLookups(client, context.tenantId, plan.assetIds),
      this.pool,
    );
    const renderResult = await this.videoEditorLocalRenderService.render({
      assetLookups: assetLookups as Map<string, VideoEditorRenderAssetLookup>,
      plan,
      tenantId: context.tenantId,
      workflowRunId: workflowRun.id,
    });
    logger.info(
      {
        event: "workflow.video_editor.local_render.finished",
        outputDurationMs: renderResult.output.durationMs ?? null,
        outputHeight: renderResult.output.height ?? null,
        outputMimeType: renderResult.output.mimeType ?? null,
        outputWidth: renderResult.output.width ?? null,
        renderEngine: VIDEO_EDITOR_FFMPEG_RENDER_ENGINE,
        routeKey,
        targetNodeId: node.id,
        tenantId: context.tenantId,
        traceId: context.traceId,
        workflowRunId: workflowRun.id,
      },
      "workflow video editor local render finished",
    );

    return {
      cleanupDir: localOutputDirFromRenderResult(renderResult),
      result: {
        modelKey: "video-editor-ffmpeg",
        outputs: [renderResult.output],
        providerKey: "local",
        providerRequest: { renderEngine: VIDEO_EDITOR_FFMPEG_RENDER_ENGINE },
        providerResponse: { status: "rendered" },
        routeKey,
        status: "succeeded",
        usage: null,
      },
    };
  }

  private buildDraftOutputPatch(
    currentNode: CompiledWorkflowNode,
    workflowRun: WorkflowRunRecord,
    runtimeFlow: RuntimeFlowRecord,
    nodeRun: NodeRunRecord,
    outputJson: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const assets = Array.isArray(outputJson.assets) ? outputJson.assets : [];
    const primaryAsset = assets.find((asset): asset is Record<string, unknown> => isPlainObject(asset) && typeof asset.assetId === "string");
    const aiRuntime = isPlainObject(outputJson.aiRuntime) ? outputJson.aiRuntime : null;
    if (!primaryAsset) {
      return null;
    }
    if (currentNode.type !== "image.generate" && currentNode.type !== "video.generate") {
      return null;
    }

    return {
      assetId: primaryAsset.assetId,
      assetIds: assets
        .filter((asset): asset is Record<string, unknown> => isPlainObject(asset) && typeof asset.assetId === "string")
        .map((asset) => asset.assetId),
      errorMessage: null,
      generationStatus: "done",
      latestNodeRunId: nodeRun.id,
      latestWorkflowRunId: workflowRun.id,
      ...(aiRuntime ? { aiRuntime } : {}),
      mimeType: typeof primaryAsset.mimeType === "string" ? primaryAsset.mimeType : undefined,
      naturalHeight: typeof primaryAsset.height === "number" ? primaryAsset.height : undefined,
      naturalWidth: typeof primaryAsset.width === "number" ? primaryAsset.width : undefined,
      progress: 100,
      projectId: runtimeFlow.project_id,
      source: "generated",
      status: "success",
      targetNodeId: currentNode.id,
      workflowRunId: workflowRun.id,
    };
  }

  private async isLatestTargetNodeRun(
    client: PoolClient,
    workflowRun: WorkflowRunRecord,
    nodeId: string,
  ): Promise<boolean> {
    if (getWorkflowRunMode(workflowRun) !== "target_node" || getWorkflowRunTargetNodeId(workflowRun) !== nodeId) {
      return true;
    }

    const newer = await client.query<{ id: string }>(
      `
        SELECT newer.id::text AS id
        FROM workflow_runs AS current
        JOIN workflow_runs AS newer
          ON newer.tenant_id = current.tenant_id
         AND newer.flow_id = current.flow_id
         AND newer.input_json->>'runMode' = 'target_node'
         AND newer.input_json->>'targetNodeId' = $2
         AND newer.created_at > current.created_at
        WHERE current.id = $1::uuid
        LIMIT 1
      `,
      [workflowRun.id, nodeId],
    );

    return newer.rowCount === 0;
  }

  private async patchTargetNodeOutputIntoDraft(
    client: PoolClient,
    currentNode: CompiledWorkflowNode,
    runtimeFlow: RuntimeFlowRecord,
    workflowRun: WorkflowRunRecord,
    currentNodeRun: NodeRunRecord,
    outputJson: Record<string, unknown>,
  ): Promise<void> {
    const patch = this.buildDraftOutputPatch(currentNode, workflowRun, runtimeFlow, currentNodeRun, outputJson);
    if (!patch) {
      return;
    }
    if (!(await this.isLatestTargetNodeRun(client, workflowRun, currentNode.id))) {
      return;
    }

    const draft = await client.query<{ graph_json: { edges: unknown[]; nodes: Array<Record<string, unknown>>; viewport: unknown } }>(
      `
        SELECT graph_json
        FROM flow_drafts
        WHERE tenant_id = $1::uuid
          AND flow_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [workflowRun.tenant_id, runtimeFlow.flow_id],
    );
    const graph = draft.rows[0]?.graph_json;
    if (!graph || !Array.isArray(graph.nodes)) {
      return;
    }

    let changed = false;
    const nodes = graph.nodes.map((node) => {
      if (node.id !== currentNode.id || !isPlainObject(node.data)) {
        return node;
      }
      changed = true;
      return {
        ...node,
        data: {
          ...node.data,
          ...patch,
          updatedAt: Date.now(),
        },
      };
    });

    if (!changed) {
      return;
    }

    await client.query(
      `
        UPDATE flow_drafts
        SET
          graph_json = $3::jsonb,
          revision = revision + 1,
          updated_at = now()
        WHERE tenant_id = $1::uuid
          AND flow_id = $2::uuid
      `,
      [
        workflowRun.tenant_id,
        runtimeFlow.flow_id,
        JSON.stringify({
          ...graph,
          nodes,
        }),
      ],
    );
  }

  private getDependencyOutputs(
    node: CompiledWorkflowNode,
    nodeRuns: NodeRunRecord[],
    runtimeFlow: RuntimeFlowRecord,
  ): Array<Record<string, unknown> | null> {
    return getDependencyOutputsFromRuntimeGraph(node, nodeRuns, runtimeFlow);
  }

  private async hydrateInputAssetUrls(
    tenantId: string,
    inputAssets: AssetReferenceInput[],
  ): Promise<void> {
    await this.hydrateTemporaryReferenceUploads(tenantId, inputAssets);
    const missingUrlAssets = inputAssets.filter((asset) => {
      const metadata = isPlainObject(asset.metadata) ? asset.metadata : {};
      return asset.assetId && !metadata.referenceUploadId && !metadata.url && !metadata.signedUrl && !metadata.publicUrl;
    });
    if (missingUrlAssets.length === 0) {
      return;
    }

    const assetIds = Array.from(new Set(missingUrlAssets.map((asset) => asset.assetId)));
    const lookups = await withTenantTransaction(
      { tenantId, userId: null },
      async (client) => this.loadAssetStorageLookups(client, tenantId, assetIds),
      this.pool,
    );

    for (const asset of missingUrlAssets) {
      const lookup = lookups.get(asset.assetId);
      if (!lookup) {
        continue;
      }
      const signed = await this.assetStore.storageProvider.createPresignedGetUrl({
        bucket: lookup.bucket,
        expiresInSeconds: 15 * 60,
        key: lookup.objectKey,
        responseContentType: lookup.mimeType,
      });
      asset.kind = asset.kind ?? lookup.kind;
      asset.mimeType = asset.mimeType ?? lookup.mimeType;
      asset.width = asset.width ?? lookup.width ?? null;
      asset.height = asset.height ?? lookup.height ?? null;
      asset.durationMs = asset.durationMs ?? lookup.durationMs ?? null;
      asset.metadata = {
        ...(isPlainObject(asset.metadata) ? asset.metadata : {}),
        bucket: lookup.bucket,
        objectKey: lookup.objectKey,
        signedUrl: signed.url,
        url: signed.url,
      };
    }
  }

  private async hydrateTemporaryReferenceUploads(
    tenantId: string,
    inputAssets: AssetReferenceInput[],
  ): Promise<void> {
    const referenceUploadIds = Array.from(new Set(inputAssets
      .map((asset) => {
        const metadata = isPlainObject(asset.metadata) ? asset.metadata : {};
        return typeof metadata.referenceUploadId === "string" && metadata.referenceUploadId.trim()
          ? metadata.referenceUploadId.trim()
          : "";
      })
      .filter(Boolean)));
    if (referenceUploadIds.length === 0) {
      return;
    }

    const uploads = await withTenantTransaction(
      { tenantId, userId: null },
      async (client) => this.loadTemporaryReferenceUploads(client, tenantId, referenceUploadIds),
      this.pool,
    );

    for (const asset of inputAssets) {
      const metadata = isPlainObject(asset.metadata) ? asset.metadata : {};
      const referenceUploadId = typeof metadata.referenceUploadId === "string" ? metadata.referenceUploadId.trim() : "";
      if (!referenceUploadId) continue;
      const upload = uploads.get(referenceUploadId);
      if (!upload) continue;
      const dataUrl = `data:${upload.mimeType};base64,${upload.bytesBase64}`;
      asset.kind = asset.kind ?? "image";
      asset.mimeType = asset.mimeType ?? upload.mimeType;
      asset.width = asset.width ?? upload.width ?? null;
      asset.height = asset.height ?? upload.height ?? null;
      asset.metadata = {
        ...metadata,
        base64: dataUrl,
        originalFilename: upload.originalFilename,
        source: metadata.source ?? "temporary-reference-upload",
        url: dataUrl,
      };
    }
  }

  private async loadTemporaryReferenceUploads(
    client: PoolClient,
    tenantId: string,
    referenceUploadIds: string[],
  ): Promise<Map<string, {
    bytesBase64: string;
    height: number | null;
    id: string;
    mimeType: string;
    originalFilename: string | null;
    width: number | null;
  }>> {
    if (referenceUploadIds.length === 0) {
      return new Map();
    }

    const result = await client.query<{
      bytes_base64: string;
      height: number | null;
      id: string;
      mime_type: string;
      original_filename: string | null;
      width: number | null;
    }>(
      `
        SELECT
          id::text AS id,
          original_filename,
          mime_type,
          width,
          height,
          encode(bytes, 'base64') AS bytes_base64
        FROM workbench_reference_uploads
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND status IN ('active', 'used')
          AND expires_at > now()
      `,
      [tenantId, referenceUploadIds],
    );

    return new Map(result.rows.map((row) => [
      row.id,
      {
        bytesBase64: row.bytes_base64,
        height: row.height,
        id: row.id,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        width: row.width,
      },
    ]));
  }

  private async loadAssetStorageLookups(
    client: PoolClient,
    tenantId: string,
    assetIds: string[],
  ): Promise<Map<string, AssetStorageLookup>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const result = await client.query<{
      bucket: string;
      duration_ms: number | null;
      height: number | null;
      id: string;
      kind: string;
      mime_type: string;
      object_key: string;
      width: number | null;
    }>(
      `
        SELECT
          id::text AS id,
          kind,
          mime_type,
          bucket,
          object_key,
          width,
          height,
          duration_ms
        FROM assets
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL
          AND status = 'available'
      `,
      [tenantId, assetIds],
    );

    return new Map(result.rows.map((row) => [
      row.id,
      {
        bucket: row.bucket,
        durationMs: row.duration_ms,
        height: row.height,
        kind: row.kind,
        mimeType: row.mime_type,
        objectKey: row.object_key,
        width: row.width,
      },
    ]));
  }

  private async loadVideoEditorRenderRouteCapability(
    client: PoolClient,
    tenantId: string,
    routeKey: string,
  ): Promise<VideoEditorRenderRouteCapability | null> {
    const result = await client.query<{
      request_config: Record<string, unknown>;
      route_key: string;
    }>(
      `
        SELECT
          route.route_key,
          COALESCE(route.request_config, '{}'::jsonb) AS request_config
        FROM ai_routes AS route
        JOIN ai_providers AS provider
          ON provider.id = route.provider_id
        LEFT JOIN ai_models AS model
          ON model.id = route.model_id
        WHERE route.status = 'active'
          AND route.modality = 'video'
          AND route.route_key = $1
          AND (route.tenant_id = $2::uuid OR route.tenant_id IS NULL)
          AND provider.status = 'active'
          AND (route.model_id IS NULL OR model.status = 'active')
        ORDER BY
          CASE WHEN route.tenant_id = $2::uuid THEN 0 ELSE 1 END ASC,
          route.updated_at DESC,
          route.id ASC
        LIMIT 1
      `,
      [routeKey, tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      renderEngine: readVideoEditorRenderEngine(row.request_config),
      routeKey: row.route_key,
    };
  }

  private async getRuntimeFlow(
    client: PoolClient,
    workflowRunId: string,
  ): Promise<RuntimeFlowRecord> {
    const result = await client.query<RuntimeFlowRecord>(
      `
        SELECT
          workflow_runs.id::text AS workflow_run_id,
          workflow_runs.flow_id::text AS flow_id,
          workflow_runs.flow_version_id::text AS flow_version_id,
          flows.project_id::text AS project_id,
          flow_versions.compiled_graph_json
        FROM workflow_runs
        JOIN flows
          ON flows.id = workflow_runs.flow_id
        JOIN flow_versions
          ON flow_versions.id = workflow_runs.flow_version_id
        WHERE workflow_runs.id = $1::uuid
        LIMIT 1
      `,
      [workflowRunId],
    );

    if (!result.rows[0]) {
      throw new Error(`Workflow run not found: ${workflowRunId}`);
    }

    return result.rows[0];
  }

  private async listNodeRuns(
    client: PoolClient,
    workflowRunId: string,
  ): Promise<NodeRunRecord[]> {
    const result = await client.query<NodeRunRecord>(
      `
        SELECT
          id::text AS id,
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
          finished_at::text AS finished_at
        FROM node_runs
        WHERE workflow_run_id = $1::uuid
        ORDER BY created_at ASC, id ASC
      `,
      [workflowRunId],
    );

    return result.rows;
  }

  private async lockWorkflowRun(
    client: PoolClient,
    workflowRunId: string,
  ): Promise<WorkflowRunRecord> {
    const result = await client.query<WorkflowRunRecord>(
      `
        SELECT
          workflow_runs.id::text AS id,
          workflow_runs.tenant_id::text AS tenant_id,
          workflow_runs.flow_id::text AS flow_id,
          workflow_runs.flow_version_id::text AS flow_version_id,
          workflow_runs.status,
          workflow_runs.input_json,
          workflow_runs.output_json,
          workflow_runs.error_json,
          workflow_runs.started_at::text AS started_at,
          flows.project_id::text AS project_id
        FROM workflow_runs
        JOIN flows
          ON flows.id = workflow_runs.flow_id
        WHERE workflow_runs.id = $1::uuid
        FOR UPDATE
      `,
      [workflowRunId],
    );

    if (!result.rows[0]) {
      throw new Error(`Workflow run not found: ${workflowRunId}`);
    }

    return result.rows[0];
  }

  private mapTextGenerationOutput(result: AiGatewayTextResult): Record<string, unknown> {
    return {
      modelKey: result.modelKey,
      providerKey: result.providerKey,
      text: result.outputText,
      usage: result.usage,
    };
  }

  private buildUsageIdempotencyKey(
    tenantId: string,
    workflowRunId: string,
    nodeRunId: string,
    modality: "image" | "text" | "video",
  ): string {
    return `usage:${tenantId}:${workflowRunId}:${nodeRunId}:${modality}`;
  }

  private buildUsageRecord(input: UsageRecordInput): UsageRecordInput {
    return input;
  }

  private getReservedCents(nodeRun: NodeRunRecord): number {
    const reserved = nodeRun.cost_json?.reservedCents;
    return typeof reserved === "number" && Number.isFinite(reserved) ? Math.max(0, reserved) : 0;
  }

  private getReserveLedgerId(nodeRun: NodeRunRecord): string | null {
    const reserveLedgerId = nodeRun.cost_json?.reserveLedgerId;
    return typeof reserveLedgerId === "string" && reserveLedgerId.trim() ? reserveLedgerId.trim() : null;
  }

  private async recordUsageForNode(
    client: PoolClient,
    tenantId: string,
    traceId: string | null,
    input: UsageRecordInput,
  ): Promise<AuditLogInput[]> {
    const usageEvent = await this.billingService.recordUsageEventWithClient(client, tenantId, {
      billableCents: input.billableCents,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      inputTokens: input.inputTokens,
      metadata: {
        ...(input.metadata ?? {}),
        modelKey: input.modelKey ?? null,
        nodeRunId: input.nodeRunId,
        routeKey: input.routeKey ?? null,
        workflowRunId: input.workflowRunId,
      },
      modality: input.modality,
      modelId: input.modelId ?? null,
      nodeRunId: input.nodeRunId,
      outputTokens: input.outputTokens,
      providerId: input.providerId ?? null,
      rawCost: input.rawCost ?? null,
      routeId: input.routeId ?? null,
      totalTokens: input.totalTokens,
      unitType: input.unitType ?? null,
      units: input.units ?? null,
      workflowRunId: input.workflowRunId,
    });

    const ledgerEntry = await this.billingService.settleUsageWithClient(client, tenantId, {
      amountCents: input.billableCents,
      description: `${input.eventType} settled`,
      idempotencyKey: `settle:${tenantId}:${input.workflowRunId}:${input.nodeRunId}`,
      metadata: {
        modality: input.modality,
        nodeRunId: input.nodeRunId,
          reserveLedgerId: input.reserveLedgerId ?? null,
          routeKey: input.routeKey ?? null,
          workflowRunId: input.workflowRunId,
        },
      reservedAmountCents: input.billableCents,
      usageEventId: usageEvent.id,
    });

    await client.query(
      `
        UPDATE node_runs
        SET cost_json = cost_json || $2::jsonb
        WHERE id = $1::uuid
      `,
      [
        input.nodeRunId,
        JSON.stringify({
          settledCents: input.billableCents,
          settleLedgerId: ledgerEntry.id,
          reserveStatus: "settled",
        }),
      ],
    );

    return [
      {
        action: "billing.usage.record",
        actorType: "system",
        actorUserId: null,
        metadata: {
          billableCents: usageEvent.billableCents,
          modality: usageEvent.modality,
          nodeRunId: usageEvent.nodeRunId,
          workflowRunId: usageEvent.workflowRunId,
        },
        resourceId: usageEvent.id,
        resourceType: "usage_event",
        tenantId,
        traceId,
      },
      {
        action: "billing.ledger.settle",
        actorType: "system",
        actorUserId: null,
        metadata: {
          amountCents: ledgerEntry.amountCents,
          entryType: ledgerEntry.entryType,
          usageEventId: ledgerEntry.usageEventId,
        },
        resourceId: ledgerEntry.id,
        resourceType: "billing_ledger",
        tenantId,
        traceId,
      },
    ];
  }

  private async markNodeSucceededAndUnlockDependents(
    client: PoolClient,
    currentNode: CompiledWorkflowNode,
    runtimeFlow: RuntimeFlowRecord,
    workflowRun: WorkflowRunRecord,
    currentNodeRun: NodeRunRecord,
    context: WorkflowExecutionContext,
    outputJson: Record<string, unknown>,
    usageRecord?: UsageRecordInput,
    logger?: WorkerLogger,
    deferredVariantJobs: DeferredVariantJob[] = [],
  ): Promise<{
    auditLogs: AuditLogInput[];
    deferredVariantJobs: DeferredVariantJob[];
    nodeEnqueuePayloads: NodeExecuteJobPayload[];
  }> {
    let auditLogs: AuditLogInput[] = [];
    if (usageRecord) {
      auditLogs = await this.recordUsageForNode(
        client,
        context.tenantId,
        context.traceId,
        usageRecord,
      );
      logger?.info(
        {
          nodeRunId: currentNodeRun.id,
          settled_at: new Date().toISOString(),
          targetNodeId: currentNode.id,
          tenantId: context.tenantId,
          workflowRunId: workflowRun.id,
        },
        "workflow node billing settled",
      );
    }

    await client.query(
      `
        UPDATE node_runs
        SET
          status = 'succeeded',
          output_json = $2::jsonb,
          provider_task_id = NULL,
          error_json = NULL,
          finished_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [currentNodeRun.id, JSON.stringify(outputJson)],
    );

    await this.patchTargetNodeOutputIntoDraft(
      client,
      currentNode,
      runtimeFlow,
      workflowRun,
      currentNodeRun,
      outputJson,
    );
    logger?.info(
      {
        draft_patched_at: new Date().toISOString(),
        flowId: runtimeFlow.flow_id,
        nodeRunId: currentNodeRun.id,
        targetNodeId: currentNode.id,
        tenantId: context.tenantId,
        workflowRunId: workflowRun.id,
      },
      "workflow target node draft patch completed",
    );

    await this.appendWorkflowRunEvent(client, {
      eventType: "node.run.succeeded",
      nodeRunId: currentNodeRun.id,
      payload: {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        outputJson,
        status: "succeeded",
      },
      tenantId: context.tenantId,
      workflowRunId: workflowRun.id,
    });

    if (currentNode.type === "output") {
      await client.query(
        `
          UPDATE workflow_runs
          SET
            output_json = $2::jsonb,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [workflowRun.id, JSON.stringify(outputJson)],
      );
    }

    const enqueuePayloads = await this.enqueueReadyDependents(
      client,
      currentNode,
      runtimeFlow,
      workflowRun.id,
      context.tenantId,
      context.traceId,
    );
    await this.finalizeWorkflowRunIfComplete(client, workflowRun.id, context.tenantId);
    return {
      auditLogs,
      deferredVariantJobs,
      nodeEnqueuePayloads: enqueuePayloads,
    };
  }

  private async enqueueReadyDependents(
    client: PoolClient,
    currentNode: CompiledWorkflowNode,
    runtimeFlow: RuntimeFlowRecord,
    workflowRunId: string,
    tenantId: string,
    traceId: string | null,
  ): Promise<NodeExecuteJobPayload[]> {
    const enqueuePayloads: NodeExecuteJobPayload[] = [];
    const refreshedNodeRuns = await this.listNodeRuns(client, workflowRunId);

    for (const dependentId of currentNode.dependents) {
      const dependentRun = refreshedNodeRuns.find((row) => row.node_id === dependentId);
      const dependentNode = runtimeFlow.compiled_graph_json.nodes.find((row) => row.id === dependentId);
      if (!dependentRun || !dependentNode || dependentRun.status !== "pending") {
        continue;
      }

      if (this.areDependenciesSatisfied(dependentNode, refreshedNodeRuns)) {
        await client.query(
          `
            UPDATE node_runs
            SET status = 'runnable', updated_at = now()
            WHERE id = $1::uuid
              AND status = 'pending'
          `,
          [dependentRun.id],
        );
        await this.appendWorkflowRunEvent(client, {
          eventType: "node.run.runnable",
          nodeRunId: dependentRun.id,
          payload: {
            nodeId: dependentNode.id,
            nodeType: dependentNode.type,
            status: "runnable",
          },
          tenantId,
          workflowRunId,
        });

        enqueuePayloads.push({
          nodeRunId: dependentRun.id,
          nodeType: dependentNode.type,
          tenantId,
          traceId: traceId ?? undefined,
          workflowRunId,
        });
      }
    }

    return enqueuePayloads;
  }

  private async finalizeWorkflowRunIfComplete(
    client: PoolClient,
    workflowRunId: string,
    tenantId: string,
  ): Promise<void> {
    const finalNodeRuns = await this.listNodeRuns(client, workflowRunId);
    if (!finalNodeRuns.every((nodeRun) => nodeRun.status === "succeeded")) {
      return;
    }

    await client.query(
      `
        UPDATE workflow_runs
        SET
          status = 'succeeded',
          finished_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [workflowRunId],
    );
    await this.appendWorkflowRunEvent(client, {
      eventType: "workflow.run.succeeded",
      payload: {
        status: "succeeded",
      },
      tenantId,
      workflowRunId,
    });
  }

  private async failNodeAndWorkflow(
    client: PoolClient,
    workflowRunId: string,
    nodeRunId: string,
    tenantId: string,
    normalized: {
      code: string;
      details?: unknown;
      message: string;
    },
  ): Promise<void> {
    await this.refundOpenReservations(client, workflowRunId, tenantId);

    await client.query(
      `
        UPDATE node_runs
        SET
          status = 'failed',
          error_json = $2::jsonb,
          finished_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [nodeRunId, JSON.stringify(normalized)],
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
      eventType: "node.run.failed",
      nodeRunId,
      payload: normalized,
      tenantId,
      workflowRunId,
    });
    await this.appendWorkflowRunEvent(client, {
      eventType: "workflow.run.failed",
      payload: normalized,
      tenantId,
      workflowRunId,
    });
  }

  private async refundOpenReservations(
    client: PoolClient,
    workflowRunId: string,
    tenantId: string,
  ): Promise<void> {
    const result = await client.query<{
      id: string;
      node_id: string;
      cost_json: Record<string, unknown>;
    }>(
      `
        SELECT
          id::text AS id,
          node_id,
          cost_json
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

      const ledgerEntry = await this.billingService.refundUsageWithClient(client, tenantId, {
        amountCents: reservedCents,
        description: "Workflow node reservation released after failure",
        idempotencyKey: `refund:${tenantId}:${workflowRunId}:${row.id}`,
        metadata: {
          nodeId: row.node_id,
          nodeRunId: row.id,
          reserveLedgerId: typeof row.cost_json?.reserveLedgerId === "string" ? row.cost_json.reserveLedgerId : null,
          workflowRunId,
        },
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

  private async markNodeRunRunning(client: PoolClient, nodeRunId: string): Promise<void> {
    await client.query(
      `
        UPDATE node_runs
        SET
          status = 'running',
          attempt = attempt + 1,
          started_at = COALESCE(started_at, now()),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [nodeRunId],
    );
  }

  private async markWorkflowRunRunning(client: PoolClient, workflowRunId: string): Promise<void> {
    await client.query(
      `
        UPDATE workflow_runs
        SET
          status = CASE WHEN status = 'pending' THEN 'running' ELSE status END,
          started_at = COALESCE(started_at, now()),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [workflowRunId],
    );
  }
}
