import { beforeEach, describe, expect, it } from 'vitest';

import { useFlowCanvasStore } from './flowCanvasStore';
import { buildAssetBackedNodeData } from '../utils/assetNodeData';
import { normalizeVideoGenerationParams } from '../video/videoGenerationParams';

describe('flowCanvasStore upstream image references', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
  });

  it('indexes text and previewless asset-backed image inputs in incoming edge order', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, {
      generationPrompt: 'fallback prompt',
      text: 'stale node text',
      title: 'Scene brief',
    });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 240 }, {
      assetId: 'asset-previewless-image',
      durationMs: 1_200,
      title: 'Reference still',
    });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });
    const runtimeText = 'r'.repeat(80);

    useFlowCanvasStore.setState({
      nodeOutputByNodeId: {
        [text.id]: { text: runtimeText },
      },
    });
    useFlowCanvasStore.getState().onConnect({ source: text.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({
        edgeId: expect.any(String),
        inputKey: `upstream:${text.id}`,
        kind: 'text',
        previewState: 'unavailable',
        source: 'upstream',
        sourceNodeId: text.id,
        sourceRevision: expect.any(String),
        textExcerpt: `${'r'.repeat(77)}...`,
        title: 'Scene brief',
      }),
      expect.objectContaining({
        assetId: 'asset-previewless-image',
        durationMs: 1_200,
        edgeId: expect.any(String),
        inputKey: `upstream:${image.id}`,
        kind: 'image',
        previewState: 'unavailable',
        source: 'upstream',
        sourceNodeId: image.id,
        sourceRevision: expect.any(String),
        title: 'Reference still',
      }),
    ]);
  });

  it('prefers runtime text, then node text, then generation prompt for ordered text inputs', () => {
    const runtime = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, {
      generationPrompt: 'runtime generation prompt',
      text: 'runtime node text',
      title: 'Runtime source',
    });
    const nodeText = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 180 }, {
      generationPrompt: 'node text generation prompt',
      text: 'node text fallback',
      title: 'Node text source',
    });
    const prompt = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 360 }, {
      generationPrompt: 'generation prompt fallback',
      text: '   ',
      title: 'Prompt source',
    });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.setState({
      nodeOutputByNodeId: {
        [runtime.id]: { text: 'r'.repeat(80) },
        [nodeText.id]: { text: '   ' },
        [prompt.id]: { text: '' },
      },
    });
    useFlowCanvasStore.getState().onConnect({ source: runtime.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: nodeText.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: prompt.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({ inputKey: `upstream:${runtime.id}`, textExcerpt: `${'r'.repeat(77)}...` }),
      expect.objectContaining({ inputKey: `upstream:${nodeText.id}`, textExcerpt: 'node text fallback' }),
      expect.objectContaining({ inputKey: `upstream:${prompt.id}`, textExcerpt: 'generation prompt fallback' }),
    ]);
  });

  it('indexes ready upstream video and audio with duration and source revisions', () => {
    const video = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      assetId: 'asset-ready-video',
      durationMs: 4_000,
      posterUrl: 'https://cdn.test/ready-video-poster.jpg',
      title: 'Ready video',
    });
    const audio = useFlowCanvasStore.getState().addNode('audio', { x: 0, y: 240 }, {
      assetId: 'asset-ready-audio',
      durationMs: 1_500,
      previewUrl: 'https://cdn.test/ready-audio.mp3',
      title: 'Ready audio',
    });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().onConnect({ source: video.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: audio.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({
        assetId: 'asset-ready-video',
        durationMs: 4_000,
        inputKey: `upstream:${video.id}`,
        kind: 'video',
        previewState: 'ready',
        previewUrl: 'https://cdn.test/ready-video-poster.jpg',
        sourceRevision: String(video.data.updatedAt),
      }),
      expect.objectContaining({
        assetId: 'asset-ready-audio',
        durationMs: 1_500,
        inputKey: `upstream:${audio.id}`,
        kind: 'audio',
        previewState: 'ready',
        previewUrl: 'https://cdn.test/ready-audio.mp3',
        sourceRevision: String(audio.data.updatedAt),
      }),
    ]);
  });

  it('rebuilds unified input refs when a connected source runtime output changes', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, {
      generationPrompt: 'stale prompt',
      title: 'Text source',
    });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 240 }, { title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().onConnect({ source: text.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().setNodeRuntimeOutput(text.id, { text: 'latest runtime text' });
    useFlowCanvasStore.getState().setNodeRuntimeOutput(image.id, {
      assets: [{
        assetId: 'runtime-image-asset',
        downloadUrl: 'https://cdn.test/runtime-image.png',
        kind: 'image',
        mimeType: 'image/png',
      }],
    });

    expect(useFlowCanvasStore.getState().nodeOutputByNodeId).toMatchObject({
      [text.id]: { text: 'latest runtime text' },
      [image.id]: { assets: [expect.objectContaining({ assetId: 'runtime-image-asset' })] },
    });
    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({ inputKey: `upstream:${text.id}`, textExcerpt: 'latest runtime text' }),
      expect.objectContaining({
        assetId: 'runtime-image-asset',
        inputKey: `upstream:${image.id}`,
        previewState: 'ready',
        previewUrl: 'https://cdn.test/runtime-image.png',
      }),
    ]);

    useFlowCanvasStore.getState().setNodeRuntimeOutput(image.id, null);

    expect(useFlowCanvasStore.getState().nodeOutputByNodeId[image.id]).toBeUndefined();
    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]?.[1]).toEqual(expect.objectContaining({
      inputKey: `upstream:${image.id}`,
      previewState: 'unavailable',
    }));
  });

  it('updates multiple runtime outputs and graph index in one store transition', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Text source' });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 240 }, { title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().onConnect({ source: text.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    let notifications = 0;
    const unsubscribe = useFlowCanvasStore.subscribe(() => {
      notifications += 1;
    });
    useFlowCanvasStore.getState().setNodeRuntimeOutputs({
      [text.id]: { text: 'batched runtime text' },
      [image.id]: {
        assets: [{
          assetId: 'batched-runtime-image',
          downloadUrl: 'https://cdn.test/batched-runtime-image.png',
          kind: 'image',
          mimeType: 'image/png',
        }],
      },
    });
    unsubscribe();

    expect(notifications).toBe(1);
    expect(useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id]).toEqual([
      expect.objectContaining({ inputKey: `upstream:${text.id}`, textExcerpt: 'batched runtime text' }),
      expect.objectContaining({
        assetId: 'batched-runtime-image',
        inputKey: `upstream:${image.id}`,
        previewUrl: 'https://cdn.test/batched-runtime-image.png',
      }),
    ]);
  });

  it('keeps only the first unified input seed for duplicate source edges', () => {
    const source = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Text source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 420, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: 'out-a', target: target.id, targetHandle: 'in-a' });
    const firstEdgeId = useFlowCanvasStore.getState().edges[0]?.id;
    useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: 'out-b', target: target.id, targetHandle: 'in-b' });

    const inputs = useFlowCanvasStore.getState().graphIndex.upstreamInputRefsByNodeId[target.id];
    expect(inputs).toHaveLength(1);
    expect(inputs?.[0]).toEqual(expect.objectContaining({ edgeId: firstEdgeId, inputKey: `upstream:${source.id}` }));
  });

  it('removes only the selected text input edge from an image target', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Prompt source' });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 180 }, { title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Image target' });

    useFlowCanvasStore.getState().onConnect({ source: text.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    (useFlowCanvasStore.getState() as unknown as { removeNodeInput: (targetNodeId: string, inputKey: string) => void })
      .removeNodeInput(target.id, `upstream:${text.id}`);

    const state = useFlowCanvasStore.getState();
    const nextTarget = state.nodes.find((node) => node.id === target.id)!;
    expect(state.edges).toEqual([expect.objectContaining({ source: image.id, target: target.id })]);
    expect(nextTarget.data.inputOrder).toEqual([`upstream:${image.id}`]);
    expect(nextTarget.data.referenceOrder).toEqual([`upstream:${image.id}`]);
  });

  it('does not mutate canvas state when removing an input key absent from its target', () => {
    const target = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Image target' });
    useFlowCanvasStore.getState().markClean();
    const before = useFlowCanvasStore.getState();
    const node = before.nodes.find((candidate) => candidate.id === target.id)!;

    (before as unknown as { removeNodeInput: (targetNodeId: string, inputKey: string) => void })
      .removeNodeInput(target.id, 'asset:missing');

    const after = useFlowCanvasStore.getState();
    expect(after.history).toHaveLength(before.history.length);
    expect(after.isDirty).toBe(false);
    expect(after.nodes).toBe(before.nodes);
    expect(after.nodes.find((candidate) => candidate.id === target.id)).toBe(node);
    expect(after.graphIndex).toBe(before.graphIndex);
  });

  it('reorders mixed image inputs without placing non-images in image reference order', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Prompt source' });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 180 }, { title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Image target' });

    [text, image].forEach((source) => useFlowCanvasStore.getState().onConnect({
      source: source.id, sourceHandle: 'out', target: target.id, targetHandle: 'in',
    }));
    (useFlowCanvasStore.getState() as unknown as { reorderNodeInputs: (targetNodeId: string, inputKeys: string[]) => void })
      .reorderNodeInputs(target.id, [`upstream:${image.id}`]);

    const nextTarget = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)!;
    expect(nextTarget.data.inputOrder).toEqual([`upstream:${image.id}`, `upstream:${text.id}`]);
    expect(nextTarget.data.referenceOrder).toEqual([`upstream:${image.id}`]);
  });

  it('does not mutate canvas state when a reorder already matches effective input order', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Prompt source' });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 180 }, { title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, { title: 'Image target' });
    [text, image].forEach((source) => useFlowCanvasStore.getState().onConnect({
      source: source.id, sourceHandle: 'out', target: target.id, targetHandle: 'in',
    }));
    useFlowCanvasStore.getState().markClean();
    const before = useFlowCanvasStore.getState();
    const targetNode = before.nodes.find((candidate) => candidate.id === target.id)!;

    (before as unknown as { reorderNodeInputs: (targetNodeId: string, inputKeys: string[]) => void })
      .reorderNodeInputs(target.id, [`upstream:${text.id}`, `upstream:${image.id}`, `upstream:${text.id}`, 'stale']);

    const after = useFlowCanvasStore.getState();
    expect(after.history).toHaveLength(before.history.length);
    expect(after.isDirty).toBe(false);
    expect(after.nodes).toBe(before.nodes);
    expect(after.nodes.find((candidate) => candidate.id === target.id)).toBe(targetNode);
    expect(after.nodes.find((candidate) => candidate.id === target.id)?.data.updatedAt).toBe(targetNode.data.updatedAt);
    expect(after.graphIndex).toBe(before.graphIndex);
  });

  it('restores typed upstream media references from a legacy video project without treating text as media', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'legacy-inputs', title: 'Legacy inputs', version: 1, updatedAt: Date.now(), viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'text-source', type: 'text', position: { x: 0, y: 0 }, data: { kind: 'text', title: 'Text' } },
        { id: 'image-source', type: 'image', position: { x: 0, y: 120 }, data: { kind: 'image', title: 'Image' } },
        { id: 'video-source', type: 'video', position: { x: 0, y: 240 }, data: { kind: 'video', title: 'Video' } },
        { id: 'audio-source', type: 'audio', position: { x: 0, y: 360 }, data: { kind: 'audio', title: 'Audio' } },
        { id: 'video-target', type: 'video', position: { x: 400, y: 0 }, data: { kind: 'video', title: 'Target' } },
      ] as any,
      edges: ['text-source', 'image-source', 'video-source', 'audio-source'].map((source, index) => ({
        id: `legacy-edge-${index}`, source, target: 'video-target', type: 'smart', data: { dataType: 'any' },
      })) as any,
    });

    const state = useFlowCanvasStore.getState();
    const target = state.nodes.find((node) => node.id === 'video-target')!;
    expect(target.data.inputOrder).toEqual(['upstream:text-source', 'upstream:image-source', 'upstream:video-source', 'upstream:audio-source']);
    expect(normalizeVideoGenerationParams(target.data).params.referenceInputs).toEqual([
      expect.objectContaining({ mediaKind: 'image', source: { kind: 'upstream', id: 'image-source' } }),
      expect.objectContaining({ mediaKind: 'video', source: { kind: 'upstream', id: 'video-source' } }),
      expect.objectContaining({ mediaKind: 'audio', source: { kind: 'upstream', id: 'audio-source' } }),
    ]);
  });

  it('keeps the most recent upstream image as the image-to-video reference while restoring every input edge', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'legacy-image-to-video', title: 'Legacy image to video', version: 1, updatedAt: Date.now(), viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'first-image', type: 'image', position: { x: 0, y: 0 }, data: { kind: 'image', title: 'First image' } },
        { id: 'second-image', type: 'image', position: { x: 0, y: 160 }, data: { kind: 'image', title: 'Second image' } },
        {
          id: 'video-target', type: 'video', position: { x: 400, y: 0 }, data: {
            kind: 'video',
            params: { videoGeneration: { ...normalizeVideoGenerationParams({}).params, mode: 'image_to_video', referenceInputs: [] } },
            title: 'Video target',
          },
        },
      ] as any,
      edges: [
        { id: 'first-edge', source: 'first-image', target: 'video-target', type: 'smart', data: { dataType: 'any' } },
        { id: 'second-edge', source: 'second-image', target: 'video-target', type: 'smart', data: { dataType: 'any' } },
      ] as any,
    });

    const target = useFlowCanvasStore.getState().nodes.find((node) => node.id === 'video-target')!;
    expect(target.data.inputOrder).toEqual(['upstream:first-image', 'upstream:second-image']);
    expect(normalizeVideoGenerationParams(target.data).params.referenceInputs).toEqual([
      expect.objectContaining({
        mediaKind: 'image',
        role: 'main_image',
        source: { kind: 'upstream', id: 'second-image' },
      }),
    ]);
  });

  it('removes a direct asset input only from its owning target', () => {
    const first = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, {
      referenceAssetItemIds: ['asset-one', 'asset-two'],
      referenceOrder: ['asset:asset-one', 'asset:asset-two'],
      inputOrder: ['asset:asset-one', 'asset:asset-two'],
    });
    const second = useFlowCanvasStore.getState().addNode('image', { x: 400, y: 0 }, {
      referenceAssetItemIds: ['asset-one'], referenceOrder: ['asset:asset-one'], inputOrder: ['asset:asset-one'],
    });

    (useFlowCanvasStore.getState() as unknown as { removeNodeInput: (targetNodeId: string, inputKey: string) => void })
      .removeNodeInput(first.id, 'asset:asset-one');

    const state = useFlowCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === first.id)?.data).toMatchObject({
      referenceAssetItemIds: ['asset-two'], referenceOrder: ['asset:asset-two'], inputOrder: ['asset:asset-two'],
    });
    expect(state.nodes.find((node) => node.id === second.id)?.data).toMatchObject({
      referenceAssetItemIds: ['asset-one'], referenceOrder: ['asset:asset-one'], inputOrder: ['asset:asset-one'],
    });
  });

  it('retains a direct video asset reference and role when an upstream image connects', () => {
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Upstream image' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 400, y: 0 }, {
      params: {
        videoGeneration: {
          ...normalizeVideoGenerationParams({}).params,
          mode: 'image_to_video',
          referenceInputs: [{
            mediaKind: 'image', order: 0, referenceKey: 'asset:hero-image:0', role: 'main_image',
            source: { kind: 'asset', id: 'hero-image' },
          }],
        },
      },
    });

    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    const references = normalizeVideoGenerationParams(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).params.referenceInputs;
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceKey: 'asset:hero-image:0', role: 'main_image', source: { kind: 'asset', id: 'hero-image' } }),
      expect.objectContaining({ referenceKey: `upstream:${image.id}`, source: { kind: 'upstream', id: image.id } }),
    ]));
  });

  it('deletes selected source nodes through input reconciliation', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Selected source' }, { selected: true });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 400, y: 0 }, { title: 'Video target' });
    useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().selectNodesByIds([source.id]);

    useFlowCanvasStore.getState().deleteSelectedNodes();

    const nextTarget = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)!;
    expect(nextTarget.data.inputOrder).toEqual([]);
    expect(nextTarget.data.referenceOrder).toEqual([]);
    expect(normalizeVideoGenerationParams(nextTarget.data).params.referenceInputs).toEqual([]);
  });

  it('removes and reorders video inputs without affecting unrelated assets or media roles', () => {
    const text = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Prompt source' });
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 160 }, { title: 'Image source' });
    const audio = useFlowCanvasStore.getState().addNode('audio', { x: 0, y: 320 }, { title: 'Audio source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 480, y: 0 }, {
      params: {
        videoGeneration: {
          ...normalizeVideoGenerationParams({}).params,
          referenceInputs: [{
            mediaKind: 'image', order: 0, referenceKey: 'asset:direct-image:0', role: 'reference_image',
            source: { kind: 'asset', id: 'direct-image' },
          }],
        },
      },
    });
    [text, image, audio].forEach((source) => useFlowCanvasStore.getState().onConnect({
      source: source.id, sourceHandle: 'out', target: target.id, targetHandle: 'in',
    }));

    const actions = useFlowCanvasStore.getState() as unknown as {
      removeNodeInput: (targetNodeId: string, inputKey: string) => void;
      reorderNodeInputs: (targetNodeId: string, inputKeys: string[]) => void;
    };
    actions.removeNodeInput(target.id, `upstream:${text.id}`);
    actions.reorderNodeInputs(target.id, [`upstream:${audio.id}`, 'asset:direct-image', `upstream:${image.id}`]);

    const nextTarget = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)!;
    expect(nextTarget.data.inputOrder).toEqual([`upstream:${audio.id}`, 'asset:direct-image', `upstream:${image.id}`]);
    expect(normalizeVideoGenerationParams(nextTarget.data).params.referenceInputs).toEqual([
      expect.objectContaining({ order: 0, role: 'reference_audio', source: { kind: 'upstream', id: audio.id } }),
      expect.objectContaining({ order: 1, role: 'reference_image', source: { kind: 'asset', id: 'direct-image' } }),
      expect.objectContaining({ order: 2, source: { kind: 'upstream', id: image.id } }),
    ]);
  });

  it('retains distinct direct roles for one asset while removing exact duplicate references', () => {
    const firstFrame = {
      mediaKind: 'image' as const, order: 0, referenceKey: 'asset:shared-frame:first', role: 'first_frame' as const,
      source: { kind: 'asset' as const, id: 'shared-frame' },
    };
    const lastFrame = {
      mediaKind: 'image' as const, order: 1, referenceKey: 'asset:shared-frame:last', role: 'last_frame' as const,
      source: { kind: 'asset' as const, id: 'shared-frame' },
    };
    useFlowCanvasStore.getState().loadProject({
      id: 'direct-role-dedup', title: 'Direct role dedup', version: 1, updatedAt: Date.now(), viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [{
        id: 'video-target', type: 'video', position: { x: 0, y: 0 }, data: {
          kind: 'video',
          params: { videoGeneration: { ...normalizeVideoGenerationParams({}).params, mode: 'first_last_frame', referenceInputs: [firstFrame, lastFrame, { ...lastFrame }] } },
        },
      }] as any,
      edges: [],
    });

    useFlowCanvasStore.getState().setNodeRuntimeOutput('video-target', { text: 'runtime refresh' });

    const target = useFlowCanvasStore.getState().nodes.find((node) => node.id === 'video-target')!;
    expect(target.data.inputOrder).toEqual(['asset:shared-frame']);
    expect(normalizeVideoGenerationParams(target.data).params.referenceInputs).toEqual([
      expect.objectContaining({ order: 0, referenceKey: 'asset:shared-frame:first', role: 'first_frame', source: { kind: 'asset', id: 'shared-frame' } }),
      expect.objectContaining({ order: 1, referenceKey: 'asset:shared-frame:last', role: 'last_frame', source: { kind: 'asset', id: 'shared-frame' } }),
    ]);
  });

  it('keeps persisted nodes and dirty state unchanged for runtime-only output refreshes', () => {
    const source = useFlowCanvasStore.getState().addNode('text', { x: 0, y: 0 }, { title: 'Text source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 400, y: 0 }, { title: 'Video target' });
    useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().markClean();
    const nodesBefore = useFlowCanvasStore.getState().nodes;

    useFlowCanvasStore.getState().setNodeRuntimeOutput(source.id, { text: 'runtime-only prompt' });

    expect(useFlowCanvasStore.getState().nodes).toBe(nodesBefore);
    expect(useFlowCanvasStore.getState().isDirty).toBe(false);
  });

  it('persists and marks dirty only when runtime output creates a missing media reference', () => {
    useFlowCanvasStore.getState().loadProject({
      id: 'runtime-media-kind', title: 'Runtime media kind', version: 1, updatedAt: Date.now(), viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        { id: 'runtime-source', type: 'group', position: { x: 0, y: 0 }, data: { kind: 'group', title: 'Runtime source' } },
        { id: 'video-target', type: 'video', position: { x: 400, y: 0 }, data: { kind: 'video', title: 'Video target' } },
      ] as any,
      edges: [{ id: 'runtime-media-edge', source: 'runtime-source', target: 'video-target', type: 'smart', data: { dataType: 'any' } }] as any,
    });
    expect(useFlowCanvasStore.getState().isDirty).toBe(false);

    useFlowCanvasStore.getState().setNodeRuntimeOutput('runtime-source', {
      assets: [{ assetId: 'runtime-image', downloadUrl: 'https://cdn.test/runtime-image.png', kind: 'image', mimeType: 'image/png' }],
    });

    const state = useFlowCanvasStore.getState();
    expect(state.isDirty).toBe(true);
    expect(normalizeVideoGenerationParams(state.nodes.find((node) => node.id === 'video-target')?.data).params.referenceInputs).toEqual([
      expect.objectContaining({ mediaKind: 'image', source: { kind: 'upstream', id: 'runtime-source' } }),
    ]);
  });

  it('connects a selected upstream video as a typed dependency', () => {
    const source = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, {
      assetId: 'asset-video-source',
      kind: 'video',
      title: 'Video source',
    });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 320, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().connectVideoReference({
      mediaKind: 'video',
      referenceKey: `upstream:${source.id}:0`,
      role: 'reference_video',
      sourceNodeId: source.id,
      targetNodeId: target.id,
    });

    const state = useFlowCanvasStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({ source: source.id, target: target.id });
    expect(normalizeVideoGenerationParams(state.nodes.find((node) => node.id === target.id)?.data).params.referenceInputs).toEqual([
      expect.objectContaining({ mediaKind: 'video', role: 'reference_video', source: { kind: 'upstream', id: source.id } }),
    ]);
  });

  it('indexes upstream video and audio references with their authoritative media kinds', () => {
    const video = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, { assetId: 'asset-video', kind: 'video', title: 'Video source' });
    const audio = useFlowCanvasStore.getState().addNode('audio', { x: 0, y: 240 }, { assetId: 'asset-audio', kind: 'audio', title: 'Audio source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 320, y: 0 }, { title: 'Video target' });

    useFlowCanvasStore.getState().onConnect({ source: video.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });
    useFlowCanvasStore.getState().onConnect({ source: audio.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(useFlowCanvasStore.getState().graphIndex.upstreamMediaRefsByNodeId[target.id]).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'asset-video', id: video.id, mediaKind: 'video', title: 'Video source' }),
      expect.objectContaining({ assetId: 'asset-audio', id: audio.id, mediaKind: 'audio', title: 'Audio source' }),
    ]));
    expect(normalizeVideoGenerationParams(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).params.referenceInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaKind: 'video', source: { kind: 'upstream', id: video.id } }),
      expect.objectContaining({ mediaKind: 'audio', source: { kind: 'upstream', id: audio.id } }),
    ]));
  });

  it('assigns the image-to-video role when an image node is connected to a video node', () => {
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { kind: 'image', title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 320, y: 0 }, {
      kind: 'video',
      title: 'Video target',
      params: {
        videoGeneration: {
          ...normalizeVideoGenerationParams({}).params,
          mode: 'image_to_video',
        },
      },
    });

    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(normalizeVideoGenerationParams(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).params.referenceInputs).toEqual([
      expect.objectContaining({ mediaKind: 'image', role: 'main_image', source: { kind: 'upstream', id: image.id } }),
    ]);
  });

  it('retains a direct main image when an image-to-video canvas edge is connected', () => {
    const image = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { kind: 'image', title: 'Image source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 320, y: 0 }, {
      kind: 'video',
      title: 'Video target',
      params: {
        videoGeneration: {
          ...normalizeVideoGenerationParams({}).params,
          mode: 'image_to_video',
          referenceInputs: [{
            mediaKind: 'image',
            order: 0,
            referenceKey: 'asset:stale-image',
            role: 'main_image',
            source: { kind: 'asset', id: 'stale-image' },
          }],
        },
      },
    });

    useFlowCanvasStore.getState().onConnect({ source: image.id, sourceHandle: 'out', target: target.id, targetHandle: 'in' });

    expect(normalizeVideoGenerationParams(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).params.referenceInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaKind: 'image', role: 'main_image', source: { kind: 'upstream', id: image.id } }),
      expect.objectContaining({ mediaKind: 'image', role: 'main_image', source: { kind: 'asset', id: 'stale-image' } }),
    ]));
  });

  it('removes only the matching upstream reference when its dependency edge is removed', () => {
    const source = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, { kind: 'video', title: 'Video source' });
    const target = useFlowCanvasStore.getState().addNode('video', { x: 320, y: 0 }, { title: 'Video target' });
    useFlowCanvasStore.getState().connectVideoReference({
      mediaKind: 'video',
      referenceKey: `upstream:${source.id}:0`,
      role: 'reference_video',
      sourceNodeId: source.id,
      targetNodeId: target.id,
    });
    const currentTarget = useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)!;
    const currentParams = normalizeVideoGenerationParams(currentTarget.data).params;
    useFlowCanvasStore.getState().updateNodeData(target.id, {
      params: {
        ...(currentTarget.data.params ?? {}),
        videoGeneration: {
          ...currentParams,
          referenceInputs: [
            ...currentParams.referenceInputs,
            { mediaKind: 'image', order: 1, referenceKey: 'asset:asset-image:0', role: 'reference_image', source: { kind: 'asset', id: 'asset-image' } },
          ],
        },
      },
    });

    useFlowCanvasStore.getState().removeEdgesByIds([useFlowCanvasStore.getState().edges[0]!.id]);

    expect(normalizeVideoGenerationParams(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data).params.referenceInputs).toEqual([
      expect.objectContaining({ referenceKey: 'asset:asset-image:0', source: { kind: 'asset', id: 'asset-image' } }),
    ]);
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

  it('creates a new downstream panorama image node from a selected source image node', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 80, y: 120 }, {
      generationPrompt: 'moonlit forest',
      routeKey: 'image.default',
      title: 'Source',
    });

    const created = (useFlowCanvasStore.getState() as unknown as {
      createPanoramaTargetNodeFromSource: (sourceNodeId: string, settings: {
        aspectRatio: '2:1' | '21:9';
        modelId: string;
        routeKey: string;
        size: '1k' | '2k' | '4k';
      }) => {
        data: Record<string, unknown>;
        id: string;
      };
    }).createPanoramaTargetNodeFromSource(source.id, {
      aspectRatio: '21:9',
      modelId: 'gpt-image-2',
      routeKey: 'image.gpt-image-2.line2',
      size: '4k',
    });

    expect(created.data).toMatchObject({
      aspectRatio: 21 / 9,
      generationMode: 'panorama_360',
      height: 170,
      kind: 'image',
      modelId: 'gpt-image-2',
      routeKey: 'image.gpt-image-2.line2',
      width: 397,
      params: expect.objectContaining({
        aspectRatio: '21:9',
        aspect_ratio: '21:9',
        generationMode: 'panorama_360',
        imageSize: '4K',
        image_size: '4K',
        size: '4K',
      }),
    });
    expect(String(created.data.generationPrompt)).not.toContain('moonlit forest');
    expect(String(created.data.generationPrompt)).toContain('Use the connected reference image as the only scene source');
    expect(String(created.data.generationPrompt)).toContain('360-degree equirectangular panorama');
    expect(String(created.data.generationPrompt)).toContain('left edge and right edge must connect');
    expect(String(created.data.generationPrompt)).not.toBe('moonlit forest');
    expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === created.id)?.data.inputOrder).toEqual([`upstream:${source.id}`]);
    expect(useFlowCanvasStore.getState().edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: source.id,
        target: created.id,
      }),
    ]));
  });

  it('groups multi-capture result nodes into a panorama capture set', () => {
    const source = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'A' });
    const b = useFlowCanvasStore.getState().addNode('image', { x: 220, y: 0 }, { title: 'B' });
    const c = useFlowCanvasStore.getState().addNode('image', { x: 440, y: 0 }, { title: 'C' });
    const d = useFlowCanvasStore.getState().addNode('image', { x: 660, y: 0 }, { title: 'D' });

    const grouped = (useFlowCanvasStore.getState() as unknown as {
      groupNodesAsPanoramaCaptureSet: (nodeIds: string[], groupTitle: string) => {
        groupId: string;
      };
    }).groupNodesAsPanoramaCaptureSet(
      [source.id, b.id, c.id, d.id],
      '4-view capture',
    );

    expect(grouped.groupId).toBeTruthy();
    const state = useFlowCanvasStore.getState();
    const groupNode = state.nodes.find((node) => node.id === grouped.groupId);
    expect(groupNode?.type).toBe('group');
    expect(groupNode?.data.title).toBe('4-view capture');
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
    expect(state.nodes.find((node) => node.id === 'template-node-2')?.data.inputOrder).toEqual(['upstream:template-node-1']);
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
          type: 'video',
          position: { x: 460, y: 140 },
          data: {
            kind: 'video',
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
    expect(restored.nodes.find((node) => node.id === 'restored-text-1')?.data.inputOrder).toEqual(['upstream:restored-image-1']);
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
      inputOrder: [`upstream:${parent.id}`],
      thumbnailUrl: 'https://cdn.test/child-1.png',
      title: '生成结果1',
    }));
    expect(childNodes[1]?.data).toEqual(expect.objectContaining({
      assetId: 'asset-child-2',
      assetIds: ['asset-child-2'],
      inputOrder: [`upstream:${parent.id}`],
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
