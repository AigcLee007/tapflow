import { describe, expect, test } from 'vitest';

import { applyTemplateInputValues, validateTemplateInputDefinitions } from './templateInputSchema';

const graph = {
  nodes: [{ id: 'prompt', data: { prompt: 'source', assetId: 'old-asset', params: { ratio: '1:1', count: 1 } } }],
  edges: [],
};

describe('template input schema', () => {
  test('rejects duplicate IDs and fields outside node data', () => {
    expect(() => validateTemplateInputDefinitions([
      { id: 'subject', label: 'Subject', required: true, type: 'text', target: { nodeId: 'prompt', fieldPath: 'data.prompt' } },
      { id: 'subject', label: 'Other', required: false, type: 'text', target: { nodeId: 'prompt', fieldPath: 'position.x' } },
    ], graph)).toThrow(/duplicate|node data/i);
  });

  test('substitutes text, asset, enum and number into a cloned graph', () => {
    const inputs = [
      { id: 'subject', label: 'Subject', required: true, type: 'text' as const, target: { nodeId: 'prompt', fieldPath: 'data.prompt' } },
      { id: 'image', label: 'Image', required: true, type: 'asset' as const, target: { nodeId: 'prompt', fieldPath: 'data.assetId' } },
      { id: 'ratio', label: 'Ratio', required: false, type: 'enum' as const, options: ['1:1', '16:9'], target: { nodeId: 'prompt', fieldPath: 'data.params.ratio' } },
      { id: 'count', label: 'Count', required: false, type: 'number' as const, target: { nodeId: 'prompt', fieldPath: 'data.params.count' } },
    ];

    const result = applyTemplateInputValues(graph, inputs, { subject: 'lamp', image: 'asset-123', ratio: '16:9', count: 3 });

    expect(result.nodes[0].data).toMatchObject({ prompt: 'lamp', assetId: 'asset-123', params: { ratio: '16:9', count: 3 } });
    expect(graph.nodes[0].data).toEqual({ prompt: 'source', assetId: 'old-asset', params: { ratio: '1:1', count: 1 } });
  });

  test('requires values and accepts declared defaults', () => {
    const inputs = [{ id: 'subject', label: 'Subject', required: true, type: 'text' as const, defaultValue: 'chair', target: { nodeId: 'prompt', fieldPath: 'data.prompt' } }];
    expect(applyTemplateInputValues(graph, inputs, {}).nodes[0].data.prompt).toBe('chair');
    expect(() => applyTemplateInputValues(graph, [{ ...inputs[0], defaultValue: undefined }], {})).toThrow(/required/i);
  });

  test('allows falsy values but rejects prototype-polluting paths', () => {
    const falsyGraph = { nodes: [{ id: 'node', data: { enabled: false, count: 0, label: '' } }], edges: [] };
    expect(() => validateTemplateInputDefinitions([{ id: 'enabled', label: 'Enabled', required: false, type: 'text', target: { nodeId: 'node', fieldPath: 'data.enabled' } }], falsyGraph)).not.toThrow();
    for (const fieldPath of ['data.__proto__.polluted', 'data.constructor.x', 'data.prototype.x']) {
      expect(() => validateTemplateInputDefinitions([{ id: 'unsafe', label: 'Unsafe', required: false, type: 'text', target: { nodeId: 'node', fieldPath } }], falsyGraph)).toThrow(/unsafe|data field/i);
    }
  });
});
