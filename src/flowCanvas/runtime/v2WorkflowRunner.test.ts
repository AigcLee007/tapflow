import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import {
  disposeBackendWorkflowRunStream,
  markBackendRunLaunchFailed,
  recoverFlowTargetNodeRuns,
  resetCreditPreflightStateForTests,
  runBackendWorkflow,
} from './v2WorkflowRunner';
import {
  flushRemoteDraftBeforeRun,
  registerRemoteDraftSaveBarrier,
  resetRemoteDraftSaveBarrierStateForTests,
} from './remoteDraftSaveBarrier';
import { V2HttpError } from '../../services/v2HttpClient';

const createWorkflowRunMock = vi.fn();
const getWorkflowRunMock = vi.fn();
const listFlowWorkflowRunsMock = vi.fn();
const streamWorkflowRunMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();
const getBillingSummaryMock = vi.fn();
const listBillingPricingMock = vi.fn();
const listRuntimeRoutesMock = vi.fn();

vi.mock('../../services/v2WorkflowRunsApi', () => ({
  createWorkflowRun: (...args: unknown[]) => createWorkflowRunMock(...args),
  getWorkflowRun: (...args: unknown[]) => getWorkflowRunMock(...args),
  listFlowWorkflowRuns: (...args: unknown[]) => listFlowWorkflowRunsMock(...args),
  streamWorkflowRun: (...args: unknown[]) => streamWorkflowRunMock(...args),
}));

vi.mock('../../services/v2AssetsApi', () => ({
  getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
}));

vi.mock('../../billing/billingApi', () => ({
  getBillingSummary: (...args: unknown[]) => getBillingSummaryMock(...args),
  listBillingPricing: (...args: unknown[]) => listBillingPricingMock(...args),
}));

vi.mock('../../services/v2AiRoutesApi', () => ({
  listRuntimeRoutes: (...args: unknown[]) => listRuntimeRoutesMock(...args),
}));

describe('v2WorkflowRunner', () => {
  beforeEach(() => {
    createWorkflowRunMock.mockReset();
    getWorkflowRunMock.mockReset();
    listFlowWorkflowRunsMock.mockReset();
    streamWorkflowRunMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => ({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: `https://cdn.test/${assetId}-${variantKey || 'original'}.png?X-Amz-Signature=signed`,
      variantKey: variantKey ?? null,
    }));
    getBillingSummaryMock.mockReset();
    listBillingPricingMock.mockReset();
    listRuntimeRoutesMock.mockReset();
    resetCreditPreflightStateForTests();
    disposeBackendWorkflowRunStream();
    resetRemoteDraftSaveBarrierStateForTests();

    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 10_000,
        reservedCents: 0,
      },
      availableCredits: 10_000,
      balanceCredits: 10_000,
      reservedCredits: 0,
      usageTotals: {
        totalBillableCents: 0,
      },
    });
    listBillingPricingMock.mockResolvedValue([
      {
        active: true,
        id: 'pricing-image-default',
        minChargeCredits: 100,
        model: 'mock-image',
        provider: 'mock-provider',
        route: 'image.default',
        unit: 'image_generation',
        unitCredits: 100,
      },
      {
        active: true,
        id: 'pricing-text-default',
        minChargeCredits: 12,
        model: 'default',
        provider: 'default',
        route: 'default',
        unit: 'text_generation',
        unitCredits: 12,
      },
      {
        active: true,
        id: 'pricing-video-default',
        minChargeCredits: 800,
        model: 'default',
        provider: 'default',
        route: 'default',
        unit: 'video_generation',
        unitCredits: 800,
      },
    ]);
    listRuntimeRoutesMock.mockResolvedValue([
      {
        estimatedCredits: 100,
        minChargeCredits: 100,
        modality: 'image',
        modelDisplayName: 'Mock Image',
        modelKey: 'mock-image',
        pricingUnit: 'image_generation',
        providerKey: 'mock-provider',
        providerName: 'Mock Provider',
        routeKey: 'image.default',
      },
    ]);

    useFlowCanvasStore.getState().newProject();
    useFlowCanvasStore.setState({
      backendFlowId: '11111111-1111-1111-1111-111111111111',
      runError: null,
    });
  });

  test('multiple backend runs close the previous stream', async () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    createWorkflowRunMock
      .mockResolvedValueOnce({ runId: 'run-1', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-2', status: 'pending' });

    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-1',
        idempotencyKey: null,
        inputJson: {},
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });

    streamWorkflowRunMock
      .mockReturnValueOnce({ close: firstClose })
      .mockReturnValueOnce({ close: secondClose });

    await runBackendWorkflow();
    await runBackendWorkflow();

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).not.toHaveBeenCalled();
  });

  test('target-node runs send runMode and targetNodeId to the workflow API', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Target Image' });
    const targetNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-target',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-target',
          inputJson: {},
          maxAttempts: 3,
          nodeId: targetNodeId,
          nodeType: 'image.generate',
          outputJson: null,
          providerTaskId: null,
          startedAt: null,
          status: 'runnable',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-target',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-target',
        idempotencyKey: null,
        inputJson: {
          runMode: 'target_node',
          targetNodeId,
        },
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({
      close: vi.fn(),
    });

    await runBackendWorkflow({
      runMode: 'target_node',
      targetNodeId,
    });

    expect(createWorkflowRunMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        runMode: 'target_node',
        targetNodeId,
      }),
    );
  });

  test('waits for remote draft save before creating a target-node run', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      routeKey: 'image.default',
      title: 'Image',
    });
    const targetNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    let resolveSave!: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const saveBarrier = vi.fn(() => savePromise);
    registerRemoteDraftSaveBarrier(saveBarrier);

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-save-barrier',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-save-barrier',
          inputJson: {},
          maxAttempts: 3,
          nodeId: targetNodeId,
          nodeType: 'image.generate',
          outputJson: null,
          providerTaskId: null,
          startedAt: null,
          status: 'runnable',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-save-barrier',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-save-barrier',
        idempotencyKey: null,
        inputJson: {
          runMode: 'target_node',
          targetNodeId,
        },
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    const runPromise = runBackendWorkflow({ runMode: 'target_node', targetNodeId });

    await vi.waitFor(() => expect(saveBarrier).toHaveBeenCalledTimes(1));
    expect(createWorkflowRunMock).not.toHaveBeenCalled();

    resolveSave();
    await runPromise;

    expect(createWorkflowRunMock).toHaveBeenCalledTimes(1);
  });

  test('skips redundant remote draft save for target-node run immediately after a successful save', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      routeKey: 'image.default',
      title: 'Image',
    });
    const targetNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    const saveBarrier = vi.fn(async () => {});
    registerRemoteDraftSaveBarrier(saveBarrier);
    await flushRemoteDraftBeforeRun();
    saveBarrier.mockClear();

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-fresh-draft',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-fresh-draft',
          inputJson: {},
          maxAttempts: 3,
          nodeId: targetNodeId,
          nodeType: 'image.generate',
          outputJson: null,
          providerTaskId: null,
          startedAt: null,
          status: 'runnable',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-fresh-draft',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-fresh-draft',
        idempotencyKey: null,
        inputJson: {
          runMode: 'target_node',
          targetNodeId,
        },
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId });

    expect(saveBarrier).not.toHaveBeenCalled();
    expect(createWorkflowRunMock).toHaveBeenCalledTimes(1);
  });

  test('target-node runs are tracked per node and starting B does not clear A', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'A' });
    useFlowCanvasStore.getState().addNode('image', { x: 120, y: 0 }, { title: 'B' });
    const [nodeA, nodeB] = useFlowCanvasStore.getState().nodes;

    createWorkflowRunMock
      .mockResolvedValueOnce({ runId: 'run-a', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-b', status: 'pending' });
    getWorkflowRunMock.mockImplementation((runId: string) => Promise.resolve({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: `node-${runId}`,
          inputJson: {},
          maxAttempts: 3,
          nodeId: runId === 'run-a' ? nodeA!.id : nodeB!.id,
          nodeType: 'image.generate',
          outputJson: null,
          providerTaskId: null,
          startedAt: null,
          status: 'running',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: runId,
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: runId,
        idempotencyKey: null,
        inputJson: {
          runMode: 'target_node',
          targetNodeId: runId === 'run-a' ? nodeA!.id : nodeB!.id,
        },
        outputJson: null,
        startedAt: null,
        status: 'running',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    }));
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeA!.id });
    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeB!.id });

    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeA!.id]).toBe('running');
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeB!.id]).toBe('running');
    expect(useFlowCanvasStore.getState().workflowRunIdByNodeId[nodeA!.id]).toBe('run-a');
    expect(useFlowCanvasStore.getState().workflowRunIdByNodeId[nodeB!.id]).toBe('run-b');
  });

  test('credit preflight blocks a target-node run when available credits are below route pricing', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      routeKey: 'image.default',
      title: 'Blocked image',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    getBillingSummaryMock.mockResolvedValueOnce({
      account: {
        balanceCents: 40,
        reservedCents: 0,
      },
      availableCredits: 40,
      balanceCredits: 40,
      reservedCredits: 0,
      usageTotals: {
        totalBillableCents: 0,
      },
    });

    await expect(runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId }))
      .rejects.toThrow('余额不足');

    expect(createWorkflowRunMock).not.toHaveBeenCalled();
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeId]).toBe('failed');
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      errorCode: 'INSUFFICIENT_CREDITS',
      generationStatus: 'error',
      status: 'failed',
    });
  });

  test('markBackendRunLaunchFailed exposes workflow launch errors on the target node', () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      generationStatus: 'generating',
      status: 'running',
      title: '多角度后的1',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    markBackendRunLaunchFailed(nodeId, new V2HttpError({
      code: 'PRICING_NOT_FOUND',
      message: 'No active pricing found for node target-image (image.generate)',
      status: 422,
    }));

    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      errorMessage: 'PRICING_NOT_FOUND: No active pricing found for node target-image (image.generate)',
      generationStatus: 'error',
      progress: 0,
      status: 'failed',
    });
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeId]).toBe('failed');
    expect(useFlowCanvasStore.getState().runError)
      .toBe('PRICING_NOT_FOUND: No active pricing found for node target-image (image.generate)');
  });

  test('markBackendRunLaunchFailed preserves API-style error codes outside V2HttpError', () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      generationStatus: 'generating',
      status: 'running',
      title: '打光后的1',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    markBackendRunLaunchFailed(nodeId, {
      code: 'TARGET_NODE_NOT_FOUND',
      message: '未在当前草稿中找到目标节点',
    });

    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      errorMessage: 'TARGET_NODE_NOT_FOUND: 未在当前草稿中找到目标节点',
      generationStatus: 'error',
      status: 'failed',
    });
  });

  test('target-node run fails visibly when the backend snapshot has no target node run', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      generationStatus: 'generating',
      routeKey: 'image.default',
      status: 'running',
      title: 'Image edit result',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-without-target-node-run',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-without-target-node-run',
        idempotencyKey: null,
        inputJson: { runMode: 'target_node', targetNodeId: nodeId },
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });

    await expect(runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId }))
      .rejects.toThrow('TARGET_NODE_RUN_MISSING');

    expect(streamWorkflowRunMock).not.toHaveBeenCalled();
    expect(useFlowCanvasStore.getState().nodes[0]?.data).toMatchObject({
      errorMessage: expect.stringContaining('TARGET_NODE_RUN_MISSING'),
      generationStatus: 'error',
      status: 'failed',
      workflowLaunchStatus: 'failed',
    });
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeId]).toBe('failed');
  });

  test('rapid target-node clicks use optimistic reservations and block the fifth image locally', async () => {
    for (let index = 0; index < 5; index += 1) {
      useFlowCanvasStore.getState().addNode('image', { x: index * 120, y: 0 }, {
        routeKey: 'image.default',
        title: `Image ${index + 1}`,
      });
    }
    const nodeIds = useFlowCanvasStore.getState().nodes.map((node) => node.id);
    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 440,
        reservedCents: 0,
      },
      availableCredits: 440,
      balanceCredits: 440,
      reservedCredits: 0,
      usageTotals: {
        totalBillableCents: 0,
      },
    });
    createWorkflowRunMock
      .mockResolvedValueOnce({ runId: 'run-1', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-2', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-3', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-4', status: 'pending' });
    getWorkflowRunMock.mockImplementation((runId: string) => {
      const index = Number(runId.replace('run-', '')) - 1;
      return Promise.resolve({
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: null,
            id: `node-${runId}`,
            inputJson: {},
            maxAttempts: 3,
            nodeId: nodeIds[index],
            nodeType: 'image.generate',
            outputJson: null,
            providerTaskId: null,
            startedAt: null,
            status: 'running',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:00.000Z',
            workflowRunId: runId,
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: null,
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: runId,
          idempotencyKey: null,
          inputJson: {
            runMode: 'target_node',
            targetNodeId: nodeIds[index],
          },
          outputJson: null,
          startedAt: null,
          status: 'running',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      });
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    const results = await Promise.allSettled(
      nodeIds.map((nodeId) => runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId })),
    );

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(4);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(createWorkflowRunMock).toHaveBeenCalledTimes(4);
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeIds[4]!]).toBe('failed');
    expect(String(useFlowCanvasStore.getState().nodes[4]?.data.errorMessage)).toContain('已开始任务占用 400 pts');
  });

  test('optimistic reservation is released when a run reaches a terminal status', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { routeKey: 'image.default' });
    useFlowCanvasStore.getState().addNode('image', { x: 120, y: 0 }, { routeKey: 'image.default' });
    const [firstNode, secondNode] = useFlowCanvasStore.getState().nodes;
    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 100,
        reservedCents: 0,
      },
      availableCredits: 100,
      balanceCredits: 100,
      reservedCredits: 0,
      usageTotals: {
        totalBillableCents: 0,
      },
    });
    createWorkflowRunMock
      .mockResolvedValueOnce({ runId: 'run-done', status: 'pending' })
      .mockResolvedValueOnce({ runId: 'run-next', status: 'pending' });
    getWorkflowRunMock
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:01.000Z',
            id: 'node-run-done',
            inputJson: {},
            maxAttempts: 3,
            nodeId: firstNode!.id,
            nodeType: 'image.generate',
            outputJson: {
              assets: [{ assetId: 'asset-done', kind: 'image', mimeType: 'image/png' }],
            },
            providerTaskId: null,
            startedAt: null,
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:01.000Z',
            workflowRunId: 'run-done',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:01.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-done',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: firstNode!.id },
          outputJson: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:01.000Z',
        },
      })
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:02.000Z',
            errorJson: null,
            finishedAt: null,
            id: 'node-run-next',
            inputJson: {},
            maxAttempts: 3,
            nodeId: secondNode!.id,
            nodeType: 'image.generate',
            outputJson: null,
            providerTaskId: null,
            startedAt: null,
            status: 'runnable',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:02.000Z',
            workflowRunId: 'run-next',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:02.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: null,
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-next',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: secondNode!.id },
          outputJson: null,
          startedAt: null,
          status: 'pending',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:02.000Z',
        },
      });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: firstNode!.id });
    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: secondNode!.id });

    expect(createWorkflowRunMock).toHaveBeenCalledTimes(2);
  });

  test('create-run insufficient credits response is mapped to node-level balance messaging', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { routeKey: 'image.default' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    createWorkflowRunMock.mockRejectedValue(new V2HttpError({
      code: 'INSUFFICIENT_CREDITS',
      details: {
        availableCredits: 40,
        requiredCredits: 100,
      },
      message: '余额不足，请充值或兑换点数后继续生成。',
      status: 402,
    }));

    await expect(runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId }))
      .rejects.toThrow('余额不足');

    expect(useFlowCanvasStore.getState().nodes[0]?.data.errorMessage).toContain('余额不足');
    expect(useFlowCanvasStore.getState().runError).toContain('余额不足');
  });

  test('asset refs use signed preview urls and stay in runtime state', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      batchCount: 2,
      generationPrompt: 'a quiet studio product photo',
      modelId: 'mock-image',
      params: {
        aspect_ratio: '4:3',
        quality: 'high',
        size: '2k',
      },
      referenceOrder: ['asset:ref-1'],
      routeId: 'route-image-default',
      routeKey: 'image.default',
      title: 'Generated Image',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id;
    expect(nodeId).toBeTruthy();
    const imageNodeId = nodeId as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-asset',
      status: 'pending',
    });
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => ({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: `https://cdn.test/${assetId}-${variantKey || 'original'}.png?X-Amz-Signature=signed`,
      variantKey: variantKey ?? null,
    }));
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-1',
          inputJson: {},
          maxAttempts: 3,
          nodeId: imageNodeId,
          nodeType: 'image.generate',
          outputJson: {
            assets: [
              {
                assetId: 'asset-1',
                height: 384,
                kind: 'image',
                mimeType: 'image/png',
                width: 512,
              },
              {
                assetId: 'asset-2',
                height: 384,
                kind: 'image',
                mimeType: 'image/png',
                width: 512,
              },
            ],
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-asset',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: '2026-05-17T00:00:01.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-asset',
        idempotencyKey: null,
        inputJson: {},
        outputJson: null,
        startedAt: null,
        status: 'succeeded',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:01.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({
      close: vi.fn(),
    });

    await runBackendWorkflow();

    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('asset-1', 'preview');
    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('asset-2', 'preview');
    expect(useFlowCanvasStore.getState().nodeOutputByNodeId[imageNodeId]).toMatchObject({
      assets: [
        expect.objectContaining({
          assetId: 'asset-1',
          downloadUrl: 'https://cdn.test/asset-1-preview.png?X-Amz-Signature=signed',
        }),
        expect.objectContaining({
          assetId: 'asset-2',
          downloadUrl: 'https://cdn.test/asset-2-preview.png?X-Amz-Signature=signed',
        }),
      ],
    });
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === imageNodeId);
    expect(updatedNode?.data).toMatchObject({
      assetId: 'asset-1',
      assetIds: ['asset-1', 'asset-2'],
      activeResultIndex: 0,
      coverResultId: 'asset:asset-1',
      generatedResults: [
        expect.objectContaining({
          id: 'asset:asset-1',
          url: 'https://cdn.test/asset-1-preview.png?X-Amz-Signature=signed',
        }),
        expect.objectContaining({
          id: 'asset:asset-2',
          url: 'https://cdn.test/asset-2-preview.png?X-Amz-Signature=signed',
        }),
      ],
      generationStatus: 'done',
      lastGenerationSnapshot: expect.objectContaining({
        aspectRatio: '4:3',
        modelId: 'mock-image',
        n: 2,
        prompt: 'a quiet studio product photo',
        quality: 'high',
        referenceImageCount: 1,
        routeId: 'route-image-default',
        size: '2k',
      }),
      mimeType: 'image/png',
      naturalHeight: 384,
      naturalWidth: 512,
      source: 'generated',
      status: 'success',
      workflowLaunchStatus: 'asset_visible',
      workflowLaunchUpdatedAt: expect.any(Number),
    });
    expect(updatedNode?.data.thumbnailUrl).toBe('https://cdn.test/asset-1-preview.png?X-Amz-Signature=signed');
  });

  test('asset refs fall back to original signed url while preview variant is pending', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      routeKey: 'image.default',
      title: 'Generated Image',
    });
    const imageNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-preview-pending',
      status: 'pending',
    });
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => {
      if (variantKey === 'preview') {
        throw new Error('preview variant pending');
      }
      return {
        expiresAt: '2026-05-17T00:15:00.000Z',
        method: 'GET',
        url: `https://cdn.test/${assetId}-original.png?X-Amz-Signature=signed`,
        variantKey: null,
      };
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-preview-pending',
          inputJson: {},
          maxAttempts: 3,
          nodeId: imageNodeId,
          nodeType: 'image.generate',
          outputJson: {
            assets: [
              {
                assetId: 'asset-original-fallback',
                height: 384,
                kind: 'image',
                mimeType: 'image/png',
                width: 512,
              },
            ],
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-preview-pending',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: '2026-05-17T00:00:01.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-preview-pending',
        idempotencyKey: null,
        inputJson: {},
        outputJson: null,
        startedAt: null,
        status: 'succeeded',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:01.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow();

    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('asset-original-fallback', 'preview');
    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('asset-original-fallback');
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === imageNodeId);
    expect(updatedNode?.data.thumbnailUrl).toBe('https://cdn.test/asset-original-fallback-original.png?X-Amz-Signature=signed');
    expect(updatedNode?.data.assetId).toBe('asset-original-fallback');
  });

  test('video assets use original signed url as poster when preview variant is unavailable', async () => {
    useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      routeKey: 'video.default',
      title: 'Generated Video',
    });
    const videoNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-video-asset',
      status: 'pending',
    });
    getAssetVariantUrlMock.mockImplementation(async (assetId: string, variantKey?: string) => {
      if (variantKey === 'preview') {
        throw new Error('video preview unavailable');
      }
      return {
        expiresAt: '2026-05-17T00:15:00.000Z',
        method: 'GET',
        url: `https://cdn.test/${assetId}-original.mp4?X-Amz-Signature=signed`,
        variantKey: null,
      };
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-video-asset',
          inputJson: {},
          maxAttempts: 3,
          nodeId: videoNodeId,
          nodeType: 'video.generate',
          outputJson: {
            assets: [
              {
                assetId: 'video-asset-1',
                durationMs: 4000,
                kind: 'video',
                mimeType: 'video/mp4',
              },
            ],
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-video-asset',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: '2026-05-17T00:00:01.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-video-asset',
        idempotencyKey: null,
        inputJson: {},
        outputJson: null,
        startedAt: null,
        status: 'succeeded',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:01.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow();

    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('video-asset-1', 'preview');
    expect(getAssetVariantUrlMock).toHaveBeenCalledWith('video-asset-1');
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === videoNodeId);
    expect(updatedNode?.data).toMatchObject({
      assetId: 'video-asset-1',
      generationStatus: 'done',
      mimeType: 'video/mp4',
      posterUrl: 'https://cdn.test/video-asset-1-original.mp4?X-Amz-Signature=signed',
      workflowLaunchStatus: 'asset_visible',
      workflowLaunchUpdatedAt: expect.any(Number),
    });
  });

  test('text target-node snapshot clears generating state and applies returned text', async () => {
    useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, {
      generationPrompt: 'analyze this image',
      generationStatus: 'generating',
      modelId: 'gpt-5.5',
      routeKey: 'text.gpt-5-5',
      status: 'running',
      text: '',
      title: 'Generated Copy',
    });
    const textNodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-text-success',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:02.000Z',
          id: 'node-run-text-success',
          inputJson: {},
          maxAttempts: 3,
          nodeId: textNodeId,
          nodeType: 'text.generate',
          outputJson: {
            modelKey: 'gpt-5.5',
            providerKey: 'siphonlab-openai-text',
            text: 'Palm trees beside a bright tropical beach.',
            usage: {
              inputTokens: 120,
              outputTokens: 48,
              totalTokens: 168,
            },
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:02.000Z',
          workflowRunId: 'run-text-success',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: '2026-05-17T00:00:02.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-text-success',
        idempotencyKey: null,
        inputJson: { runMode: 'target_node', targetNodeId: textNodeId },
        outputJson: null,
        startedAt: null,
        status: 'succeeded',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:02.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: textNodeId });

    expect(useFlowCanvasStore.getState().nodeOutputByNodeId[textNodeId]).toMatchObject({
      text: 'Palm trees beside a bright tropical beach.',
    });
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === textNodeId);
    expect(updatedNode?.data).toMatchObject({
      generationStatus: 'done',
      status: 'success',
    });
  });

  test('terminal stream event finalizes the run snapshot and applies generated assets', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Stream Image' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    let onEvent: ((event: {
      createdAt: string;
      eventType: string;
      id: string;
      nodeRunId: string | null;
      payload: Record<string, unknown>;
      sequence: number;
      tenantId: string;
      workflowRunId: string;
    }) => void) | null = null;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-stream-final',
      status: 'pending',
    });
    getWorkflowRunMock
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: null,
            id: 'node-run-stream-final',
            inputJson: {},
            maxAttempts: 3,
            nodeId,
            nodeType: 'image.generate',
            outputJson: null,
            providerTaskId: null,
            startedAt: null,
            status: 'running',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:00.000Z',
            workflowRunId: 'run-stream-final',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: null,
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-stream-final',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: nodeId },
          outputJson: null,
          startedAt: null,
          status: 'running',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:02.000Z',
            id: 'node-run-stream-final',
            inputJson: {},
            maxAttempts: 3,
            nodeId,
            nodeType: 'image.generate',
            outputJson: {
              assets: [{ assetId: 'asset-stream-final', kind: 'image', mimeType: 'image/png' }],
            },
            providerTaskId: null,
            startedAt: null,
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:02.000Z',
            workflowRunId: 'run-stream-final',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:02.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-stream-final',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: nodeId },
          outputJson: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:02.000Z',
        },
      });
    streamWorkflowRunMock.mockImplementation((_runId, options) => {
      onEvent = options.onEvent;
      return { close: vi.fn() };
    });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId });
    onEvent?.({
      createdAt: '2026-05-17T00:00:02.000Z',
      eventType: 'workflow.run.succeeded',
      id: 'event-final',
      nodeRunId: null,
      payload: { status: 'succeeded' },
      sequence: 10,
      tenantId: 'tenant-1',
      workflowRunId: 'run-stream-final',
    });
    await vi.waitFor(() => {
      expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data.assetId)
        .toBe('asset-stream-final');
    });

    expect(getWorkflowRunMock).toHaveBeenCalledTimes(2);
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeId);
    expect(updatedNode?.data).toMatchObject({
      assetId: 'asset-stream-final',
      generationStatus: 'done',
      status: 'success',
    });
  });

  test('split_nodes mode creates child image nodes and suppresses duplicate parent filmstrip batch state', async () => {
    const parent = useFlowCanvasStore.getState().addNode('image', { x: 80, y: 120 }, {
      batchCount: 2,
      multiImageDisplayMode: 'split_nodes',
      routeKey: 'image.default',
      title: 'Parent Image',
    });

    listFlowWorkflowRunsMock.mockResolvedValue([
      {
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:03.000Z',
            id: 'node-run-image-split',
            inputJson: {},
            maxAttempts: 3,
            nodeId: parent.id,
            nodeType: 'image.generate',
            outputJson: {
              assets: [
                {
                  assetId: 'asset-parent-1',
                  height: 1024,
                  kind: 'image',
                  mimeType: 'image/png',
                  width: 768,
                },
                {
                  assetId: 'asset-parent-2',
                  height: 1024,
                  kind: 'image',
                  mimeType: 'image/png',
                  width: 768,
                },
              ],
            },
            providerTaskId: null,
            startedAt: '2026-05-17T00:00:01.000Z',
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:03.000Z',
            workflowRunId: 'run-image-split',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:03.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-image-split',
          idempotencyKey: null,
          inputJson: {
            runMode: 'target_node',
            targetNodeId: parent.id,
          },
          outputJson: null,
          startedAt: '2026-05-17T00:00:01.000Z',
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:03.000Z',
        },
      },
    ]);

    await recoverFlowTargetNodeRuns('11111111-1111-1111-1111-111111111111');

    const state = useFlowCanvasStore.getState();
    const refreshedParent = state.nodes.find((node) => node.id === parent.id);
    const children = state.nodes.filter((node) => node.id !== parent.id && node.data.editSourceNodeId === parent.id);

    expect(children).toHaveLength(2);
    expect(refreshedParent?.data.generatedResults).toBeUndefined();
    expect(refreshedParent?.data.thumbnailUrl).toBe('https://cdn.test/asset-parent-1-preview.png?X-Amz-Signature=signed');
  });

  test('failed target-node snapshot clears generating state on the node', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      generationStatus: 'generating',
      routeKey: 'image.gpt-image-2',
      status: 'running',
      title: 'GPT Image',
    });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-gpt-image-failed',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: {
            code: 'PROVIDER_BAD_REQUEST',
            message: 'The provider rejected the request payload',
          },
          finishedAt: '2026-05-17T00:00:02.000Z',
          id: 'node-run-gpt-image-failed',
          inputJson: {},
          maxAttempts: 3,
          nodeId,
          nodeType: 'image.generate',
          outputJson: null,
          providerTaskId: null,
          startedAt: null,
          status: 'failed',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:02.000Z',
          workflowRunId: 'run-gpt-image-failed',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: {
          code: 'PROVIDER_BAD_REQUEST',
          message: 'The provider rejected the request payload',
        },
        finishedAt: '2026-05-17T00:00:02.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-gpt-image-failed',
        idempotencyKey: null,
        inputJson: { runMode: 'target_node', targetNodeId: nodeId },
        outputJson: null,
        startedAt: null,
        status: 'failed',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:02.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({ close: vi.fn() });

    await runBackendWorkflow({ runMode: 'target_node', targetNodeId: nodeId });

    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeId);
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[nodeId]).toBe('failed');
    expect(updatedNode?.data).toMatchObject({
      errorMessage: 'The provider rejected the request payload',
      generationStatus: 'error',
      status: 'failed',
    });
  });

  test('target-node snapshots do not overwrite completed assets on other nodes', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      title: 'Pig',
      assetId: 'asset-pig-stable',
      source: 'generated',
    });
    useFlowCanvasStore.getState().addNode('image', { x: 120, y: 0 }, {
      title: 'Goat',
    });

    const [stableNode, targetNode] = useFlowCanvasStore.getState().nodes;
    expect(stableNode?.id).toBeTruthy();
    expect(targetNode?.id).toBeTruthy();

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-scope',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-stable',
          inputJson: {},
          maxAttempts: 3,
          nodeId: stableNode.id,
          nodeType: 'image.generate',
          outputJson: {
            assets: [
              {
                assetId: 'asset-should-ignore',
                kind: 'image',
                mimeType: 'image/png',
              },
            ],
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-scope',
        },
        {
          attempt: 1,
          costJson: {},
          createdAt: '2026-05-17T00:00:00.000Z',
          errorJson: null,
          finishedAt: null,
          id: 'node-run-target',
          inputJson: {},
          maxAttempts: 3,
          nodeId: targetNode.id,
          nodeType: 'image.generate',
          outputJson: {
            assets: [
              {
                assetId: 'asset-goat',
                kind: 'image',
                mimeType: 'image/png',
                width: 768,
              },
            ],
          },
          providerTaskId: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:00.000Z',
          workflowRunId: 'run-scope',
        },
      ],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: '2026-05-17T00:00:01.000Z',
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-scope',
        idempotencyKey: null,
        inputJson: {
          runMode: 'target_node',
          targetNodeId: targetNode.id,
        },
        outputJson: null,
        startedAt: null,
        status: 'succeeded',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:01.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({
      close: vi.fn(),
    });

    await runBackendWorkflow({
      runMode: 'target_node',
      targetNodeId: targetNode.id,
    });

    const nextStableNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === stableNode.id);
    const nextTargetNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === targetNode.id);

    expect(nextStableNode?.data.assetId).toBe('asset-pig-stable');
    expect(nextTargetNode?.data.assetId).toBe('asset-goat');
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[stableNode.id]).toBeUndefined();
    expect(useFlowCanvasStore.getState().nodeRunStatusByNodeId[targetNode.id]).toBe('succeeded');
  });

  test('unbound backend flows fail with a clear error', async () => {
    useFlowCanvasStore.setState({
      backendFlowId: null,
    });

    await expect(runBackendWorkflow()).rejects.toThrow('v2 flowId');
  });

  test('recovering flow runs restores completed target-node assets after remount', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Recovered' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    listFlowWorkflowRunsMock.mockResolvedValue([
      {
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:10.000Z',
            id: 'node-run-recovered',
            inputJson: {},
            maxAttempts: 3,
            nodeId,
            nodeType: 'image.generate',
            outputJson: {
              assets: [{ assetId: 'asset-recovered', kind: 'image', mimeType: 'image/png' }],
              nodeRunId: 'node-run-recovered',
              targetNodeId: nodeId,
              workflowRunId: 'run-recovered',
            },
            providerTaskId: null,
            startedAt: '2026-05-17T00:00:00.000Z',
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:10.000Z',
            workflowRunId: 'run-recovered',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:10.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-recovered',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: nodeId },
          outputJson: null,
          startedAt: '2026-05-17T00:00:00.000Z',
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:10.000Z',
        },
      },
    ]);

    await recoverFlowTargetNodeRuns('11111111-1111-1111-1111-111111111111');

    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeId);
    expect(updatedNode?.data.assetId).toBe('asset-recovered');
    expect(useFlowCanvasStore.getState().nodeOutputByNodeId[nodeId]?.assets?.[0]).toMatchObject({
      assetId: 'asset-recovered',
      downloadUrl: 'https://cdn.test/asset-recovered-preview.png?X-Amz-Signature=signed',
    });
  });

  test('late completion from an older same-node run cannot overwrite the latest run', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Same node' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    listFlowWorkflowRunsMock.mockResolvedValue([
      {
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:10.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:20.000Z',
            id: 'node-run-new',
            inputJson: {},
            maxAttempts: 3,
            nodeId,
            nodeType: 'image.generate',
            outputJson: {
              assets: [{ assetId: 'asset-new', kind: 'image', mimeType: 'image/png' }],
            },
            providerTaskId: null,
            startedAt: null,
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:20.000Z',
            workflowRunId: 'run-new',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:10.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:20.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-new',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: nodeId },
          outputJson: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:20.000Z',
        },
      },
      {
        nodeRuns: [
          {
            attempt: 1,
            costJson: {},
            createdAt: '2026-05-17T00:00:00.000Z',
            errorJson: null,
            finishedAt: '2026-05-17T00:00:30.000Z',
            id: 'node-run-old',
            inputJson: {},
            maxAttempts: 3,
            nodeId,
            nodeType: 'image.generate',
            outputJson: {
              assets: [{ assetId: 'asset-old', kind: 'image', mimeType: 'image/png' }],
            },
            providerTaskId: null,
            startedAt: null,
            status: 'succeeded',
            tenantId: 'tenant-1',
            updatedAt: '2026-05-17T00:00:30.000Z',
            workflowRunId: 'run-old',
          },
        ],
        workflowRun: {
          canceledAt: null,
          createdAt: '2026-05-17T00:00:00.000Z',
          createdBy: 'user-1',
          errorJson: null,
          finishedAt: '2026-05-17T00:00:30.000Z',
          flowId: '11111111-1111-1111-1111-111111111111',
          flowVersionId: 'version-1',
          id: 'run-old',
          idempotencyKey: null,
          inputJson: { runMode: 'target_node', targetNodeId: nodeId },
          outputJson: null,
          startedAt: null,
          status: 'succeeded',
          tenantId: 'tenant-1',
          updatedAt: '2026-05-17T00:00:30.000Z',
        },
      },
    ]);

    await recoverFlowTargetNodeRuns('11111111-1111-1111-1111-111111111111');

    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === nodeId);
    expect(updatedNode?.data.assetId).toBe('asset-new');
  });

  test('disposeBackendWorkflowRunStream closes the active stream', async () => {
    const close = vi.fn();
    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-dispose',
      status: 'pending',
    });
    getWorkflowRunMock.mockResolvedValue({
      nodeRuns: [],
      workflowRun: {
        canceledAt: null,
        createdAt: '2026-05-17T00:00:00.000Z',
        createdBy: 'user-1',
        errorJson: null,
        finishedAt: null,
        flowId: '11111111-1111-1111-1111-111111111111',
        flowVersionId: 'version-1',
        id: 'run-dispose',
        idempotencyKey: null,
        inputJson: {},
        outputJson: null,
        startedAt: null,
        status: 'pending',
        tenantId: 'tenant-1',
        updatedAt: '2026-05-17T00:00:00.000Z',
      },
    });
    streamWorkflowRunMock.mockReturnValue({
      close,
    });

    await runBackendWorkflow();
    disposeBackendWorkflowRunStream();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
