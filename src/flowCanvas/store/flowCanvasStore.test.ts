import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowCanvasStore } from './flowCanvasStore';
import { buildAssetBackedNodeData } from '../utils/assetNodeData';

describe('flowCanvasStore upstream image references', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it('keeps asset-backed image node data and selection when inserted from asset library', () => {
    const node = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 120, y: 80 },
      buildAssetBackedNodeData({
        durationMs: null,
        height: 768,
        id: 'asset-inserted',
        mimeType: 'image/png',
        originalFilename: 'inserted.png',
        previewUrl: 'https://cdn.test/inserted-preview.png',
        source: 'asset-library',
        title: 'Inserted Asset',
        width: 1024,
      }),
      { selected: true },
    );

    const insertedNode = useFlowCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id);

    expect(insertedNode?.selected).toBe(true);
    expect(insertedNode?.data).toEqual(expect.objectContaining({
      assetId: 'asset-inserted',
      assetIds: ['asset-inserted'],
      originalImageUrl: 'https://cdn.test/inserted-preview.png',
      thumbnailUrl: 'https://cdn.test/inserted-preview.png',
      title: 'Inserted Asset',
    }));
  });

  it('uses explicit natural dimensions to preserve portrait aspect ratios for asset-library insertions', () => {
    const node = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 120, y: 80 },
      buildAssetBackedNodeData(
        {
          durationMs: null,
          height: 1024,
          id: 'asset-portrait',
          mimeType: 'image/png',
          originalFilename: 'portrait.png',
          previewUrl: 'https://cdn.test/portrait-preview.png',
          source: 'asset-library',
          title: 'Portrait Asset',
          width: 1024,
        },
        {
          naturalHeight: 1600,
          naturalWidth: 900,
          previewUrl: 'https://cdn.test/portrait-preview.png',
        },
      ),
      { selected: true },
    );

    const insertedNode = useFlowCanvasStore.getState().nodes.find((candidate) => candidate.id === node.id);

    expect(insertedNode?.data).toEqual(expect.objectContaining({
      aspectRatio: 900 / 1600,
      height: 302,
      naturalHeight: 1600,
      naturalWidth: 900,
      width: 170,
    }));
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

  it('rebuilds upstream refs when a temporary reference upload restores its local preview url later', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      mimeType: 'image/png',
      referenceUploadId: 'reference-upload-1',
      source: 'canvas-upload',
      title: 'Temporary Reference',
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
      originalImageUrl: 'blob:http://localhost/reference-preview',
      thumbnailUrl: 'blob:http://localhost/reference-preview',
    });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamImageRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({
        id: source.id,
        imageUrl: 'blob:http://localhost/reference-preview',
        key: `upstream:${source.id}`,
        referenceUploadId: 'reference-upload-1',
        source: 'upstream',
        title: 'Temporary Reference',
      }),
    ]);
  });

  it('creates a single panorama viewer node for a panorama image and reuses it', () => {
    const imageNode = useFlowCanvasStore.getState().addNode('image', { x: 80, y: 120 }, {
      generationMode: 'panorama_360',
      metadata: {
        mediaKind: 'pano360',
        projection: 'equirectangular',
      },
      thumbnailUrl: 'https://cdn.test/panorama-preview.png',
      title: 'Panorama Source',
    });

    const firstViewerId = (useFlowCanvasStore.getState() as unknown as {
      ensurePanoramaViewerForImageNode: (nodeId: string) => string;
    }).ensurePanoramaViewerForImageNode(imageNode.id);
    const secondViewerId = (useFlowCanvasStore.getState() as unknown as {
      ensurePanoramaViewerForImageNode: (nodeId: string) => string;
    }).ensurePanoramaViewerForImageNode(imageNode.id);

    const state = useFlowCanvasStore.getState();
    const viewerNodes = state.nodes.filter((node) => node.type === 'panorama_viewer');

    expect(firstViewerId).toBe(secondViewerId);
    expect(viewerNodes).toHaveLength(1);
    expect(viewerNodes[0]?.data).toMatchObject({
      kind: 'panorama_viewer',
      panoramaSourceNodeId: imageNode.id,
      title: '360 全景查看',
    });
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: imageNode.id,
        target: firstViewerId,
      }),
    ]));
  });

  it('merges template graph into canvas and clears prior selection', () => {
    const existing = useFlowCanvasStore.getState().addNode(
      'text',
      { x: 0, y: 0 },
      { title: 'Existing Text' },
      { selected: true },
    );

    useFlowCanvasStore.getState().mergeTemplateGraph({
      edges: [
        {
          id: 'template-edge-1',
          source: 'template-node-1',
          target: 'template-node-2',
          type: 'smart',
          data: { dataType: 'text' },
          selected: true,
        } as any,
      ],
      nodes: [
        {
          id: 'template-node-1',
          type: 'text',
          position: { x: 100, y: 120 },
          data: { kind: 'text', title: 'Template Text A' },
          selected: true,
        } as any,
        {
          id: 'template-node-2',
          type: 'image',
          position: { x: 300, y: 120 },
          data: { kind: 'image', title: 'Template Image B' },
          selected: true,
        } as any,
      ],
    });

    const state = useFlowCanvasStore.getState();
    const existingNode = state.nodes.find((node) => node.id === existing.id);
    const selectedTemplateNodes = state.nodes.filter((node) => node.id.startsWith('template-node') && node.selected);

    expect(existingNode?.selected).toBe(false);
    expect(selectedTemplateNodes).toHaveLength(2);
    expect(state.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-edge-1',
          selected: false,
        }),
      ]),
    );
  });

  it('restores a graph snapshot and clears transient canvas state', () => {
    const state = useFlowCanvasStore.getState();
    const source = state.addNode(
      'image',
      { x: 40, y: 60 },
      {
        title: 'Snapshot Source',
        thumbnailUrl: 'https://cdn.test/snapshot-source.png',
      },
      { selected: true },
    );
    const target = state.addNode(
      'text',
      { x: 280, y: 60 },
      { title: 'Snapshot Target' },
      { selected: false },
    );

    state.onConnect({
      source: source.id,
      sourceHandle: 'right',
      target: target.id,
      targetHandle: 'left',
    });
    state.openImageTool(source.id, 'crop');
    state.openContextMenu(120, 180, source.id);

    useFlowCanvasStore.getState().restoreGraphSnapshot({
      edges: [
        {
          id: 'restored-edge-1',
          source: 'restored-image-1',
          target: 'restored-text-1',
          type: 'smart',
          data: { dataType: 'image' },
          selected: true,
        } as any,
      ],
      nodes: [
        {
          id: 'restored-image-1',
          type: 'image',
          position: { x: 160, y: 140 },
          data: {
            kind: 'image',
            title: 'Restored Image',
            thumbnailUrl: 'https://cdn.test/restored-image.png',
          },
          selected: true,
        } as any,
        {
          id: 'restored-text-1',
          type: 'text',
          position: { x: 460, y: 140 },
          data: {
            kind: 'text',
            title: 'Restored Prompt',
          },
        } as any,
      ],
      viewport: { x: 32, y: 64, zoom: 0.72 },
    });

    const restored = useFlowCanvasStore.getState();
    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toEqual([
      expect.objectContaining({
        id: 'restored-edge-1',
        selected: false,
      }),
    ]);
    expect(restored.viewport).toEqual({ x: 32, y: 64, zoom: 0.72 });
    expect(restored.activeImageTool).toBeNull();
    expect(restored.contextMenu).toBeNull();
    expect(restored.selectedNodeCount).toBe(1);
    expect(restored.graphIndex.upstreamImageRefsByNodeId['restored-text-1']).toEqual([
      expect.objectContaining({
        id: 'restored-image-1',
        imageUrl: 'https://cdn.test/restored-image.png',
        key: 'upstream:restored-image-1',
      }),
    ]);
  });

  it('adds one generated child image node per split-mode result', () => {
    const parent = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 160, y: 120 },
      {
        title: 'Parent Image',
        width: 220,
        height: 280,
      },
      { selected: true },
    );

    const createdIds = useFlowCanvasStore.getState().addGeneratedImageChildren?.(
      parent.id,
      [
        {
          assetId: 'asset-child-1',
          downloadUrl: 'https://cdn.test/child-1.png',
          height: 960,
          mimeType: 'image/png',
          title: '生成结果1',
          width: 720,
        },
        {
          assetId: 'asset-child-2',
          downloadUrl: 'https://cdn.test/child-2.png',
          height: 960,
          mimeType: 'image/png',
          title: '生成结果2',
          width: 720,
        },
      ],
    );

    expect(createdIds).toHaveLength(2);
    const state = useFlowCanvasStore.getState();
    const childNodes = state.nodes.filter((node) => createdIds?.includes(node.id));
    const childEdges = state.edges.filter((edge) => edge.source === parent.id && createdIds?.includes(edge.target));

    expect(childNodes).toHaveLength(2);
    expect(childEdges).toHaveLength(2);
    expect(childNodes[0]?.data).toEqual(expect.objectContaining({
      assetId: 'asset-child-1',
      assetIds: ['asset-child-1'],
      thumbnailUrl: 'https://cdn.test/child-1.png',
      title: '生成结果1',
    }));
    expect(childNodes[1]?.data).toEqual(expect.objectContaining({
      assetId: 'asset-child-2',
      assetIds: ['asset-child-2'],
      thumbnailUrl: 'https://cdn.test/child-2.png',
      title: '生成结果2',
    }));
  });
  it('connects nodes through the targeted helper without duplicating edges', () => {
    const source = useFlowCanvasStore.getState().addNode(
      'text',
      { x: 0, y: 0 },
      { title: 'Source Prompt' },
    );
    const target = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 320, y: 0 },
      { title: 'Target Image' },
    );

    useFlowCanvasStore.getState().connectNodes(source.id, target.id, 'out', 'in');
    useFlowCanvasStore.getState().connectNodes(source.id, target.id, 'out', 'in');

    const state = useFlowCanvasStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toEqual(
      expect.objectContaining({
        source: source.id,
        sourceHandle: 'out',
        target: target.id,
        targetHandle: 'in',
      }),
    );
  });

  it('selects and removes nodes through targeted helpers', () => {
    const keepNode = useFlowCanvasStore.getState().addNode(
      'text',
      { x: 0, y: 0 },
      { title: 'Keep Me' },
      { selected: true },
    );
    const removeNode = useFlowCanvasStore.getState().addNode(
      'image',
      { x: 320, y: 0 },
      { title: 'Remove Me' },
    );

    useFlowCanvasStore.getState().selectNodesByIds([removeNode.id]);

    let state = useFlowCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === keepNode.id)?.selected).toBe(false);
    expect(state.nodes.find((node) => node.id === removeNode.id)?.selected).toBe(true);
    expect(state.selectedNodeCount).toBe(1);

    useFlowCanvasStore.getState().removeNodesByIds([removeNode.id]);

    state = useFlowCanvasStore.getState();
    expect(state.nodes.map((node) => node.id)).toEqual([keepNode.id]);
    expect(state.selectedNodeCount).toBe(0);
  });
});
