import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import {
  disposeBackendWorkflowRunStream,
  recoverFlowTargetNodeRuns,
  resetCreditPreflightStateForTests,
  runBackendWorkflow,
} from './v2WorkflowRunner';
import { registerRemoteDraftSaveBarrier } from './remoteDraftSaveBarrier';
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
    getBillingSummaryMock.mockReset();
    listBillingPricingMock.mockReset();
    listRuntimeRoutesMock.mockReset();
    resetCreditPreflightStateForTests();
    disposeBackendWorkflowRunStream();
    registerRemoteDraftSaveBarrier(null);

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
      nodeRuns: [],
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
      nodeRuns: [],
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
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/image',
    });
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
        nodeRuns: [],
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

  test('asset refs trigger download-url resolution and stay in runtime state', async () => {
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
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/presigned-image',
    });
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
          downloadUrl: 'https://example.test/presigned-image',
        }),
        expect.objectContaining({
          assetId: 'asset-2',
          downloadUrl: 'https://example.test/presigned-image',
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
          url: 'https://example.test/presigned-image',
        }),
        expect.objectContaining({
          id: 'asset:asset-2',
          url: 'https://example.test/presigned-image',
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
    });
    expect(updatedNode?.data.thumbnailUrl).toBe('https://example.test/presigned-image');
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
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/stream-final',
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
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/presigned-image',
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
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/recovered',
    });
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
      downloadUrl: 'https://example.test/recovered',
    });
  });

  test('late completion from an older same-node run cannot overwrite the latest run', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Same node' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: '2026-05-17T00:15:00.000Z',
      method: 'GET',
      url: 'https://example.test/latest',
    });
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
