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
});

