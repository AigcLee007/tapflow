import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowCanvasStore } from './flowCanvasStore';
import { buildAssetBackedNodeData } from '../utils/assetNodeData';

describe('flowCanvasStore upstream image references', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it('indexes asset-backed image nodes with original image urls as upstream refs', () => {
    const source = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 0, y: 0 },
      {
        ...buildAssetBackedNodeData({
          durationMs: null,
          height: 768,
          id: 'asset-source',
          mimeType: 'image/png',
          originalFilename: 'source.png',
          source: 'asset-library',
          title: 'Source Asset',
          width: 1024,
        }),
        originalImageUrl: 'https://cdn.test/source-asset.png',
      },
    );
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Target Node' });

    useFlowCanvasStore.getState().onConnect({
      source: source.id,
      sourceHandle: 'right',
      target: target.id,
      targetHandle: 'left',
    });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamImageRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({
        edgeId: expect.any(String),
        id: source.id,
        imageUrl: 'https://cdn.test/source-asset.png',
        key: `upstream:${source.id}`,
        source: 'upstream',
        title: 'Source Asset',
      }),
    ]);
  });

  it('auto-adds upstream references when connecting image nodes', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      title: 'Source Image',
      thumbnailUrl: 'https://cdn.test/source.png',
    });
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Target Image' });

    useFlowCanvasStore.getState().onConnect({
      source: source.id,
      sourceHandle: 'right',
      target: target.id,
      targetHandle: 'left',
    });

    const nextTarget = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id);
    expect(nextTarget?.data.referenceOrder).toEqual([`upstream:${source.id}`]);
  });

  it('rebuilds upstream refs when an asset-backed upload gets its preview url later', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      assetId: 'uploaded-asset-1',
      assetIds: ['uploaded-asset-1'],
      source: 'upload',
      title: 'Uploaded Pig',
    });
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Target Image' });

    useFlowCanvasStore.getState().onConnect({
      source: source.id,
      sourceHandle: 'right',
      target: target.id,
      targetHandle: 'left',
    });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamImageRefsByNodeId[target.id]).toBeUndefined();

    useFlowCanvasStore.getState().updateNodeData(source.id, {
      thumbnailUrl: 'https://cdn.test/uploaded-pig-preview.png',
    });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamImageRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({
        id: source.id,
        imageUrl: 'https://cdn.test/uploaded-pig-preview.png',
        key: `upstream:${source.id}`,
        source: 'upstream',
        title: 'Uploaded Pig',
      }),
    ]);
  });
});
