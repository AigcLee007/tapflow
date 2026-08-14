import { describe, expect, test } from 'vitest';

import { offsetTemplateGraphForInsert } from './templateGraph';

describe('offsetTemplateGraphForInsert', () => {
  test('moves template nodes around the requested center and rewrites ids', () => {
    const result = offsetTemplateGraphForInsert({
      graph: {
        nodes: [
          {
            id: 'a',
            type: 'text',
            position: { x: 0, y: 0 },
            data: { kind: 'text', title: 'A' },
          } as any,
        ],
        edges: [],
      },
      center: { x: 500, y: 300 },
      idPrefix: 'tpl',
    });

    expect(result.nodes[0].id).toMatch(/^tpl-/);
    expect(result.nodes[0].position.x).toBe(500);
    expect(result.nodes[0].position.y).toBe(300);
  });

  test('applies declared input values before cloning without mutating the source graph', () => {
    const source = {
      nodes: [{ id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { kind: 'text', title: 'A', text: 'source' } } as any],
      edges: [],
    };
    const result = offsetTemplateGraphForInsert({
      graph: source,
      center: { x: 0, y: 0 },
      inputSchema: [{ id: 'copy', label: 'Copy', required: true, type: 'text', target: { nodeId: 'a', fieldPath: 'data.text' } }],
      inputValues: { copy: 'changed' },
    });
    expect(result.nodes[0].data.text).toBe('changed');
    expect(source.nodes[0].data.text).toBe('source');
  });
});
