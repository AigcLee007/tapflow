import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useFlowCanvasStore } from '../store/flowCanvasStore';
import {
  disposeBackendWorkflowRunStream,
  recoverFlowTargetNodeRuns,
  runBackendWorkflow,
} from './v2WorkflowRunner';

const createWorkflowRunMock = vi.fn();
const getWorkflowRunMock = vi.fn();
const listFlowWorkflowRunsMock = vi.fn();
const streamWorkflowRunMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();

vi.mock('../../services/v2WorkflowRunsApi', () => ({
  createWorkflowRun: (...args: unknown[]) => createWorkflowRunMock(...args),
  getWorkflowRun: (...args: unknown[]) => getWorkflowRunMock(...args),
  listFlowWorkflowRuns: (...args: unknown[]) => listFlowWorkflowRunsMock(...args),
  streamWorkflowRun: (...args: unknown[]) => streamWorkflowRunMock(...args),
}));

vi.mock('../../services/v2AssetsApi', () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
}));

describe('v2WorkflowRunner', () => {
  beforeEach(() => {
    createWorkflowRunMock.mockReset();
    getWorkflowRunMock.mockReset();
    listFlowWorkflowRunsMock.mockReset();
    streamWorkflowRunMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    disposeBackendWorkflowRunStream();

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

    await expect(runBackendWorkflow()).rejects.toThrow('v2 flowId');
  });

  test('recovering flow runs restores completed target-node assets after remount', async () => {
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Recovered' });
    const nodeId = useFlowCanvasStore.getState().nodes[0]?.id as string;
    getAssetDownloadUrlMock.mockResolvedValue({
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
    getAssetDownloadUrlMock.mockResolvedValue({
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
