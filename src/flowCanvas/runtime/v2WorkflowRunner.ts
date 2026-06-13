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
  FlowImageGenerationSnapshot,
  FlowImageResultItem,
  FlowNodeData,
  FlowRuntimeAssetRef,
  FlowRuntimeNodeOutput,
} from '../types';
import { flushRemoteDraftBeforeRun } from './remoteDraftSaveBarrier';

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
  kind: string;
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
  text: 'text.default',
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
  if (typeof summary.availableCredits === 'number') {
    return Math.max(summary.availableCredits, 0);
  }
  return Math.max((summary.account?.balanceCents ?? 0) - (summary.account?.reservedCents ?? 0), 0);
}

function getBillingBalanceCredits(summary: Awaited<ReturnType<typeof getBillingSummary>>): number {
  return typeof summary.balanceCredits === 'number'
    ? summary.balanceCredits
    : summary.account?.balanceCents ?? 0;
}

function getBillingReservedCredits(summary: Awaited<ReturnType<typeof getBillingSummary>>): number {
  return typeof summary.reservedCredits === 'number'
    ? summary.reservedCredits
    : summary.account?.reservedCents ?? 0;
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
  useFlowCanvasStore.setState((currentState) => ({
    nodeRunStatusByNodeId: {
      ...currentState.nodeRunStatusByNodeId,
      [nodeId]: 'failed',
    },
    nodeOutputByNodeId: {
      ...currentState.nodeOutputByNodeId,
      [nodeId]: {
        ...currentState.nodeOutputByNodeId[nodeId],
        errorMessage: message,
      },
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
      createdAt: generatedAt,
      id: `asset:${asset.assetId}`,
      url: String(asset.downloadUrl),
    }));
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

  return {
    activeCommandId: readString(nodeData.activeCommandId),
    aspectRatio: readString(params.aspect_ratio) || readString(params.aspectRatio) || readString(nodeData.aspectRatio),
    generatedAt,
    modelId,
    n: readPositiveInteger(nodeData.batchCount) || readPositiveInteger(params.n) || assetRefs.length || 1,
    prompt,
    quality: readString(params.quality),
    referenceImageCount: countReferenceImages(nodeData),
    routeId: readString(nodeData.routeId) || readString(nodeData.routeKey),
    size: readString(params.size) || readString(params.imageSize) || readString(params.image_size),
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

  return {
    ...(isImageNode && generatedResults.length > 0
      ? {
          activeResultIndex: 0,
          coverResultId: generatedResults[0]?.id,
          generatedResults,
          lastGenerationSnapshot: buildImageGenerationSnapshot(currentData, assetRefs, generatedAt),
          thumbnailUrl: generatedResults[0]?.url,
        }
      : {}),
    ...(isVideoNode && primaryAsset.downloadUrl ? { posterUrl: primaryAsset.downloadUrl } : {}),
    assetId: primaryAsset.assetId,
    assetIds: assetRefs.map((asset) => asset.assetId),
    errorMessage: undefined,
    generationStatus: 'done',
    latestNodeRunId: nodeRun.id,
    latestWorkflowRunId: nodeRun.workflowRunId,
    mimeType: primaryAsset.mimeType,
    naturalHeight: primaryAsset.height ?? undefined,
    naturalWidth: primaryAsset.width ?? undefined,
    progress: 100,
    source: 'generated',
    status: 'success',
  };
}

function getNodeRunErrorMessage(nodeRun: PersistableNodeRun): string {
  const message = nodeRun.errorJson?.message;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : '节点生成失败，请稍后重试。';
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

function persistNodeOutputsFromRun(nodeRuns: PersistableNodeRun[], assetRefsByNodeId: Record<string, FlowRuntimeAssetRef[]>): void {
  const { updateNodeData } = useFlowCanvasStore.getState();
  for (const nodeRun of nodeRuns) {
    const nodePatch = buildGeneratedAssetNodePatch(nodeRun, assetRefsByNodeId[nodeRun.nodeId] ?? [])
      ?? buildFailedNodePatch(nodeRun);
    if (!nodePatch) {
      continue;
    }
    updateNodeData(nodeRun.nodeId, nodePatch);
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
          expiresAt: download.expiresAt,
          height: asset.height ?? null,
          kind: asset.kind,
          mimeType: asset.mimeType,
          width: asset.width ?? null,
        } satisfies FlowRuntimeAssetRef;
      }),
  );

  return result;
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
    nodeOutputByNodeId: {
      ...state.nodeOutputByNodeId,
      ...nodeOutputByNodeId,
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
      snapshot.workflowRun.errorJson && typeof snapshot.workflowRun.errorJson.message === 'string'
        ? snapshot.workflowRun.errorJson.message
        : state.runError,
    runStatus: snapshot.workflowRun.status,
  }));

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
    const message = typeof event.payload.message === 'string' ? event.payload.message : '节点生成失败，请稍后重试。';
    useFlowCanvasStore.setState((state) => ({
      nodeOutputByNodeId: nodeId
        ? {
            ...state.nodeOutputByNodeId,
            [nodeId]: {
              ...state.nodeOutputByNodeId[nodeId],
              errorMessage: message,
            },
          }
        : state.nodeOutputByNodeId,
    }));
    if (nodeId) {
      useFlowCanvasStore.getState().updateNodeData(nodeId, {
        errorMessage: message,
        generationStatus: 'error',
        progress: 0,
        status: 'failed',
      } as Partial<FlowNodeData>);
    }
  }

  if (event.eventType === 'workflow.run.failed') {
    useFlowCanvasStore.setState({
      runError: typeof event.payload.message === 'string' ? event.payload.message : '工作流运行失败，请稍后重试。',
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
    if (code || message) {
      return `${code ? `${code}: ` : ''}${message || 'Failed to start backend workflow.'}`;
    }
  }
  if (error instanceof V2HttpError) {
    const code = error.code ? `${error.code}: ` : '';
    return `${code}${error.message || 'Failed to start backend workflow.'}`;
  }
  if (error instanceof Error) {
    return error.message || 'Failed to start backend workflow.';
  }
  return 'Failed to start backend workflow.';
}

export function markBackendRunLaunchFailed(nodeId: string, error: unknown): void {
  const message = getBackendRunLaunchErrorMessage(error);
  useFlowCanvasStore.getState().updateNodeData(nodeId, {
    errorMessage: message,
    generationStatus: 'error',
    progress: 0,
    status: 'failed',
  } as Partial<FlowNodeData>);
  useFlowCanvasStore.setState((currentState) => ({
    isRunningBackendWorkflow: false,
    nodeRunStatusByNodeId: {
      ...currentState.nodeRunStatusByNodeId,
      [nodeId]: 'failed',
    },
    nodeOutputByNodeId: {
      ...currentState.nodeOutputByNodeId,
      [nodeId]: {
        ...currentState.nodeOutputByNodeId[nodeId],
        errorMessage: message,
      },
    },
    runError: message,
    runStatus: 'failed',
  }));
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
      } as Partial<FlowNodeData>);
      useFlowCanvasStore.setState((currentState) => ({
        currentRunId: null,
        isRunningBackendWorkflow: true,
        nodeRunStatusByNodeId: {
          ...currentState.nodeRunStatusByNodeId,
          [options.targetNodeId as string]: 'pending',
        },
        nodeOutputByNodeId: {
          ...currentState.nodeOutputByNodeId,
          [options.targetNodeId as string]: {
            ...currentState.nodeOutputByNodeId[options.targetNodeId as string],
            errorMessage: null,
          },
        },
        runError: null,
        runStatus: 'pending',
      }));
    }

    await flushRemoteDraftBeforeRun();

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
    await applyWorkflowRunSnapshot(snapshot);

    if (!isTerminalStatus(snapshot.workflowRun.status)) {
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
