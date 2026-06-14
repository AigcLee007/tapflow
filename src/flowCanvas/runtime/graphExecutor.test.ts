import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import { mergeImageReferences, runImageEdit } from './graphExecutor';

const editImageApiMock = vi.fn();

vi.mock('../../../services/api', () => ({
  checkTaskStatus: vi.fn(),
  editImageApi: (...args: unknown[]) => editImageApiMock(...args),
  findAllUrlsInObject: vi.fn(),
  generateImageApi: vi.fn(),
  generateTextApi: vi.fn(),
}));

vi.mock('../../../services/videoService', () => ({
  generateVideo: vi.fn(),
}));

describe('mergeImageReferences', () => {
  it('merges upstream and node references and removes duplicates', () => {
    const upstream = ['https://a.png', 'https://b.png'];
    const data = {
      referenceImages: ['https://b.png', 'https://c.png', '', null],
    };

    expect(mergeImageReferences(upstream, data)).toEqual([
      'https://a.png',
      'https://b.png',
      'https://c.png',
    ]);
  });

  it('handles missing referenceImages safely', () => {
    expect(mergeImageReferences(['https://a.png'], {})).toEqual(['https://a.png']);
    expect(mergeImageReferences([], null)).toEqual([]);
  });
});

describe('runImageEdit', () => {
  beforeEach(() => {
    editImageApiMock.mockReset();
    useFlowCanvasStore.getState().newProject();
  });

  it('creates a v2 target image node instead of calling the legacy edit API', async () => {
    const sourceNode = useFlowCanvasStore.getState().addNode('image', { x: 10, y: 20 }, {
      assetId: 'asset-source',
      height: 240,
      modelId: 'nano-banana-pro',
      routeId: 'nano-banana-pro-line1',
      routeKey: 'image.nano-banana-pro',
      thumbnailUrl: 'https://cdn.test/source.png',
      title: 'Source',
      width: 320,
    });

    const targetNodeId = await runImageEdit(sourceNode.id, 'erase', {
      mask: 'data:image/png;base64,mask',
      prompt: 'Remove the highlighted object',
      params: {
        maskMode: 'brush',
      },
    });

    expect(editImageApiMock).not.toHaveBeenCalled();
    expect(targetNodeId).toBeTruthy();

    const state = useFlowCanvasStore.getState();
    const targetNode = state.nodes.find((node) => node.id === targetNodeId);
    expect(state.edges).toEqual([
      expect.objectContaining({
        source: sourceNode.id,
        target: targetNodeId,
      }),
    ]);
    expect(targetNode?.data).toEqual(expect.objectContaining({
      editPrompt: 'Remove the highlighted object',
      editSourceNodeId: sourceNode.id,
      generationPrompt: 'Remove the highlighted object',
      generationRunLabel: '正在生成图片',
      generationStatus: 'generating',
      lastEditType: 'erase',
      modelId: 'nano-banana-pro',
      routeId: 'nano-banana-pro-line1',
      routeKey: 'image.nano-banana-pro',
      status: 'running',
    }));
    expect(targetNode?.data.imageEditRequest).toEqual(expect.objectContaining({
      editType: 'erase',
      prompt: 'Remove the highlighted object',
      routeKey: 'image.nano-banana-pro',
      sourceNodeId: sourceNode.id,
    }));
    expect(targetNode?.data.params).toEqual(expect.objectContaining({
      mask: 'data:image/png;base64,mask',
      maskMode: 'brush',
    }));
  });

  it('preserves an explicit runtime routeKey for downstream workflow runs', async () => {
    const sourceNode = useFlowCanvasStore.getState().addNode('image', { x: 10, y: 20 }, {
      assetId: 'asset-source',
      height: 240,
      modelId: 'nano-banana-pro',
      routeId: 'nano-banana-pro-line1',
      routeKey: 'image.nano-banana-pro',
      thumbnailUrl: 'https://cdn.test/source.png',
      title: 'Source',
      width: 320,
    });

    const targetNodeId = await runImageEdit(sourceNode.id, 'relight', {
      prompt: 'Add soft side lighting',
      modelId: 'nano-banana-pro',
      routeId: 'nano-banana-pro-line1',
      routeKey: 'image.nano-banana-pro',
      params: {
        relight: {
          brightness: 0.3,
          direction: 'left',
        },
      },
    });

    const targetNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === targetNodeId);
    expect(targetNode?.data).toEqual(expect.objectContaining({
      routeId: 'nano-banana-pro-line1',
      routeKey: 'image.nano-banana-pro',
    }));
    expect(targetNode?.data.imageEditRequest).toEqual(expect.objectContaining({
      routeId: 'nano-banana-pro-line1',
    }));
  });

  it('does not expose route keys or provider identifiers in the generating label', async () => {
    const sourceNode = useFlowCanvasStore.getState().addNode('image', { x: 10, y: 20 }, {
      assetId: 'asset-source',
      height: 240,
      modelId: 'pixellelabs.nano-banana-pro',
      routeId: 'image.pixellelabs.nano-banana-pro',
      routeKey: 'image.pixellelabs.nano-banana-pro',
      thumbnailUrl: 'https://cdn.test/source.png',
      title: 'Source',
      width: 320,
    });

    const targetNodeId = await runImageEdit(sourceNode.id, 'relight', {
      prompt: 'Add soft side lighting',
      modelId: 'pixellelabs.nano-banana-pro',
      routeId: 'image.pixellelabs.nano-banana-pro',
      routeKey: 'image.pixellelabs.nano-banana-pro',
    });

    const targetNode = useFlowCanvasStore.getState().nodes.find((node) => node.id === targetNodeId);
    expect(targetNode?.data.generationRunLabel).toBe('正在生成图片');
    expect(String(targetNode?.data.generationRunLabel)).not.toContain('pixellelabs');
    expect(String(targetNode?.data.generationRunLabel)).not.toContain('image.');
  });
});
