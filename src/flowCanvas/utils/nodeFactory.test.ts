import { describe, expect, it } from 'vitest';

import { createFlowNode } from './nodeFactory';

describe('nodeFactory route defaults', () => {
  it('sets image node routeKey to image.default', () => {
    const node = createFlowNode('image', { x: 10, y: 10 });
    expect(node.data.routeKey).toBe('image.default');
  });

  it('sets video node routeKey to video.default', () => {
    const node = createFlowNode('video', { x: 20, y: 20 });
    expect(node.data.routeKey).toBe('video.default');
  });

  it('sets text node model and routeKey to GPT-5.5 defaults', () => {
    const node = createFlowNode('text', { x: 30, y: 30 });
    expect(node.data.modelId).toBe('gpt-5.5');
    expect(node.data.routeKey).toBe('text.gpt-5-5');
  });
});

