import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import {
  disposeBackendWorkflowRunStream,
  runBackendWorkflow,
} from './v2WorkflowRunner';

const createWorkflowRunMock = vi.fn();
const getWorkflowRunMock = vi.fn();
const streamWorkflowRunMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();

vi.mock('../../services/v2WorkflowRunsApi', () => ({
  createWorkflowRun: (...args: unknown[]) => createWorkflowRunMock(...args),
  getWorkflowRun: (...args: unknown[]) => getWorkflowRunMock(...args),
  streamWorkflowRun: (...args: unknown[]) => streamWorkflowRunMock(...args),
}));

vi.mock('../../services/v2AssetsApi', () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

describe('v2WorkflowRunner', () => {
  beforeEach(() => {
    createWorkflowRunMock.mockReset();
    getWorkflowRunMock.mockReset();
    streamWorkflowRunMock.mockReset();
    getAssetDownloadUrlMock.mockReset();

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

  test('asset refs trigger download-url resolution and stay in runtime state', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Generated Image' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id;
    expect(nodeId).toBeTruthy();
    const imageNodeId = nodeId as string;

    createWorkflowRunMock.mockResolvedValue({
      runId: 'run-asset',
      status: 'pending',
    });
    getAssetDownloadUrlMock.mockResolvedValue({
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

    expect(getAssetDownloadUrlMock).toHaveBeenCalledWith('asset-1');
    expect(useFlowCanvasStore.getState().nodeOutputByNodeId[imageNodeId]).toMatchObject({
      assets: [
        expect.objectContaining({
          assetId: 'asset-1',
          downloadUrl: 'https://example.test/presigned-image',
        }),
      ],
    });
    const updatedNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === imageNodeId);
    expect(updatedNode?.data).toMatchObject({
      assetId: 'asset-1',
      assetIds: ['asset-1'],
      generationStatus: 'done',
      mimeType: 'image/png',
      naturalWidth: 512,
      source: 'generated',
      status: 'success',
    });
    expect(updatedNode?.data.thumbnailUrl).toBeUndefined();
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
    getAssetDownloadUrlMock.mockResolvedValue({
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

    await expect(runBackendWorkflow()).rejects.toThrow('当前画布未绑定 v2 flowId');
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
