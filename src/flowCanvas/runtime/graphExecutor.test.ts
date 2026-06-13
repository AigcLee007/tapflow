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
      generationStatus: 'generating',
      lastEditType: 'erase',
      modelId: 'nano-banana-pro',
      routeId: 'nano-banana-pro-line1',
      routeKey: 'nano-banana-pro-line1',
      status: 'running',
    }));
    expect(targetNode?.data.imageEditRequest).toEqual(expect.objectContaining({
      editType: 'erase',
      prompt: 'Remove the highlighted object',
      sourceNodeId: sourceNode.id,
    }));
    expect(targetNode?.data.params).toEqual(expect.objectContaining({
      mask: 'data:image/png;base64,mask',
      maskMode: 'brush',
    }));
  });
});
