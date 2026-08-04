import { describe, expect, it } from 'vitest';

import { createFlowNode } from './nodeFactory';

describe('nodeFactory route defaults', () => {
  it('sets image node routeKey to image.default', () => {
    const node = createFlowNode('image', { x: 10, y: 10 });
    expect(node.data.routeKey).toBe('image.default');
  });

  it('leaves video node route unset until a catalog model is selected', () => {
    const node = createFlowNode('video', { x: 20, y: 20 });
    expect(node.data.routeKey).toBeUndefined();
  });

  it('creates video nodes at the canonical 16:9 dimensions', () => {
    const node = createFlowNode('video', { x: 20, y: 20 });
    expect(node.data.width).toBe(302);
    expect(node.data.height).toBe(170);
  });

  it('seeds video nodes with the canonical generation params', () => {
    const node = createFlowNode('video', { x: 20, y: 20 });
    expect(node.data.params).toEqual({
      videoGeneration: {
        schemaVersion: 2,
        mode: 'text_to_video',
        aspectRatio: '16:9',
        resolution: '720P',
        durationSeconds: 4,
        generateAudio: true,
        count: 1,
        cameraMotionId: null,
        visualTone: null,
        referenceInputs: [],
      },
    });
  });

  it('sets text nodes to the GPT-5.6-terra product route', () => {
    const node = createFlowNode('text', { x: 30, y: 30 });
    expect(node.data.modelId).toBe('gpt-5.6-terra');
    expect(node.data.routeKey).toBe('text.gpt-5-6-terra');
  });

  it('keeps explicit text model overrides', () => {
    const node = createFlowNode('text', { x: 30, y: 30 }, {
      modelId: 'claude-opus-5',
      routeKey: 'text.claude-opus-5',
    });
    expect(node.data.modelId).toBe('claude-opus-5');
    expect(node.data.routeKey).toBe('text.claude-opus-5');
  });

  it('creates a storyboard node with asset-id based cells', () => {
    const node = createFlowNode('storyboard', { x: 10, y: 20 });

    expect(node.type).toBe('storyboard');
    expect(node.data.kind).toBe('storyboard');
    expect(node.data.storyboard).toMatchObject({
      aspect: '16:9',
      grid: '3x2',
      selectedIndex: 0,
    });
    expect(node.data.storyboard?.cells).toHaveLength(6);
    expect(JSON.stringify(node.data.storyboard)).not.toMatch(/blob:|data:/);
  });

  it('creates director and video editor nodes with empty structured documents', () => {
    const director = createFlowNode('director3d', { x: 0, y: 0 });
    const editor = createFlowNode('video_editor', { x: 0, y: 0 });

    expect(director.data.director3d).toMatchObject({
      version: 1,
      scene: { gridVisible: true, units: 'meters' },
      actors: [],
      cameras: [],
      shots: [],
    });
    expect(editor.data.videoEditor).toMatchObject({
      version: 1,
      aspect: '16:9',
      resolution: '1920x1080',
    });
  });

  it('uses clean Chinese titles for production nodes', () => {
    expect(createFlowNode('storyboard', { x: 0, y: 0 }).data.title).toBe('故事板');
    expect(createFlowNode('director3d', { x: 0, y: 0 }).data.title).toBe('3D导演台');
    expect(createFlowNode('video_editor', { x: 0, y: 0 }).data.title).toBe('剪辑工程');
  });
});
