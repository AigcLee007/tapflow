import { getAssetDownloadUrl } from '../../services/v2AssetsApi';
import { V2HttpError } from '../../services/v2HttpClient';
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
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type {
  FlowNodeData,
  FlowRuntimeAssetRef,
  FlowRuntimeNodeOutput,
} from '../types';

const RUNNER_ENABLED = String(import.meta.env.VITE_USE_V2_WORKFLOW_RUNNER ?? 'true').toLowerCase() !== 'false';

const activeStreamsByRunId = new Map<string, WorkflowRunStreamHandle>();
const disposedRunIds = new Set<string>();

type AssetLike = {
  assetId: string;
  kind: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

type PersistableNodeRun = Pick<V2NodeRunView, 'id' | 'nodeId' | 'nodeType' | 'status' | 'outputJson' | 'workflowRunId'>;

type RunScope = {
  runMode: 'flow' | 'target_node';
  targetNodeId: string | null;
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

  return {
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

function persistNodeOutputsFromRun(nodeRuns: PersistableNodeRun[], assetRefsByNodeId: Record<string, FlowRuntimeAssetRef[]>): void {
  const { updateNodeData } = useFlowCanvasStore.getState();
  for (const nodeRun of nodeRuns) {
    const nodePatch = buildGeneratedAssetNodePatch(nodeRun, assetRefsByNodeId[nodeRun.nodeId] ?? []);
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
        const download = await getAssetDownloadUrl(asset.assetId);
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
    const message = typeof event.payload.message === 'string' ? event.payload.message : 'Node generation failed';
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
  }

  if (event.eventType === 'workflow.run.failed') {
    useFlowCanvasStore.setState({
      runError: typeof event.payload.message === 'string' ? event.payload.message : 'Workflow run failed',
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
}

async function finalizeRun(runId: string): Promise<void> {
  if (disposedRunIds.has(runId)) {
    return;
  }
  const snapshot = await getWorkflowRun(runId);
  if (disposedRunIds.has(runId)) {
    return;
  }
  await applyWorkflowRunSnapshot(snapshot);
  activeStreamsByRunId.delete(runId);
}

function buildRunLaunchError(message: string): Error {
  return new Error(message);
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
      setRunError(error.message || 'Workflow run stream failed');
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
  if (!isTargetNodeRun) {
    closeAllStreams();
    useFlowCanvasStore.getState().resetBackendRunState();
  } else {
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

  try {
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
    const message = error instanceof V2HttpError && error.code === 'INSUFFICIENT_BALANCE'
      ? 'Insufficient balance. Redeem or recharge credits before starting this workflow.'
      : error instanceof Error
        ? error.message
        : 'Failed to start backend workflow.';
    setRunError(message);
    if (isTargetNodeRun) {
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
