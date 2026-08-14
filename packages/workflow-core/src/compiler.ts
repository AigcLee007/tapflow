import {
  type CompiledWorkflow,
  type CompiledWorkflowEdge,
  type CompiledWorkflowNode,
  type FlowGraph,
  validateGraph,
} from "./graph-schema.js";
import { topologicalSort } from "./topological-sort.js";

function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function hasStaticImageReference(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (typeof data.referenceUploadId === "string" && data.referenceUploadId.trim()) return true;
  if (typeof data.assetId === "string" && data.assetId.trim()) return true;
  return Array.isArray(data.assetIds) && data.assetIds.some((item) => typeof item === "string" && item.trim());
}

function normalizeNodeType(type: string, data?: Record<string, unknown>): string {
  if (type === "text") {
    return "text.generate";
  }
  if (type === "image") {
    if (hasStaticImageReference(data)) {
      return "image.asset";
    }
    return "image.generate";
  }
  if (type === "video") {
    return "video.generate";
  }
  return type;
}

export function compileGraph(graph: FlowGraph): CompiledWorkflow {
  validateGraph(graph);
  const orderedNodeIds = topologicalSort(graph);

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    dependencies.set(node.id, new Set<string>());
    dependents.set(node.id, new Set<string>());
  }

  const edges: CompiledWorkflowEdge[] = graph.edges.map((edge) => {
    dependencies.get(edge.target)?.add(edge.source);
    dependents.get(edge.source)?.add(edge.target);

    return {
      data: edge.data,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    };
  });

  const compiledNodes: CompiledWorkflowNode[] = orderedNodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) {
      throw new Error(`Unexpected missing node during compilation: ${nodeId}`);
    }

    return {
      config: node.data ?? {},
      dependencies: sortStrings(dependencies.get(nodeId) ?? []),
      dependents: sortStrings(dependents.get(nodeId) ?? []),
      id: node.id,
      parentId: node.parentId,
      type: normalizeNodeType(node.type, node.data),
    };
  });

  const entryNodeIds = compiledNodes
    .filter((node) => node.dependencies.length === 0)
    .map((node) => node.id);
  const outputNodeIds = compiledNodes
    .filter((node) => node.dependents.length === 0)
    .map((node) => node.id);

  return {
    edges,
    entryNodeIds,
    nodes: compiledNodes,
    outputNodeIds,
    schemaVersion: "v2",
  };
}
