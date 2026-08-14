import type { Edge, Node } from '@xyflow/react';

import type { FlowEdgeData, FlowNodeData, FlowRuntimeNodeOutput } from '../types';

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<FlowEdgeData>;

export type GroupExecutionIssueCode =
  | 'CYCLE_DETECTED'
  | 'GROUP_NOT_FOUND'
  | 'MISSING_EXTERNAL_RESULT'
  | 'MISSING_GENERATION_PROMPT'
  | 'MISSING_ROUTE'
  | 'NESTED_GROUP_UNSUPPORTED'
  | 'UNSUPPORTED_NODE_KIND'
  | 'INVALID_EXTERNAL_RESULT'
  | 'CYCLE_BLOCKED_DESCENDANTS';

export interface GroupExecutionIssue {
  code: GroupExecutionIssueCode;
  message: string;
  nodeId?: string;
  nodeIds?: string[];
}

export interface GroupExecutionExternalDependency {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  satisfied: boolean;
}

export interface GroupExecutionPlan {
  nodeIds: string[];
  layers: string[][];
  externalDependencies: GroupExecutionExternalDependency[];
  blockingIssues: GroupExecutionIssue[];
  estimatedCredits: number;
  retryableNodeIds: string[];
}

const EXECUTABLE_KINDS = new Set<FlowNodeData['kind']>(['image', 'text', 'video']);
const STATIC_INPUT_KINDS = new Set<FlowNodeData['kind']>(['upload']);

function compareNodes(left: FlowNode, right: FlowNode): number {
  return left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id);
}

function hasRuntimeResultForEdge(output: FlowRuntimeNodeOutput | undefined, dataType: FlowEdgeData['dataType']): boolean {
  if (!output || output.status !== 'succeeded' || output.errorMessage || output.providerTask?.status === 'failed') return false;
  if (dataType === 'text') return typeof output.text === 'string' && output.text.trim().length > 0;
  if (dataType === 'json') return Boolean(output.output && Object.keys(output.output).length > 0);
  if (dataType === 'any') return Boolean(
    output.assets?.some((asset) => Boolean(asset.assetId)) ||
    (typeof output.text === 'string' && output.text.trim()) ||
    (output.output && Object.keys(output.output).length > 0),
  );
  return output.assets?.some((asset) => asset.kind === dataType && Boolean(asset.assetId)) ?? false;
}

function readEstimatedCredits(node: FlowNode): number {
  const direct = node.data.estimatedCredits;
  const fromParams = node.data.params?.estimatedCredits;
  const candidate = typeof direct === 'number' ? direct : typeof fromParams === 'number' ? fromParams : 0;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
}

function validateNode(node: FlowNode): GroupExecutionIssue[] {
  const issues: GroupExecutionIssue[] = [];
  if (!node.data.generationPrompt?.trim()) {
    issues.push({
      code: 'MISSING_GENERATION_PROMPT',
      message: `Node ${node.id} requires a generation prompt.`,
      nodeId: node.id,
    });
  }
  if (!node.data.routeId && !node.data.routeKey && !node.data.modelId) {
    issues.push({
      code: 'MISSING_ROUTE',
      message: `Node ${node.id} requires a model route.`,
      nodeId: node.id,
    });
  }
  return issues;
}

function findCycleNodeIds(
  unresolvedIds: string[],
  outgoing: Map<string, string[]>,
  byId: Map<string, FlowNode>,
): string[] {
  const unresolved = new Set(unresolvedIds);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = new Set<string>();
  const visit = (nodeId: string, path: string[]): void => {
    if (cycle.size > 0 || visited.has(nodeId) || !unresolved.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      path.slice(path.indexOf(nodeId)).forEach((id) => cycle.add(id));
      return;
    }
    visiting.add(nodeId);
    for (const targetId of outgoing.get(nodeId) ?? []) visit(targetId, [...path, nodeId]);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  [...unresolved].sort((left, right) => compareNodes(byId.get(left)!, byId.get(right)!)).forEach((id) => visit(id, []));
  return [...cycle].sort((left, right) => compareNodes(byId.get(left)!, byId.get(right)!));
}

export function buildGroupExecutionPlan(
  nodes: FlowNode[],
  edges: FlowEdge[],
  groupId: string,
  runtimeOutputs: Record<string, FlowRuntimeNodeOutput> = {},
): GroupExecutionPlan {
  const group = nodes.find((node) => node.id === groupId && node.type === 'group');
  if (!group) {
    return {
      blockingIssues: [{ code: 'GROUP_NOT_FOUND', message: `Group ${groupId} was not found.` }],
      estimatedCredits: 0,
      externalDependencies: [],
      layers: [],
      nodeIds: [],
      retryableNodeIds: [],
    };
  }

  const directChildren = nodes.filter((node) => node.parentId === groupId);
  const nestedGroups = directChildren.filter((node) => node.type === 'group');
  const executableNodes = directChildren.filter((node) => EXECUTABLE_KINDS.has(node.data.kind)).sort(compareNodes);
  const unsupportedNodes = directChildren.filter((node) => !EXECUTABLE_KINDS.has(node.data.kind) && !STATIC_INPUT_KINDS.has(node.data.kind) && node.type !== 'group');
  const executableIds = new Set(executableNodes.map((node) => node.id));
  const blockingIssues = [
    ...nestedGroups.map((node) => ({
      code: 'NESTED_GROUP_UNSUPPORTED' as const,
      message: `Nested group ${node.id} must be ungrouped before this group can run.`,
      nodeId: node.id,
    })),
    ...unsupportedNodes.map((node) => ({
      code: 'UNSUPPORTED_NODE_KIND' as const,
      message: `Node ${node.id} (${node.data.kind}) cannot be executed as part of a group.`,
      nodeId: node.id,
    })),
    ...executableNodes.flatMap(validateNode),
  ];

  const externalDependencies = edges
    .filter((edge) => executableIds.has(edge.target) && !executableIds.has(edge.source) && !directChildren.some((node) => node.id === edge.source && STATIC_INPUT_KINDS.has(node.data.kind)))
    .map((edge) => ({
      edgeId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      satisfied: hasRuntimeResultForEdge(runtimeOutputs[edge.source], edge.data?.dataType ?? 'any'),
    }))
    .sort((left, right) => left.targetNodeId.localeCompare(right.targetNodeId) || left.sourceNodeId.localeCompare(right.sourceNodeId) || left.edgeId.localeCompare(right.edgeId));

  for (const dependency of externalDependencies) {
    if (!dependency.satisfied) {
      blockingIssues.push({
        code: runtimeOutputs[dependency.sourceNodeId] ? 'INVALID_EXTERNAL_RESULT' : 'MISSING_EXTERNAL_RESULT',
        message: `Node ${dependency.targetNodeId} requires an existing result from ${dependency.sourceNodeId}.`,
        nodeId: dependency.targetNodeId,
      });
    }
  }

  const internalEdges = edges.filter((edge) => executableIds.has(edge.source) && executableIds.has(edge.target));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(executableNodes.map((node) => [node.id, 0]));
  for (const edge of internalEdges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const byId = new Map(executableNodes.map((node) => [node.id, node]));
  let ready = executableNodes.filter((node) => indegree.get(node.id) === 0);
  const layers: string[][] = [];
  let scheduledCount = 0;
  while (ready.length > 0) {
    const layer = ready.sort(compareNodes);
    layers.push(layer.map((node) => node.id));
    scheduledCount += layer.length;
    const nextReady: FlowNode[] = [];
    for (const node of layer) {
      for (const targetId of outgoing.get(node.id) ?? []) {
        const remaining = (indegree.get(targetId) ?? 1) - 1;
        indegree.set(targetId, remaining);
        if (remaining === 0) {
          const target = byId.get(targetId);
          if (target) nextReady.push(target);
        }
      }
    }
    ready = nextReady;
  }

  if (scheduledCount !== executableNodes.length) {
    const unresolvedIds = new Set(executableNodes.filter((node) => (indegree.get(node.id) ?? 0) > 0).map((node) => node.id));
    const cycleNodeIds = findCycleNodeIds([...unresolvedIds], outgoing, byId);
    const cycleIdSet = new Set(cycleNodeIds);
    const blockedDescendantIds = [...unresolvedIds].filter((nodeId) => !cycleIdSet.has(nodeId)).sort((left, right) => compareNodes(byId.get(left)!, byId.get(right)!));
    blockingIssues.push({
      code: 'CYCLE_DETECTED',
      message: `Group contains a dependency cycle: ${cycleNodeIds.join(', ')}.`,
      nodeIds: cycleNodeIds,
    });
    if (blockedDescendantIds.length > 0) {
      blockingIssues.push({
        code: 'CYCLE_BLOCKED_DESCENDANTS',
        message: `Group nodes are blocked by a dependency cycle: ${blockedDescendantIds.join(', ')}.`,
        nodeIds: blockedDescendantIds,
      });
    }
    return {
      blockingIssues,
      estimatedCredits: executableNodes.reduce((sum, node) => sum + readEstimatedCredits(node), 0),
      externalDependencies,
      layers: [],
      nodeIds: executableNodes.map((node) => node.id),
      retryableNodeIds: executableNodes.map((node) => node.id),
    };
  }

  return {
    blockingIssues,
    estimatedCredits: executableNodes.reduce((sum, node) => sum + readEstimatedCredits(node), 0),
    externalDependencies,
    layers,
    nodeIds: executableNodes.map((node) => node.id),
    retryableNodeIds: layers.flat(),
  };
}
