import { randomUUID } from "node:crypto";
import { validateSkillGraphTemplate, type SkillGraphTemplate } from "@aigc-flow/workflow-core";

export type SkillGraphInstance = {
  schemaVersion: "v2";
  nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
};

export function instantiateSkillGraphTemplate(templateInput: unknown, inputs: Record<string, unknown>, createId: () => string = randomUUID): SkillGraphInstance {
  const template = validateSkillGraphTemplate(templateInput);
  const ids = new Map(template.nodes.map((node) => [node.id, createId()]));
  const nodes = template.nodes.map((node) => ({
    id: ids.get(node.id)!,
    type: node.type,
    ...(node.data ? { data: structuredClone(node.data) } : {}),
  }));
  for (const [key, binding] of Object.entries(template.inputBindings ?? {})) {
    if (!(key in inputs)) continue;
    const target = nodes.find((node) => node.id === ids.get(binding.target));
    if (!target) throw new Error("SKILL_GRAPH_BINDING_TARGET_NOT_FOUND");
    const path = binding.path.slice("data.".length).split(".").filter(Boolean);
    if (path.length === 0) throw new Error("SKILL_GRAPH_BINDING_PATH_INVALID");
    target.data ??= {};
    let cursor: Record<string, unknown> = target.data;
    for (const segment of path.slice(0, -1)) {
      const current = cursor[segment];
      if (current !== undefined && (typeof current !== "object" || current === null || Array.isArray(current))) throw new Error("SKILL_GRAPH_BINDING_PATH_CONFLICT");
      cursor[segment] = current ?? {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]!] = inputs[key];
  }
  return {
    schemaVersion: "v2",
    nodes,
    edges: template.edges.map((edge) => ({
      source: ids.get(edge.source)!,
      target: ids.get(edge.target)!,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    })),
  };
}
