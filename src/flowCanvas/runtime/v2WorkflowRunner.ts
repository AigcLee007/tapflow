import { getAssetVariantUrl } from '../../services/v2AssetsApi';
import { V2HttpError } from '../../services/v2HttpClient';
import { listRuntimeRoutes, type V2RuntimeRouteItem } from '../../services/v2AiRoutesApi';
import {
  createWorkflowRun,
  getWorkflowRun,
  listFlowWorkflowRuns,
  streamWorkflowRun,
  type CreateWorkflowRunInput,
  type GetWorkflowRunResponse,
  type V2NodeRunView,
  type V2WorkflowRunEventView,
  type V2WorkflowRunStatus,
  type WorkflowRunStreamHandle,
} from '../../services/v2WorkflowRunsApi';
import { getBillingSummary, listBillingPricing, type BillingPricingRow } from '../../billing/billingApi';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type {
  FlowImageGenerationMode,
  FlowImageGenerationSnapshot,
  FlowImageResultItem,
  FlowMultiImageDisplayMode,
  FlowNodeData,
  FlowProductionSubjectType,
  FlowRuntimeAssetRef,
  FlowRuntimeNodeOutput,
} from '../types';
import {
  buildImageViewerComparisonSourceFromReferenceKeys,
  readImageViewerComparisonSource,
} from '../utils/imageViewerComparison';
import { normalizeDirector3dData } from '../utils/director3dNodeData';
import { normalizeImageGenerationMode } from '../utils/imageGenerationModes';
import { resolveImageGenerationModeRunBlocker } from '../utils/imageGenerationModeSupport';
import { fitMediaNodeToShortSide } from '../utils/nodeSizing';
import { normalizeStoryboardData, patchStoryboardCell } from '../utils/storyboardNodeData';
import { normalizeVideoEditorData } from '../utils/videoEditorNodeData';
import { buildPanoramaMetadata, isPanoramaMetadata, mergePanoramaMetadata } from '../panorama/panoramaUtils';
import { flushRemoteDraftBeforeRun, shouldFlushRemoteDraftBeforeRun } from './remoteDraftSaveBarrier';

const RUNNER_ENABLED = String(import.meta.env.VITE_USE_V2_WORKFLOW_RUNNER ?? 'true').toLowerCase() !== 'false';

const activeStreamsByRunId = new Map<string, WorkflowRunStreamHandle>();
const disposedRunIds = new Set<string>();
const finalizingRunIds = new Set<string>();
const optimisticCreditReservationsByNodeId = new Map<string, number>();
let creditPreflightQueue: Promise<void> = Promise.resolve();
let runtimeRoutesCache: Promise<V2RuntimeRouteItem[]> | null = null;
let billingPricingCache: Promise<BillingPricingRow[]> | null = null;

type AssetLike = {
  assetId: string;
  durationMs?: number | null;
  kind: string;
  metadata?: Record<string, string> | null;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

type PersistableNodeRun = Pick<V2NodeRunView, 'errorJson' | 'id' | 'nodeId' | 'nodeType' | 'status' | 'outputJson' | 'workflowRunId'>;

type RunScope = {
  runMode: 'flow' | 'target_node';
  targetNodeId: string | null;
};

type CreditPreflightReservation = {
  amountCredits: number;
  nodeId: string;
};

type InsufficientCreditsDetails = {
  availableCredits: number;
  balanceCredits?: number;
  localReservedCredits: number;
  requiredCredits: number;
  reservedCredits?: number;
};

const DEFAULT_ROUTE_BY_NODE_KIND: Record<string, string> = {
  image: 'image.default',
  text: 'text.gpt-5-5',
  video: 'video.default',
};

const UNIT_BY_NODE_KIND: Record<string, string> = {
  image: 'image_generation',
  text: 'text_generation',
  video: 'video_generation',
};

function isTerminalStatus(status: V2WorkflowRunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function closeRunStream(runId: string): void {
  activeStreamsByRunId.get(runId)?.close();
  activeStreamsByRunId.delete(runId);
}

function closeAllStreams(): void {
  for (const runId of Array.from(activeStreamsByRunId.keys())) {
    closeRunStream(runId);
  }
}

function resolveRunScope(inputJson: Record<string, unknown> | null | undefined): RunScope {
  const runMode = inputJson?.runMode === 'target_node' ? 'target_node' : 'flow';
  const targetNodeId =
    typeof inputJson?.targetNodeId === 'string' && inputJson.targetNodeId.trim()
      ? inputJson.targetNodeId.trim()
      : null;
  return {
    runMode,
    targetNodeId,
  };
}

function filterNodeRunsForScope(nodeRuns: V2NodeRunView[], scope: RunScope): V2NodeRunView[] {
  if (scope.runMode !== 'target_node' || !scope.targetNodeId) {
    return nodeRuns;
  }
  return nodeRuns.filter((nodeRun) => nodeRun.nodeId === scope.targetNodeId);
}

function setRunError(message: string): void {
  useFlowCanvasStore.setState({
    isRunningBackendWorkflow: false,
    runError: message,
  });
}

function mergeNodeRuntimeOutput(nodeId: string, patch: Partial<FlowRuntimeNodeOutput>): void {
  const state = useFlowCanvasStore.getState();
  state.setNodeRuntimeOutput(nodeId, {
    ...state.nodeOutputByNodeId[nodeId],
    ...patch,
  });
}

function updateTargetNodeLaunchState(
  nodeId: string,
  status: string,
  extra: Partial<FlowNodeData> = {},
): void {
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    ...extra,
    workflowLaunchStatus: status,
    workflowLaunchUpdatedAt: Date.now(),
  } as Partial<FlowNodeData>);
}

function getOptimisticReservedCredits(): number {
  return Array.from(optimisticCreditReservationsByNodeId.values())
    .reduce((total, amount) => total + amount, 0);
}

function releaseOptimisticCreditReservation(nodeId: string | null | undefined): void {
  if (!nodeId) return;
  optimisticCreditReservationsByNodeId.delete(nodeId);
}

function getNodeKindForPricing(node: { data?: Partial<FlowNodeData>; type?: string }): 'image' | 'text' | 'video' | null {
  const rawKind = String(node.data?.kind || node.type || '').trim();
  if (rawKind === 'image' || rawKind === 'text' || rawKind === 'video') {
    return rawKind;
  }
  if (rawKind === 'image.generate') return 'image';
  if (rawKind === 'text.generate') return 'text';
  if (rawKind === 'video.generate') return 'video';
  return null;
}

function getRouteKeyForPricing(node: { data?: Partial<FlowNodeData>; type?: string }): string | null {
  const kind = getNodeKindForPricing(node);
  if (!kind) return null;
  const configuredRoute = typeof node.data?.routeKey === 'string' ? node.data.routeKey.trim() : '';
  return configuredRoute || DEFAULT_ROUTE_BY_NODE_KIND[kind] || null;
}

function getBillingAvailableCredits(summary: Awaited<ReturnType<typeof getBillingSummary>>): number {
  return Math.max(summary.availableCredits, 0);
}

function getBillingBalanceCredits(summary: Awaited<ReturnType<typeof getBillingSummary>>): number {
  return summary.balanceCredits;
}

function getBillingReservedCredits(summary: Awaited<ReturnType<typeof getBillingSummary>>): number {
  return summary.reservedCredits;
}

function getRuntimeRoutes(): Promise<V2RuntimeRouteItem[]> {
  runtimeRoutesCache ??= listRuntimeRoutes();
  return runtimeRoutesCache;
}

function getBillingPricingRows(): Promise<BillingPricingRow[]> {
  billingPricingCache ??= listBillingPricing();
  return billingPricingCache;
}

function resolveEstimatedCredits(input: {
  node: { data?: Partial<FlowNodeData>; type?: string };
  pricingRows: BillingPricingRow[];
  routes: V2RuntimeRouteItem[];
}): number | null {
  const kind = getNodeKindForPricing(input.node);
  if (!kind) return null;

  const unit = UNIT_BY_NODE_KIND[kind];
  const routeKey = getRouteKeyForPricing(input.node);
  if (!unit || !routeKey) return null;

  const route = input.routes.find((item) => item.modality === kind && item.routeKey === routeKey) ?? null;
  if (typeof route?.estimatedCredits === 'number' && route.estimatedCredits > 0) {
    return route.estimatedCredits;
  }
  if (typeof route?.minChargeCredits === 'number' && route.minChargeCredits > 0) {
    return route.minChargeCredits;
  }

  const provider = route?.providerKey ?? 'default';
  const model = route?.modelKey ?? 'default';
  const candidates = [
    { provider, model, route: routeKey },
    { provider, model, route: 'default' },
    { provider, model: 'default', route: 'default' },
    { provider: 'default', model: 'default', route: 'default' },
  ];

  for (const candidate of candidates) {
    const row = input.pricingRows.find((item) =>
      item.active &&
      item.unit === unit &&
      item.provider === candidate.provider &&
      item.model === candidate.model &&
      item.route === candidate.route);
    if (row && row.minChargeCredits > 0) {
      return row.minChargeCredits;
    }
  }

  return null;
}

function readImageGenerationModeForPreflight(node: { data?: Partial<FlowNodeData> }): FlowImageGenerationMode {
  const params = node.data?.params && typeof node.data.params === 'object'
    ? node.data.params as Record<string, unknown>
    : {};
  return normalizeImageGenerationMode(node.data?.generationMode || params.generationMode);
}

function isProductionImageGenerationMode(mode: FlowImageGenerationMode): boolean {
  return mode !== 'standard';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasVideoEditorExportMetadata(node: { data?: Partial<FlowNodeData>; type?: string }): boolean {
  if (getNodeKindForPricing(node) !== 'video') {
    return false;
  }
  const params = isRecord(node.data?.params) ? node.data.params : {};
  return isRecord(params.videoEditor);
}

function resolveVideoEditorExportRunBlocker(input: {
  route: V2RuntimeRouteItem | null;
  routeKey: string | null;
}): { code: 'UNSUPPORTED_VIDEO_EDITOR_EXPORT'; message: string } | null {
  const supportedWorkflows = Array.isArray(input.route?.capabilities?.supportedVideoWorkflows)
    ? input.route.capabilities.supportedVideoWorkflows
    : [];
  if (supportedWorkflows.includes('video_editor_export')) {
    return null;
  }
  const routeKey = input.routeKey || input.route?.routeKey || 'unknown';
  return {
    code: 'UNSUPPORTED_VIDEO_EDITOR_EXPORT',
    message: `UNSUPPORTED_VIDEO_EDITOR_EXPORT: Route ${routeKey} does not support video editor export.`,
  };
}

function markNodeBlockedByPreflight(
  nodeId: string,
  code: 'PRICING_NOT_FOUND' | 'UNSUPPORTED_GENERATION_MODE' | 'UNSUPPORTED_VIDEO_EDITOR_EXPORT',
  message: string,
): void {
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    errorCode: code,
    errorMessage: message,
    generationStatus: 'error',
    status: 'failed',
  } as Partial<FlowNodeData>);
  mergeNodeRuntimeOutput(nodeId, { errorMessage: message });
  useFlowCanvasStore.setState((currentState) => ({
    nodeRunStatusByNodeId: {
      ...currentState.nodeRunStatusByNodeId,
      [nodeId]: 'failed',
    },
    runError: message,
    runStatus: 'failed',
  }));
}

function formatCredits(value: number): string {
  return `${Math.max(0, Math.floor(value))} pts`;
}

function buildInsufficientCreditsMessage(details: InsufficientCreditsDetails): string {
  const remaining = Math.max(details.availableCredits - details.localReservedCredits, 0);
  if (details.localReservedCredits > 0) {
    return `余额不足：当前可用 ${formatCredits(details.availableCredits)}，已开始任务占用 ${formatCredits(details.localReservedCredits)}，剩余 ${formatCredits(remaining)}，本次需要 ${formatCredits(details.requiredCredits)}。请充值或兑换点数后继续生成。`;
  }
  return `余额不足：当前可用 ${formatCredits(details.availableCredits)}，本次需要 ${formatCredits(details.requiredCredits)}。请充值或兑换点数后重试。`;
}

function readNumberDetail(details: unknown, key: string): number | null {
  if (!details || typeof details !== 'object') return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isInsufficientCreditsError(error: unknown): boolean {
  if (error instanceof V2HttpError) {
    return error.code === 'INSUFFICIENT_CREDITS'
      || error.code === 'INSUFFICIENT_BALANCE'
      || /insufficient balance/i.test(error.message);
  }
  return error instanceof Error && /insufficient balance/i.test(error.message);
}

function buildInsufficientCreditsMessageFromError(error: V2HttpError): string {
  const requiredCredits = readNumberDetail(error.details, 'requiredCredits') ?? 0;
  const availableCredits = readNumberDetail(error.details, 'availableCredits') ?? 0;
  const reservedCredits = readNumberDetail(error.details, 'reservedCredits') ?? undefined;
  return buildInsufficientCreditsMessage({
    availableCredits,
    localReservedCredits: 0,
    requiredCredits,
    reservedCredits,
  });
}

function markNodeBlockedByCredits(nodeId: string, message: string): void {
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    errorCode: 'INSUFFICIENT_CREDITS',
    errorMessage: message,
    generationStatus: 'error',
    status: 'failed',
  } as Partial<FlowNodeData>);
  mergeNodeRuntimeOutput(nodeId, { errorMessage: message });
  useFlowCanvasStore.setState((currentState) => ({
    nodeRunStatusByNodeId: {
      ...currentState.nodeRunStatusByNodeId,
      [nodeId]: 'failed',
    },
    runError: message,
  }));
}

async function reserveCreditsForTargetNode(nodeId: string): Promise<CreditPreflightReservation | null> {
  const run = async () => {
    const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    if (!node) return null;

    const [summary, routes, pricingRows] = await Promise.all([
      getBillingSummary(),
      getRuntimeRoutes(),
      getBillingPricingRows(),
    ]);
    const estimatedCredits = resolveEstimatedCredits({ node, pricingRows, routes });
    const kind = getNodeKindForPricing(node);
    const routeKey = getRouteKeyForPricing(node);
    const route = routeKey
      ? routes.find((item) => item.modality === kind && item.routeKey === routeKey) ?? null
      : null;
    const generationMode = kind === 'image' ? readImageGenerationModeForPreflight(node) : 'standard';
    if (kind === 'image' && isProductionImageGenerationMode(generationMode)) {
      const blocker = resolveImageGenerationModeRunBlocker({
        mode: generationMode,
        route: route
          ? {
              estimatedCredits,
              minChargeCredits: route.minChargeCredits,
              routeKey: route.routeKey,
              supportedGenerationModes: route.capabilities?.supportedGenerationModes as FlowImageGenerationMode[] | undefined,
            }
          : null,
      });
      if (blocker) {
        markNodeBlockedByPreflight(nodeId, blocker.code, blocker.message);
        throw buildRunLaunchError(blocker.message);
      }
      if (!estimatedCredits || estimatedCredits <= 0) {
        const message = `PRICING_NOT_FOUND: Route ${routeKey || 'unknown'} has no active pricing for ${generationMode}.`;
        markNodeBlockedByPreflight(nodeId, 'PRICING_NOT_FOUND', message);
        throw buildRunLaunchError(message);
      }
    }
    if (kind === 'video' && hasVideoEditorExportMetadata(node)) {
      const blocker = resolveVideoEditorExportRunBlocker({
        route,
        routeKey,
      });
      if (blocker) {
        markNodeBlockedByPreflight(nodeId, blocker.code, blocker.message);
        throw buildRunLaunchError(blocker.message);
      }
    }
    if (!estimatedCredits || estimatedCredits <= 0) {
      return null;
    }

    const availableCredits = getBillingAvailableCredits(summary);
    const balanceCredits = getBillingBalanceCredits(summary);
    const reservedCredits = getBillingReservedCredits(summary);
    const localReservedCredits = getOptimisticReservedCredits();
    const effectiveAvailable = Math.max(availableCredits - localReservedCredits, 0);
    if (effectiveAvailable < estimatedCredits) {
      const message = buildInsufficientCreditsMessage({
        availableCredits,
        balanceCredits,
        localReservedCredits,
        requiredCredits: estimatedCredits,
        reservedCredits,
      });
      markNodeBlockedByCredits(nodeId, message);
      throw buildRunLaunchError(message);
    }

    optimisticCreditReservationsByNodeId.set(nodeId, estimatedCredits);
    return {
      amountCredits: estimatedCredits,
      nodeId,
    };
  };

  const result = creditPreflightQueue.then(run, run);
  creditPreflightQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isAssetLike(value: unknown): value is AssetLike {
  return typeof value === 'object' && value !== null
    && typeof (value as AssetLike).assetId === 'string'
    && typeof (value as AssetLike).kind === 'string'
    && typeof (value as AssetLike).mimeType === 'string';
}

function mapNodeRunStatusToNodeStatus(status: V2WorkflowRunStatus): string {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'canceled') return 'cancelled';
  return status;
}

function buildNodeOutput(outputJson: Record<string, unknown> | null, assetRefs: FlowRuntimeAssetRef[]): FlowRuntimeNodeOutput {
  const text = typeof outputJson?.text === 'string'
    ? outputJson.text
    : Array.isArray(outputJson?.results) && typeof outputJson.results[0] === 'string'
      ? String(outputJson.results[0])
      : null;

  const providerTask =
    outputJson?.providerTask && typeof outputJson.providerTask === 'object'
      ? (outputJson.providerTask as Record<string, unknown>)
      : null;

  return {
    assets: assetRefs,
    output: outputJson,
    providerTask,
    text,
  };
}

function shouldApplyNodeRun(nodeRun: PersistableNodeRun): boolean {
  const latestRunId = useFlowCanvasStore.getState().workflowRunIdByNodeId[nodeRun.nodeId];
  return !latestRunId || latestRunId === nodeRun.workflowRunId;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const ERROR_DETAIL_REDACT_KEYS = new Set([
  'api_key',
  'apikey',
  'authorization',
  'credential',
  'password',
  'secret',
  'token',
]);

function redactErrorDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactErrorDetailValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return [
      key,
      ERROR_DETAIL_REDACT_KEYS.has(normalizedKey) ? '[redacted]' : redactErrorDetailValue(item),
    ];
  }));
}

function formatProviderErrorDetails(details: unknown): string {
  if (typeof details === 'string') {
    return details.trim();
  }
  if (details == null) {
    return '';
  }
  try {
    const serialized = JSON.stringify(redactErrorDetailValue(details));
    return serialized && serialized !== '{}' ? serialized : '';
  } catch {
    return String(details || '').trim();
  }
}

function buildNodeFailureMessageFromErrorJson(
  errorJson: Record<string, unknown> | null | undefined,
  fallbackMessage = '节点生成失败，请稍后重试。',
): string {
  const mappedTextImageMessage = getTextImageErrorMessage(errorJson?.code);
  const message = mappedTextImageMessage ?? (typeof errorJson?.message === 'string' && errorJson.message.trim()
    ? errorJson.message.trim()
    : fallbackMessage);
  const details = formatProviderErrorDetails(errorJson?.details);
  if (!details) {
    return message;
  }
  return `${message}\nproviderDetails=${details.slice(0, 500)}`;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value)
    .map(([key, itemValue]) => [key, readString(itemValue)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.floor(numeric)) : undefined;
}

function countReferenceImages(data: Partial<FlowNodeData>): number {
  if (Array.isArray(data.referenceOrder)) {
    return data.referenceOrder.length;
  }
  if (Array.isArray(data.referenceAssetItemIds)) {
    return data.referenceAssetItemIds.length;
  }
  return 0;
}

function buildGeneratedResults(assetRefs: FlowRuntimeAssetRef[], generatedAt: number): FlowImageResultItem[] {
  return assetRefs
    .filter((asset) => asset.assetId && asset.downloadUrl)
    .map((asset) => ({
      assetId: asset.assetId,
      createdAt: generatedAt,
      id: `asset:${asset.assetId}`,
      url: String(asset.downloadUrl),
    }));
}

function buildPanoramaNodeMetadata(
  currentData: Partial<FlowNodeData>,
  primaryAsset: FlowRuntimeAssetRef | undefined,
): Record<string, string> | undefined {
  const currentMetadata = readStringRecord(currentData.metadata);
  const currentParams = isRecord(currentData.params) ? currentData.params : {};
  const panoramaParams = isRecord(currentParams.panorama) ? currentParams.panorama : {};
  const snapshot = isRecord(currentData.lastGenerationSnapshot) ? currentData.lastGenerationSnapshot : {};
  const assetMetadata = readStringRecord(primaryAsset?.metadata);
  const fallbackMetadata = buildPanoramaMetadata({
    aspectRatio:
      assetMetadata?.aspectRatio
      || currentMetadata?.aspectRatio
      || readString(currentParams.aspectRatio)
      || readString(currentParams.aspect_ratio)
      || readString(snapshot.aspectRatio),
    generationMode:
      assetMetadata?.generationMode
      || currentMetadata?.generationMode
      || readString(currentData.generationMode)
      || readString(currentParams.generationMode)
      || readString(snapshot.generationMode),
    projection:
      assetMetadata?.projection
      || currentMetadata?.projection
      || readString(panoramaParams.projectionHint),
  });

  if (!assetMetadata && !fallbackMetadata && !isPanoramaMetadata(currentMetadata)) {
    return undefined;
  }

  return mergePanoramaMetadata(
    isPanoramaMetadata(currentMetadata) ? currentMetadata : undefined,
    assetMetadata || fallbackMetadata,
  );
}

function buildImageGenerationSnapshot(
  nodeData: Partial<FlowNodeData>,
  assetRefs: FlowRuntimeAssetRef[],
  generatedAt: number,
): FlowImageGenerationSnapshot {
  const params = nodeData.params && typeof nodeData.params === 'object'
    ? nodeData.params as Record<string, unknown>
    : {};
  const fallbackPrompt = typeof nodeData.lastGenerationSnapshot === 'object'
    ? readString((nodeData.lastGenerationSnapshot as Partial<FlowImageGenerationSnapshot>).prompt)
    : undefined;
  const prompt = readString(nodeData.generationPrompt)
    || fallbackPrompt
    || '一张精美的 AI 生成图片';
  const modelId = readString(nodeData.modelId)
    || (typeof nodeData.lastGenerationSnapshot === 'object'
      ? readString((nodeData.lastGenerationSnapshot as Partial<FlowImageGenerationSnapshot>).modelId)
      : undefined)
    || '';
  const referenceComparison =
    readImageViewerComparisonSource(nodeData.generationReferenceComparison)
    || buildImageViewerComparisonSourceFromReferenceKeys({
      referenceAssetItemIds: nodeData.referenceAssetItemIds,
      referenceOrder: nodeData.referenceOrder,
    });
  const generationMode = readString(nodeData.generationMode) || readString(params.generationMode);
  const panorama = params.panorama && typeof params.panorama === 'object'
    ? params.panorama as Record<string, unknown>
    : null;
  const wraparound = params.wraparound && typeof params.wraparound === 'object'
    ? params.wraparound as Record<string, unknown>
    : null;
  const productionSubjectType =
    readString(wraparound?.subjectType)
    || readString(panorama?.subjectType);

  return {
    activeCommandId: readString(nodeData.activeCommandId),
    aspectRatio: readString(params.aspect_ratio) || readString(params.aspectRatio) || readString(nodeData.aspectRatio),
    generatedAt,
    ...(generationMode ? { generationMode: generationMode as FlowImageGenerationMode } : {}),
    modelId,
    n: readPositiveInteger(nodeData.batchCount) || readPositiveInteger(params.n) || assetRefs.length || 1,
    ...(productionSubjectType === 'scene' || productionSubjectType === 'subject'
      ? { productionSubjectType: productionSubjectType as FlowProductionSubjectType }
      : {}),
    prompt,
    quality: readString(params.quality),
    ...(referenceComparison ? { referenceComparison } : {}),
    referenceImageCount: countReferenceImages(nodeData),
    routeId: readString(nodeData.routeId) || readString(nodeData.routeKey),
    size: readString(params.size) || readString(params.imageSize) || readString(params.image_size),
  };
}

function buildGeneratedMediaSizePatch(
  asset: Pick<FlowRuntimeAssetRef, 'height' | 'width'>,
): Pick<FlowNodeData, 'aspectRatio' | 'height' | 'naturalHeight' | 'naturalWidth' | 'width'> | null {
  const naturalWidth = typeof asset.width === 'number' && Number.isFinite(asset.width) && asset.width > 0
    ? asset.width
    : null;
  const naturalHeight = typeof asset.height === 'number' && Number.isFinite(asset.height) && asset.height > 0
    ? asset.height
    : null;
  if (!naturalWidth || !naturalHeight) {
    return null;
  }
  const fitted = fitMediaNodeToShortSide(naturalWidth, naturalHeight);
  return {
    aspectRatio: naturalWidth / naturalHeight,
    height: fitted.height,
    naturalHeight,
    naturalWidth,
    width: fitted.width,
  };
}

function buildGeneratedAssetNodePatch(
  nodeRun: PersistableNodeRun,
  assetRefs: FlowRuntimeAssetRef[],
): Partial<FlowNodeData> | null {
  if (nodeRun.status !== 'succeeded' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return null;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId) {
    return null;
  }
  const isImageNode = nodeRun.nodeType === 'image.generate';
  const isVideoNode = nodeRun.nodeType === 'video.generate';
  if (!isImageNode && !isVideoNode) {
    return null;
  }
  const currentNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeRun.nodeId);
  const currentData = currentNode?.data ?? {};
  const generatedAt = Date.now();
  const generatedResults = isImageNode ? buildGeneratedResults(assetRefs, generatedAt) : [];
  const mediaSizePatch = buildGeneratedMediaSizePatch(primaryAsset);
  const panoramaMetadata = isImageNode ? buildPanoramaNodeMetadata(currentData, primaryAsset) : undefined;

  return {
    ...(isImageNode && generatedResults.length > 0
      ? {
          activeResultIndex: 0,
          coverResultId: generatedResults[0]?.id,
          generatedResults,
          lastGenerationSnapshot: buildImageGenerationSnapshot(currentData, assetRefs, generatedAt),
          latestMultiImageDelivery: 'combined' as FlowMultiImageDisplayMode,
          thumbnailUrl: generatedResults[0]?.url,
        }
      : {}),
    ...(isImageNode && panoramaMetadata ? { metadata: panoramaMetadata } : {}),
    assetId: primaryAsset.assetId,
    assetIds: assetRefs.map((asset) => asset.assetId),
    ...(typeof primaryAsset.durationMs === 'number' && Number.isFinite(primaryAsset.durationMs) && primaryAsset.durationMs >= 0
      ? { durationMs: primaryAsset.durationMs }
      : {}),
    errorMessage: undefined,
    generationStatus: 'done',
    latestNodeRunId: nodeRun.id,
    latestWorkflowRunId: nodeRun.workflowRunId,
    mimeType: primaryAsset.mimeType,
    ...(mediaSizePatch ?? {
      naturalHeight: primaryAsset.height ?? undefined,
      naturalWidth: primaryAsset.width ?? undefined,
    }),
    progress: 100,
    source: 'generated',
    status: 'success',
    workflowLaunchStatus: 'asset_visible',
    workflowLaunchUpdatedAt: Date.now(),
  };
}

function buildSplitModeParentNodePatch(
  nodeRun: PersistableNodeRun,
  assetRefs: FlowRuntimeAssetRef[],
): Partial<FlowNodeData> | null {
  if (nodeRun.status !== 'succeeded' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return null;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId || nodeRun.nodeType !== 'image.generate') {
    return null;
  }
  const currentNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeRun.nodeId);
  const currentData = currentNode?.data ?? {};
  const generatedAt = Date.now();
  const mediaSizePatch = buildGeneratedMediaSizePatch(primaryAsset);
  const panoramaMetadata = buildPanoramaNodeMetadata(currentData, primaryAsset);

  return {
    activeResultIndex: undefined,
    assetId: primaryAsset.assetId,
    assetIds: assetRefs.map((asset) => asset.assetId),
    coverResultId: undefined,
    errorMessage: undefined,
    favoriteResultIds: undefined,
    generatedResults: undefined,
    generationStatus: 'done',
    lastGenerationSnapshot: buildImageGenerationSnapshot(currentData, assetRefs, generatedAt),
    latestMultiImageDelivery: 'split_nodes',
    latestNodeRunId: nodeRun.id,
    latestWorkflowRunId: nodeRun.workflowRunId,
    ...(panoramaMetadata ? { metadata: panoramaMetadata } : {}),
    mimeType: primaryAsset.mimeType,
    ...(mediaSizePatch ?? {
      naturalHeight: primaryAsset.height ?? undefined,
      naturalWidth: primaryAsset.width ?? undefined,
    }),
    progress: 100,
    source: 'generated',
    status: 'success',
    thumbnailUrl: primaryAsset.downloadUrl,
    workflowLaunchStatus: 'asset_visible',
    workflowLaunchUpdatedAt: Date.now(),
  };
}

function getNodeRunErrorMessage(nodeRun: PersistableNodeRun): string {
  return `${buildNodeFailureMessageFromErrorJson(nodeRun.errorJson)}${buildTargetNodeFailureContext(nodeRun.nodeId)}`;
}

function buildFailedNodePatch(nodeRun: PersistableNodeRun): Partial<FlowNodeData> | null {
  if ((nodeRun.status !== 'failed' && nodeRun.status !== 'canceled') || !shouldApplyNodeRun(nodeRun)) {
    return null;
  }
  const isImageNode = nodeRun.nodeType === 'image.generate';
  const isVideoNode = nodeRun.nodeType === 'video.generate';
  if (!isImageNode && !isVideoNode) {
    return null;
  }

  return {
    errorMessage: nodeRun.status === 'failed' ? getNodeRunErrorMessage(nodeRun) : '生成已取消。',
    generationStatus: 'error',
    latestNodeRunId: nodeRun.id,
    latestWorkflowRunId: nodeRun.workflowRunId,
    progress: 0,
    status: 'failed',
  };
}

function buildSucceededTextNodePatch(nodeRun: PersistableNodeRun): Partial<FlowNodeData> | null {
  if (nodeRun.status !== 'succeeded' || !shouldApplyNodeRun(nodeRun) || nodeRun.nodeType !== 'text.generate') {
    return null;
  }

  return {
    errorMessage: undefined,
    generationStatus: 'done',
    latestNodeRunId: nodeRun.id,
    latestWorkflowRunId: nodeRun.workflowRunId,
    progress: 100,
    status: 'success',
  };
}

function syncStoryboardCellFromGeneratedAsset(nodeRun: PersistableNodeRun, assetRefs: FlowRuntimeAssetRef[]): void {
  if (nodeRun.status !== 'succeeded' || nodeRun.nodeType !== 'image.generate' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId) return;

  const store = useFlowCanvasStore.getState();
  const sourceNode = store.nodes.find((node) => node.id === nodeRun.nodeId);
  const storyboardRef = sourceNode?.data?.params?.storyboard;
  if (!storyboardRef || typeof storyboardRef !== 'object') return;

  const ref = storyboardRef as Record<string, unknown>;
  const sourceStoryboardNodeId = typeof ref.sourceStoryboardNodeId === 'string' ? ref.sourceStoryboardNodeId : '';
  const cellId = typeof ref.cellId === 'string' ? ref.cellId : '';
  if (!sourceStoryboardNodeId || !cellId) return;

  const storyboardNode = store.nodes.find((node) => node.id === sourceStoryboardNodeId && node.type === 'storyboard');
  const storyboard = storyboardNode?.data.storyboard;
  if (!storyboard) return;

  const cellIndex = storyboard.cells.findIndex((cell) => cell.id === cellId);
  if (cellIndex < 0) return;

  store.updateNodeData(sourceStoryboardNodeId, {
    storyboard: patchStoryboardCell(storyboard, cellIndex, {
      assetId: primaryAsset.assetId,
      sourceAssetId: primaryAsset.assetId,
      sourceNodeId: nodeRun.nodeId,
    }),
  });
}

function syncStoryboardSheetFromGeneratedAsset(nodeRun: PersistableNodeRun, assetRefs: FlowRuntimeAssetRef[]): void {
  if (nodeRun.status !== 'succeeded' || nodeRun.nodeType !== 'image.generate' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId) return;

  const store = useFlowCanvasStore.getState();
  const sourceNode = store.nodes.find((node) => node.id === nodeRun.nodeId);
  const storyboardSheetRef = sourceNode?.data?.params?.storyboardSheet;
  if (!storyboardSheetRef || typeof storyboardSheetRef !== 'object') return;

  const ref = storyboardSheetRef as Record<string, unknown>;
  const sourceStoryboardNodeId = typeof ref.sourceStoryboardNodeId === 'string' ? ref.sourceStoryboardNodeId : '';
  if (!sourceStoryboardNodeId) return;

  const storyboardNode = store.nodes.find((node) => node.id === sourceStoryboardNodeId && node.type === 'storyboard');
  if (!storyboardNode) return;

  store.updateNodeData(sourceStoryboardNodeId, {
    storyboard: {
      ...normalizeStoryboardData(storyboardNode.data.storyboard),
      composedAssetId: primaryAsset.assetId,
    },
  });
}

function syncDirectorShotFromGeneratedAsset(nodeRun: PersistableNodeRun, assetRefs: FlowRuntimeAssetRef[]): void {
  if (nodeRun.status !== 'succeeded' || nodeRun.nodeType !== 'image.generate' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId) return;

  const store = useFlowCanvasStore.getState();
  const sourceNode = store.nodes.find((node) => node.id === nodeRun.nodeId);
  const directorParams = isRecord(sourceNode?.data?.params) && isRecord(sourceNode.data.params.director3d)
    ? sourceNode.data.params.director3d
    : null;
  const sourceDirectorNodeId = readString(directorParams?.sourceDirectorNodeId);
  const shotId = readString(directorParams?.shotId);
  if (!sourceDirectorNodeId || !shotId) return;

  const directorNode = store.nodes.find((node) => node.id === sourceDirectorNodeId && node.type === 'director3d');
  if (!directorNode) return;
  const director = normalizeDirector3dData(directorNode.data.director3d);

  let didPatchShot = false;
  const shots = director.shots.map((shot) => {
    if (shot.id !== shotId) return shot;
    didPatchShot = true;
    return {
      ...shot,
      generatedAssetId: primaryAsset.assetId,
      generatedSourceNodeId: nodeRun.nodeId,
    };
  });
  if (!didPatchShot) return;

  store.updateNodeData(sourceDirectorNodeId, {
    director3d: {
      ...director,
      shots,
    },
  });
}

function syncVideoEditorExportedAsset(nodeRun: PersistableNodeRun, assetRefs: FlowRuntimeAssetRef[]): void {
  if (nodeRun.status !== 'succeeded' || nodeRun.nodeType !== 'video.generate' || assetRefs.length === 0 || !shouldApplyNodeRun(nodeRun)) {
    return;
  }
  const primaryAsset = assetRefs[0];
  if (!primaryAsset?.assetId) return;

  const store = useFlowCanvasStore.getState();
  const exportNode = store.nodes.find((node) => node.id === nodeRun.nodeId);
  const videoEditorParams = isRecord(exportNode?.data?.params) && isRecord(exportNode.data.params.videoEditor)
    ? exportNode.data.params.videoEditor
    : null;
  const sourceVideoEditorNodeId = readString(videoEditorParams?.sourceVideoEditorNodeId);
  if (!sourceVideoEditorNodeId) return;

  const sourceNode = store.nodes.find((node) => node.id === sourceVideoEditorNodeId && node.type === 'video_editor');
  if (!sourceNode) return;

  store.updateNodeData(sourceVideoEditorNodeId, {
    videoEditor: {
      ...normalizeVideoEditorData(sourceNode.data.videoEditor),
      exportedAssetId: primaryAsset.assetId,
    },
  });
}

function persistNodeOutputsFromRun(nodeRuns: PersistableNodeRun[], assetRefsByNodeId: Record<string, FlowRuntimeAssetRef[]>): void {
  const { addGeneratedImageChildren, ensurePanoramaViewerForImageNode, nodes, updateNodeData } = useFlowCanvasStore.getState();
  for (const nodeRun of nodeRuns) {
    const nodeAssets = assetRefsByNodeId[nodeRun.nodeId] ?? [];
    const currentNode = nodes.find((node) => node.id === nodeRun.nodeId);
    const displayMode = currentNode?.data.multiImageDisplayMode === 'split_nodes'
      ? 'split_nodes'
      : 'combined';
    const shouldSplitIntoChildNodes =
      nodeRun.nodeType === 'image.generate' &&
      displayMode === 'split_nodes' &&
      nodeAssets.length > 1;

    if (shouldSplitIntoChildNodes) {
      addGeneratedImageChildren(
        nodeRun.nodeId,
        nodeAssets.map((asset, index) => ({
          assetId: asset.assetId,
          downloadUrl: String(asset.downloadUrl || ''),
          height: asset.height ?? null,
          mimeType: asset.mimeType,
          title: `生成结果${index + 1}`,
          width: asset.width ?? null,
        })),
      );
    }

    const nodePatch = (
      shouldSplitIntoChildNodes
        ? buildSplitModeParentNodePatch(nodeRun, nodeAssets)
        : buildGeneratedAssetNodePatch(nodeRun, nodeAssets)
    ) ?? buildSucceededTextNodePatch(nodeRun) ?? buildFailedNodePatch(nodeRun);
    if (!nodePatch) {
      continue;
    }
    updateNodeData(nodeRun.nodeId, nodePatch);
    if (
      nodeRun.status === 'succeeded'
      && nodeRun.nodeType === 'image.generate'
      && (
        nodeAssets.some((asset) => isPanoramaMetadata(asset.metadata))
        || isPanoramaMetadata(nodePatch.metadata)
      )
    ) {
      ensurePanoramaViewerForImageNode(nodeRun.nodeId);
    }
    syncStoryboardCellFromGeneratedAsset(nodeRun, nodeAssets);
    syncStoryboardSheetFromGeneratedAsset(nodeRun, nodeAssets);
    syncDirectorShotFromGeneratedAsset(nodeRun, nodeAssets);
    syncVideoEditorExportedAsset(nodeRun, nodeAssets);
  }
}

async function resolveAssetRefs(outputJson: Record<string, unknown> | null): Promise<FlowRuntimeAssetRef[]> {
  const assets = Array.isArray(outputJson?.assets) ? outputJson.assets : [];
  const result = await Promise.all(
    assets
      .filter(isAssetLike)
      .map(async (asset) => {
        const download = await getAssetVariantUrl(asset.assetId, 'preview')
          .catch(() => getAssetVariantUrl(asset.assetId));
        return {
          assetId: asset.assetId,
          downloadUrl: download.url,
          durationMs: typeof asset.durationMs === 'number' && Number.isFinite(asset.durationMs) ? asset.durationMs : null,
          expiresAt: download.expiresAt,
          height: asset.height ?? null,
          kind: asset.kind,
          metadata: readStringRecord(asset.metadata),
          mimeType: asset.mimeType,
          width: asset.width ?? null,
        } satisfies FlowRuntimeAssetRef;
      }),
  );

  return result;
}

function resolveAssetRefsFromEventPayload(payload: Record<string, unknown>): FlowRuntimeAssetRef[] {
  const outputJson = payload.outputJson;
  const assets = outputJson && typeof outputJson === 'object' && Array.isArray((outputJson as { assets?: unknown }).assets)
    ? (outputJson as { assets: unknown[] }).assets
    : [];

  return assets
    .filter(isAssetLike)
    .map((asset) => ({
      assetId: asset.assetId,
      downloadUrl: typeof asset.downloadUrl === 'string' && asset.downloadUrl.trim()
        ? asset.downloadUrl
        : `/api/v2/assets/${asset.assetId}/bytes?variantKey=preview`,
      expiresAt: null,
      durationMs: typeof asset.durationMs === 'number' && Number.isFinite(asset.durationMs) ? asset.durationMs : null,
      height: asset.height ?? null,
      kind: asset.kind,
      metadata: readStringRecord(asset.metadata),
      mimeType: asset.mimeType,
      width: asset.width ?? null,
    }));
}

async function applyWorkflowRunSnapshot(snapshot: GetWorkflowRunResponse): Promise<void> {
  const scope = resolveRunScope(snapshot.workflowRun.inputJson);
  const scopedNodeRuns = filterNodeRunsForScope(snapshot.nodeRuns, scope);
  const nodeIdByNodeRunId: Record<string, string> = {};
  const nodeRunIdByNodeId: Record<string, string> = {};
  const nodeRunStatusByNodeId: Record<string, V2WorkflowRunStatus> = {};
  const nodeOutputByNodeId: Record<string, FlowRuntimeNodeOutput> = {};
  const workflowRunIdByNodeId: Record<string, string> = {};
  const assetRefsByNodeId: Record<string, FlowRuntimeAssetRef[]> = {};

  for (const nodeRun of scopedNodeRuns) {
    if (!shouldApplyNodeRun(nodeRun)) {
      continue;
    }
    if (isTerminalStatus(nodeRun.status)) {
      releaseOptimisticCreditReservation(nodeRun.nodeId);
    }
    nodeIdByNodeRunId[nodeRun.id] = nodeRun.nodeId;
    nodeRunIdByNodeId[nodeRun.nodeId] = nodeRun.id;
    nodeRunStatusByNodeId[nodeRun.nodeId] = nodeRun.status;
    workflowRunIdByNodeId[nodeRun.nodeId] = nodeRun.workflowRunId;
    const assets = await resolveAssetRefs(nodeRun.outputJson);
    assetRefsByNodeId[nodeRun.nodeId] = assets;
    nodeOutputByNodeId[nodeRun.nodeId] = buildNodeOutput(nodeRun.outputJson, assets);
  }

  useFlowCanvasStore.setState((state) => ({
    currentRunId: snapshot.workflowRun.id,
    isRunningBackendWorkflow:
      Object.values({
        ...state.nodeRunStatusByNodeId,
        ...nodeRunStatusByNodeId,
      }).some((status) => !isTerminalStatus(status)),
    nodeIdByNodeRunId: {
      ...state.nodeIdByNodeRunId,
      ...nodeIdByNodeRunId,
    },
    nodeRunIdByNodeId: {
      ...state.nodeRunIdByNodeId,
      ...nodeRunIdByNodeId,
    },
    nodeRunStatusByNodeId: {
      ...state.nodeRunStatusByNodeId,
      ...nodeRunStatusByNodeId,
    },
    workflowRunIdByNodeId: {
      ...state.workflowRunIdByNodeId,
      ...workflowRunIdByNodeId,
    },
    runError:
      snapshot.workflowRun.errorJson
        ? buildNodeFailureMessageFromErrorJson(snapshot.workflowRun.errorJson)
        : state.runError,
    runStatus: snapshot.workflowRun.status,
  }));

  useFlowCanvasStore.getState().setNodeRuntimeOutputs(nodeOutputByNodeId);

  persistNodeOutputsFromRun(scopedNodeRuns, assetRefsByNodeId);
}

function appendRunEvent(event: V2WorkflowRunEventView): void {
  useFlowCanvasStore.setState((state) => ({
    runEvents:
      state.runEvents.some((item) => item.sequence === event.sequence && item.id === event.id)
        ? state.runEvents
        : [...state.runEvents, event],
  }));
}

function deriveNodeId(event: V2WorkflowRunEventView): string | null {
  if (typeof event.payload.nodeId === 'string' && event.payload.nodeId.trim()) {
    return event.payload.nodeId;
  }

  const state = useFlowCanvasStore.getState();
  if (event.nodeRunId && state.nodeIdByNodeRunId[event.nodeRunId]) {
    return state.nodeIdByNodeRunId[event.nodeRunId];
  }

  return null;
}

function applyRunEvent(event: V2WorkflowRunEventView): void {
  appendRunEvent(event);

  const nodeId = deriveNodeId(event);
  const payloadStatus = typeof event.payload.status === 'string'
    ? event.payload.status as V2WorkflowRunStatus
    : null;

  if (nodeId) {
    const latestRunId = useFlowCanvasStore.getState().workflowRunIdByNodeId[nodeId];
    if (latestRunId && event.workflowRunId && latestRunId !== event.workflowRunId) {
      return;
    }
  }

  if (nodeId && payloadStatus) {
    if (isTerminalStatus(payloadStatus)) {
      releaseOptimisticCreditReservation(nodeId);
    }
    useFlowCanvasStore.setState((state) => ({
      nodeRunStatusByNodeId: {
        ...state.nodeRunStatusByNodeId,
        [nodeId]: payloadStatus,
      },
      workflowRunIdByNodeId: {
        ...state.workflowRunIdByNodeId,
        [nodeId]: event.workflowRunId,
      },
    }));
  }

  if (event.eventType === 'node.run.failed') {
    const message = `${buildNodeFailureMessageFromErrorJson(event.payload)}${nodeId ? buildTargetNodeFailureContext(nodeId) : ''}`;
    if (nodeId) {
      mergeNodeRuntimeOutput(nodeId, { errorMessage: message });
    }
    if (nodeId) {
      useFlowCanvasStore.getState().updateNodeData(nodeId, {
        errorMessage: message,
        generationStatus: 'error',
        progress: 0,
        status: 'failed',
      } as Partial<FlowNodeData>);
    }
  }

  if (event.eventType === 'node.run.succeeded' && nodeId) {
    const nodeType = typeof event.payload.nodeType === 'string' ? event.payload.nodeType : '';
    const isMediaNode = nodeType === 'image.generate' || nodeType === 'video.generate';
    if (isMediaNode) {
      const assetRefs = resolveAssetRefsFromEventPayload(event.payload);
      if (assetRefs.length > 0) {
        persistNodeOutputsFromRun([
          {
            attempt: 1,
            costJson: {},
            createdAt: event.createdAt,
            errorJson: null,
            finishedAt: event.createdAt,
            id: event.nodeRunId || `event-${event.id}`,
            inputJson: {},
            maxAttempts: 1,
            nodeId,
            nodeType,
            outputJson: null,
            providerTaskId: null,
            startedAt: event.createdAt,
            status: 'succeeded',
            tenantId: event.tenantId,
            updatedAt: event.createdAt,
            workflowRunId: event.workflowRunId,
          },
        ], {
          [nodeId]: assetRefs,
        });
      }
    }
  }

  if (event.eventType === 'workflow.run.failed') {
    useFlowCanvasStore.setState({
      runError: buildNodeFailureMessageFromErrorJson(event.payload),
      runStatus: 'failed',
    });
  } else if (event.eventType === 'workflow.run.canceled') {
    useFlowCanvasStore.setState({
      runStatus: 'canceled',
    });
  } else if (event.eventType === 'workflow.run.succeeded') {
    useFlowCanvasStore.setState({
      runStatus: 'succeeded',
    });
  }

  if (
    event.workflowRunId &&
    (
      event.eventType === 'workflow.run.failed' ||
      event.eventType === 'workflow.run.canceled' ||
      event.eventType === 'workflow.run.succeeded'
    )
  ) {
    void finalizeRun(event.workflowRunId);
  }
}

async function finalizeRun(runId: string): Promise<void> {
  if (disposedRunIds.has(runId)) {
    return;
  }
  if (finalizingRunIds.has(runId)) {
    return;
  }
  finalizingRunIds.add(runId);
  try {
    const snapshot = await getWorkflowRun(runId);
    if (disposedRunIds.has(runId)) {
      return;
    }
    await applyWorkflowRunSnapshot(snapshot);
    activeStreamsByRunId.delete(runId);
  } finally {
    finalizingRunIds.delete(runId);
  }
}

function buildRunLaunchError(message: string): Error {
  return new Error(message);
}

const TEXT_IMAGE_ERROR_MESSAGES: Record<string, string> = {
  TEXT_IMAGE_ASSET_NOT_FOUND: '图片素材不存在或无权访问',
  TEXT_IMAGE_INPUT_LIMIT_EXCEEDED: '当前模型最多支持 3 张图片',
  TEXT_IMAGE_SIZE_LIMIT_EXCEEDED: '单张图片不能超过 10 MB',
  TEXT_IMAGE_TYPE_UNSUPPORTED: '当前图片格式不受支持',
  TEXT_IMAGE_URL_HYDRATION_FAILED: '图片读取失败，请稍后重试',
  TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED: '当前文本模型线路不支持图片输入，请切换支持图片的线路',
};

function getTextImageErrorMessage(code: unknown): string | null {
  return typeof code === 'string' ? TEXT_IMAGE_ERROR_MESSAGES[code] ?? null : null;
}

export function getBackendRunLaunchErrorMessage(error: unknown): string {
  if (error instanceof V2HttpError && isInsufficientCreditsError(error)) {
    return buildInsufficientCreditsMessageFromError(error);
  }
  if (error && typeof error === 'object') {
    const code = typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code?: unknown }).code)
      : '';
    const message = typeof (error as { message?: unknown }).message === 'string'
      ? String((error as { message?: unknown }).message)
      : '';
    const textImageMessage = getTextImageErrorMessage(code);
    if (textImageMessage) {
      return textImageMessage;
    }
    if (code || message) {
      return `${code ? `${code}: ` : ''}${message || 'Failed to start backend workflow.'}`;
    }
  }
  if (error instanceof V2HttpError) {
    const textImageMessage = getTextImageErrorMessage(error.code);
    if (textImageMessage) {
      return textImageMessage;
    }
    const code = error.code ? `${error.code}: ` : '';
    return `${code}${error.message || 'Failed to start backend workflow.'}`;
  }
  if (error instanceof Error) {
    return error.message || 'Failed to start backend workflow.';
  }
  return 'Failed to start backend workflow.';
}

function buildTargetNodeFailureContext(nodeId: string): string {
  const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === nodeId);
  const data = node?.data;
  if (!data || node?.type !== 'image') return '';
  const params = data.params && typeof data.params === 'object'
    ? data.params as Record<string, unknown>
    : {};
  const generationMode = readString(data.generationMode) || readString(params.generationMode);
  if (generationMode !== 'panorama_360') return '';
  const routeKey = readString(data.routeKey) || 'unknown';
  const modelId = readString(data.modelId) || readString(params.modelId) || 'unknown';
  const size = readString(params.size) || readString(params.imageSize) || readString(params.image_size) || 'unknown';
  const aspectRatio = readString(params.aspectRatio) || readString(params.aspect_ratio) || 'unknown';
  return `\n全景参数：routeKey=${routeKey}, modelId=${modelId}, size=${size}, aspectRatio=${aspectRatio}`;
}

export function markBackendRunLaunchFailed(nodeId: string, error: unknown): void {
  const message = `${getBackendRunLaunchErrorMessage(error)}${buildTargetNodeFailureContext(nodeId)}`;
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    errorMessage: message,
    generationStatus: 'error',
    progress: 0,
    status: 'failed',
    workflowLaunchStatus: 'failed',
    workflowLaunchUpdatedAt: Date.now(),
  } as Partial<FlowNodeData>);
  mergeNodeRuntimeOutput(nodeId, { errorMessage: message });
  useFlowCanvasStore.setState((currentState) => ({
    isRunningBackendWorkflow: false,
    nodeRunStatusByNodeId: {
      ...currentState.nodeRunStatusByNodeId,
      [nodeId]: 'failed',
    },
    runError: message,
    runStatus: 'failed',
  }));
}

function assertTargetNodeRunCreated(snapshot: GetWorkflowRunResponse, targetNodeId: string): void {
  const scope = resolveRunScope(snapshot.workflowRun.inputJson);
  if (scope.runMode !== 'target_node' || scope.targetNodeId !== targetNodeId) {
    throw {
      code: 'TARGET_NODE_RUN_SCOPE_MISMATCH',
      message: `Workflow run ${snapshot.workflowRun.id} was created without the requested target node scope.`,
    };
  }
  const targetNodeRun = snapshot.nodeRuns.find((nodeRun) => nodeRun.nodeId === targetNodeId);
  if (!targetNodeRun) {
    throw {
      code: 'TARGET_NODE_RUN_MISSING',
      message: `Workflow run ${snapshot.workflowRun.id} did not create a node run for target node ${targetNodeId}.`,
    };
  }
}

function startRunStream(runId: string): void {
  if (activeStreamsByRunId.has(runId)) {
    return;
  }
  const handle = streamWorkflowRun(runId, {
    onClose: () => {
      void finalizeRun(runId);
    },
    onError: (error) => {
      setRunError(error.message || '工作流运行连接中断，请刷新后重试。');
    },
    onEvent: (event) => {
      applyRunEvent(event);
    },
  });
  activeStreamsByRunId.set(runId, handle);
}

export async function recoverFlowTargetNodeRuns(flowId: string): Promise<void> {
  if (!RUNNER_ENABLED) {
    return;
  }
  const snapshots = await listFlowWorkflowRuns(flowId, {
    limit: 50,
    runMode: 'target_node',
  });

  const recoveredNodeIds = new Set<string>();
  for (const snapshot of snapshots) {
    const scope = resolveRunScope(snapshot.workflowRun.inputJson);
    if (scope.runMode === 'target_node' && scope.targetNodeId) {
      if (recoveredNodeIds.has(scope.targetNodeId)) {
        continue;
      }
      recoveredNodeIds.add(scope.targetNodeId);
    }
    await applyWorkflowRunSnapshot(snapshot);
    if (!isTerminalStatus(snapshot.workflowRun.status)) {
      startRunStream(snapshot.workflowRun.id);
    }
  }
}

export async function runBackendWorkflow(options?: {
  runMode?: 'flow' | 'target_node';
  targetNodeId?: string;
}): Promise<void> {
  if (!RUNNER_ENABLED) {
    throw buildRunLaunchError('The v2 workflow runner is disabled in this environment.');
  }

  const state = useFlowCanvasStore.getState();
  if (!state.backendFlowId) {
    throw buildRunLaunchError('The current canvas is not bound to a v2 flowId, so backend workflow execution cannot start.');
  }

  const isTargetNodeRun = options?.runMode === 'target_node' && !!options.targetNodeId;
  let creditReservation: CreditPreflightReservation | null = null;

  try {
    if (!isTargetNodeRun) {
      closeAllStreams();
      useFlowCanvasStore.getState().resetBackendRunState();
    } else {
      creditReservation = await reserveCreditsForTargetNode(options.targetNodeId as string);
      useFlowCanvasStore.getState().updateNodeData(options.targetNodeId as string, {
        errorCode: undefined,
        errorMessage: undefined,
        generationStatus: 'generating',
        status: 'pending',
        workflowLaunchStatus: 'credit_reserved',
        workflowLaunchUpdatedAt: Date.now(),
      } as Partial<FlowNodeData>);
      mergeNodeRuntimeOutput(options.targetNodeId as string, { errorMessage: null });
      useFlowCanvasStore.setState((currentState) => ({
        currentRunId: null,
        isRunningBackendWorkflow: true,
        nodeRunStatusByNodeId: {
          ...currentState.nodeRunStatusByNodeId,
          [options.targetNodeId as string]: 'pending',
        },
        runError: null,
        runStatus: 'pending',
      }));
    }

    const shouldFlushDraft = shouldFlushRemoteDraftBeforeRun({ isTargetNodeRun });
    if (isTargetNodeRun && shouldFlushDraft) {
      updateTargetNodeLaunchState(options.targetNodeId as string, 'saving_draft');
    }
    if (shouldFlushDraft) {
      await flushRemoteDraftBeforeRun();
    }

    if (isTargetNodeRun) {
      updateTargetNodeLaunchState(options.targetNodeId as string, 'creating_run');
    }
    const request: CreateWorkflowRunInput = {
      idempotencyKey: `flow-canvas:${state.backendFlowId}:${options?.targetNodeId ?? 'flow'}:${Date.now()}`,
      input: {},
    };
    if (isTargetNodeRun) {
      request.runMode = 'target_node';
      request.targetNodeId = options.targetNodeId;
    }

    const created = await createWorkflowRun(state.backendFlowId, request);
    disposedRunIds.delete(created.runId);

    if (isTargetNodeRun) {
      updateTargetNodeLaunchState(options.targetNodeId as string, 'run_created', {
        latestWorkflowRunId: created.runId,
      });
    }
    useFlowCanvasStore.setState((currentState) => ({
      currentRunId: created.runId,
      runStatus: created.status,
      workflowRunIdByNodeId: isTargetNodeRun
        ? {
            ...currentState.workflowRunIdByNodeId,
            [options.targetNodeId as string]: created.runId,
          }
        : currentState.workflowRunIdByNodeId,
    }));

    const snapshot = await getWorkflowRun(created.runId);
    if (isTargetNodeRun) {
      assertTargetNodeRunCreated(snapshot, options.targetNodeId as string);
      updateTargetNodeLaunchState(options.targetNodeId as string, 'node_run_created');
    }
    await applyWorkflowRunSnapshot(snapshot);

    if (!isTerminalStatus(snapshot.workflowRun.status)) {
      if (isTargetNodeRun) {
        updateTargetNodeLaunchState(options.targetNodeId as string, 'worker_waiting');
      }
      startRunStream(created.runId);
    }
  } catch (error) {
    if (creditReservation) {
      releaseOptimisticCreditReservation(creditReservation.nodeId);
    }
    const message = getBackendRunLaunchErrorMessage(error);
    setRunError(message);
    if (isTargetNodeRun) {
      if (isInsufficientCreditsError(error)) {
        markNodeBlockedByCredits(options.targetNodeId as string, message);
      } else {
        markBackendRunLaunchFailed(options.targetNodeId as string, error);
      }
      useFlowCanvasStore.setState((currentState) => ({
        nodeRunStatusByNodeId: {
          ...currentState.nodeRunStatusByNodeId,
          [options.targetNodeId as string]: 'failed',
        },
      }));
    }
    throw error instanceof Error ? error : new Error(message);
  }
}

export function disposeBackendWorkflowRunStream(): void {
  for (const runId of activeStreamsByRunId.keys()) {
    disposedRunIds.add(runId);
  }
  closeAllStreams();
}

export function isBackendWorkflowRunnerEnabled(): boolean {
  return RUNNER_ENABLED;
}

export function getRuntimeNodeStatus(nodeId: string, fallbackStatus: string): string {
  const status = useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeId];
  return status ? mapNodeRunStatusToNodeStatus(status) : fallbackStatus;
}

export function resetCreditPreflightStateForTests(): void {
  optimisticCreditReservationsByNodeId.clear();
  creditPreflightQueue = Promise.resolve();
  runtimeRoutesCache = null;
  billingPricingCache = null;
  finalizingRunIds.clear();
}
