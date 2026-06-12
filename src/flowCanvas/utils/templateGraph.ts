import { nanoid } from 'nanoid';
import type { Edge, Node } from '@xyflow/react';

import type { FlowEdgeData, FlowNodeData } from '../types';

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<FlowEdgeData>;

export function offsetTemplateGraphForInsert(input: {
  graph: { nodes: FlowNode[]; edges: FlowEdge[] };
  center: { x: number; y: number };
  idPrefix?: string;
}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = Array.isArray(input.graph.nodes) ? input.graph.nodes : [];
  const edges = Array.isArray(input.graph.edges) ? input.graph.edges : [];
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const minX = Math.min(...nodes.map((node) => Number(node.position?.x ?? 0)));
  const minY = Math.min(...nodes.map((node) => Number(node.position?.y ?? 0)));
  const prefix = input.idPrefix || 'template';
  const idMap = new Map<string, string>();

  nodes.forEach((node) => {
    idMap.set(node.id, `${prefix}-${nanoid(8)}`);
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) || `${prefix}-${nanoid(8)}`,
      parentId: undefined,
      extent: undefined,
      positionAbsolute: undefined,
      selected: true,
      dragging: false,
      data: {
        ...node.data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      position: {
        x: input.center.x + Number(node.position?.x ?? 0) - minX,
        y: input.center.y + Number(node.position?.y ?? 0) - minY,
      },
    })),
    edges: edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: `${prefix}-${nanoid(8)}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: false,
      })),
  };
}
