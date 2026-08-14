import type { Edge, Node } from '@xyflow/react';
import { describe, expect, test } from 'vitest';

import type { FlowEdgeData, FlowNodeData, FlowRuntimeNodeOutput } from '../types';
import { buildGroupExecutionPlan } from './groupExecutionPlan';

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<FlowEdgeData>;

function node(
  id: string,
  kind: FlowNodeData['kind'],
  options: Partial<FlowNode> & { parentId?: string } = {},
): FlowNode {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: {
      createdAt: 1,
      generationPrompt: kind === 'group' || kind === 'upload' ? undefined : `${id} prompt`,
      generationStatus: 'idle',
      height: 180,
      kind,
      routeKey: kind === 'group' || kind === 'upload' ? undefined : `${kind}.default`,
      status: 'idle',
      title: id,
      updatedAt: 1,
      width: 280,
    },
    ...options,
  };
}

function edge(source: string, target: string, id = `${source}-${target}`): FlowEdge {
  return { id, source, target, data: { dataType: 'any' } };
}

describe('buildGroupExecutionPlan', () => {
  test('uses only direct executable group children in stable position order', () => {
    const group = node('group', 'group');
    const directLater = node('direct-later', 'image', { parentId: 'group', position: { x: 50, y: 10 } });
    const directFirst = node('direct-first', 'text', { parentId: 'group', position: { x: 10, y: 10 } });
    const nestedGroup = node('nested', 'group', { parentId: 'group' });
    const nestedChild = node('nested-child', 'video', { parentId: 'nested' });
    const outside = node('outside', 'image');

    const plan = buildGroupExecutionPlan(
      [group, directLater, directFirst, nestedGroup, nestedChild, outside],
      [],
      'group',
      {},
    );

    expect(plan.nodeIds).toEqual(['direct-first', 'direct-later']);
    expect(plan.layers).toEqual([['direct-first', 'direct-later']]);
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'NESTED_GROUP_UNSUPPORTED', nodeId: 'nested' }));
  });

  test('filters non-executable direct children and reports invalid executable configuration', () => {
    const group = node('group', 'group');
    const upload = node('upload', 'upload', { parentId: 'group' });
    const missingPrompt = node('missing-prompt', 'image', { parentId: 'group' });
    missingPrompt.data.title = 'Poster image';
    missingPrompt.data.generationPrompt = '  ';
    const missingRoute = node('missing-route', 'video', { parentId: 'group' });
    missingRoute.data.routeKey = undefined;

    const plan = buildGroupExecutionPlan([group, upload, missingPrompt, missingRoute], [], 'group', {});

    expect(plan.nodeIds).toEqual(['missing-prompt', 'missing-route']);
    expect(plan.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_GENERATION_PROMPT', nodeId: 'missing-prompt' }),
      expect.objectContaining({ code: 'MISSING_ROUTE', nodeId: 'missing-route' }),
    ]));
    expect(plan.blockingIssues.find((issue) => issue.nodeId === 'missing-prompt')?.message).toContain('Poster image');
  });

  test('allows a target without a local prompt when an in-group text node supplies it', () => {
    const group = node('group', 'group');
    const prompt = node('prompt', 'text', { parentId: 'group' });
    const target = node('target', 'image', { parentId: 'group' });
    target.data.generationPrompt = '';

    const plan = buildGroupExecutionPlan([group, prompt, target], [edge('prompt', 'target')], 'group', {});

    expect(plan.blockingIssues).not.toContainEqual(expect.objectContaining({ code: 'MISSING_GENERATION_PROMPT', nodeId: 'target' }));
  });

  test('blocks unsupported direct children instead of treating them as free executable work', () => {
    const group = node('group', 'group');
    const audio = node('audio', 'audio', { parentId: 'group' });
    const upload = node('upload', 'upload', { parentId: 'group' });

    const plan = buildGroupExecutionPlan([group, audio, upload], [], 'group', {});

    expect(plan.nodeIds).toEqual([]);
    expect(plan.estimatedCredits).toBe(0);
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_NODE_KIND', nodeId: 'audio' }));
    expect(plan.blockingIssues).not.toContainEqual(expect.objectContaining({ nodeId: 'upload' }));
  });

  test('builds deterministic topological layers for internal dependencies', () => {
    const group = node('group', 'group');
    const a = node('a', 'image', { parentId: 'group', position: { x: 100, y: 0 } });
    const b = node('b', 'image', { parentId: 'group', position: { x: 0, y: 0 } });
    const c = node('c', 'video', { parentId: 'group', position: { x: 0, y: 100 } });
    const d = node('d', 'text', { parentId: 'group', position: { x: 100, y: 100 } });

    const plan = buildGroupExecutionPlan([group, a, b, c, d], [edge('a', 'c'), edge('b', 'c'), edge('c', 'd')], 'group', {});

    expect(plan.layers).toEqual([['b', 'a'], ['c'], ['d']]);
    expect(plan.retryableNodeIds).toEqual(['b', 'a', 'c', 'd']);
  });

  test('blocks execution when a group node requires an external result that is absent', () => {
    const group = node('group', 'group');
    const source = node('outside', 'image');
    const target = node('target', 'video', { parentId: 'group' });

    const plan = buildGroupExecutionPlan([group, source, target], [{ ...edge('outside', 'target'), data: { dataType: 'image' } }], 'group', {});

    expect(plan.externalDependencies).toEqual([
      expect.objectContaining({ edgeId: 'outside-target', sourceNodeId: 'outside', targetNodeId: 'target', satisfied: false }),
    ]);
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'MISSING_EXTERNAL_RESULT', nodeId: 'target' }));
  });

  test('accepts a usable external runtime result without scheduling the external source', () => {
    const group = node('group', 'group');
    const source = node('outside', 'image');
    const target = node('target', 'video', { parentId: 'group' });
    const outputs: Record<string, FlowRuntimeNodeOutput> = { outside: { status: 'succeeded', assets: [{ assetId: 'asset-1', kind: 'image', mimeType: 'image/png' }] } };

    const plan = buildGroupExecutionPlan([group, source, target], [{ ...edge('outside', 'target'), data: { dataType: 'image' } }], 'group', outputs);

    expect(plan.nodeIds).toEqual(['target']);
    expect(plan.externalDependencies[0]).toEqual(expect.objectContaining({ satisfied: true }));
    expect(plan.blockingIssues).not.toContainEqual(expect.objectContaining({ code: 'MISSING_EXTERNAL_RESULT' }));
  });

  test('blocks failed, incomplete, and incompatible external results', () => {
    const group = node('group', 'group');
    const source = node('outside', 'image');
    const target = node('target', 'video', { parentId: 'group' });
    const edgeWithType = { ...edge('outside', 'target'), data: { dataType: 'video' as const } };

    const failed = buildGroupExecutionPlan([group, source, target], [edgeWithType], 'group', {
      outside: { status: 'failed', assets: [{ assetId: 'asset-1', kind: 'video', mimeType: 'video/mp4' }] },
    });
    const wrongKind = buildGroupExecutionPlan([group, source, target], [edgeWithType], 'group', {
      outside: { status: 'succeeded', assets: [{ assetId: 'asset-1', kind: 'image', mimeType: 'image/png' }] },
    });

    expect(failed.blockingIssues).toContainEqual(expect.objectContaining({ code: 'INVALID_EXTERNAL_RESULT', nodeId: 'target' }));
    expect(wrongKind.blockingIssues).toContainEqual(expect.objectContaining({ code: 'INVALID_EXTERNAL_RESULT', nodeId: 'target' }));
  });

  test('reports a cycle instead of producing partial execution layers', () => {
    const group = node('group', 'group');
    const a = node('a', 'image', { parentId: 'group' });
    const b = node('b', 'video', { parentId: 'group' });

    const plan = buildGroupExecutionPlan([group, a, b], [edge('a', 'b'), edge('b', 'a')], 'group', {});

    expect(plan.layers).toEqual([]);
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'CYCLE_DETECTED', nodeIds: ['a', 'b'] }));
  });

  test('reports cycle members separately from descendants blocked by the cycle', () => {
    const group = node('group', 'group');
    const a = node('a', 'image', { parentId: 'group' });
    const b = node('b', 'video', { parentId: 'group' });
    const c = node('c', 'text', { parentId: 'group' });

    const plan = buildGroupExecutionPlan([group, a, b, c], [edge('a', 'b'), edge('b', 'a'), edge('b', 'c')], 'group', {});

    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'CYCLE_DETECTED', nodeIds: ['a', 'b'] }));
    expect(plan.blockingIssues).toContainEqual(expect.objectContaining({ code: 'CYCLE_BLOCKED_DESCENDANTS', nodeIds: ['c'] }));
  });
});
