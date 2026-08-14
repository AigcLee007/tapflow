import type { FlowTemplateInputDefinition } from '../../services/v2FlowTemplatesApi';

export type TemplateGraphLike = {
  nodes: Array<{ id: string; data?: Record<string, unknown>; [key: string]: unknown }>;
  edges: unknown[];
};

export type TemplateInputValues = Record<string, string | number | undefined>;

const UNSAFE_ASSET_VALUE = /^(?:data:|blob:|https?:\/\/)/i;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function pathSegments(fieldPath: string): string[] {
  if (!/^data\.[A-Za-z0-9_.-]+$/.test(fieldPath)) {
    throw new Error('Template inputs must target a node data field');
  }
  const segments = fieldPath.split('.').slice(1);
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) throw new Error('Template inputs must target a safe node data field');
  return segments;
}

function hasOwnPath(value: unknown, segments: string[]): boolean {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

function valueFor(input: FlowTemplateInputDefinition, values: TemplateInputValues): string | number | undefined {
  const value = values[input.id] ?? input.defaultValue;
  if ((value === undefined || value === '') && input.required) throw new Error(`Template input "${input.label}" is required`);
  if (value === undefined || value === '') return undefined;
  if (input.type === 'asset') {
    if (typeof value !== 'string' || UNSAFE_ASSET_VALUE.test(value)) throw new Error(`Template input "${input.label}" must be an asset ID`);
  }
  if (input.type === 'enum' && (typeof value !== 'string' || !input.options.includes(value))) throw new Error(`Template input "${input.label}" must use a declared option`);
  if (input.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || (input.minimum !== undefined && value < input.minimum) || (input.maximum !== undefined && value > input.maximum))) throw new Error(`Template input "${input.label}" is outside its allowed range`);
  return value;
}

export function validateTemplateInputDefinitions(inputs: FlowTemplateInputDefinition[], graph: TemplateGraphLike): void {
  const ids = new Set<string>();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const input of inputs) {
    if (ids.has(input.id)) throw new Error(`Duplicate template input ID: ${input.id}`);
    ids.add(input.id);
    const node = nodes.get(input.target.nodeId);
    const segments = pathSegments(input.target.fieldPath);
    if (!node || !node.data || !hasOwnPath(node.data, segments)) {
      throw new Error(`Template input "${input.label}" does not target an existing node data field`);
    }
  }
}

export function applyTemplateInputValues(graph: TemplateGraphLike, inputs: FlowTemplateInputDefinition[], values: TemplateInputValues): TemplateGraphLike {
  validateTemplateInputDefinitions(inputs, graph);
  const clone = structuredClone(graph) as TemplateGraphLike;
  const nodes = new Map(clone.nodes.map((node) => [node.id, node]));
  for (const input of inputs) {
    const value = valueFor(input, values);
    if (value === undefined) continue;
    const node = nodes.get(input.target.nodeId)!;
    const segments = pathSegments(input.target.fieldPath);
    let target = node.data as Record<string, unknown>;
    for (const segment of segments.slice(0, -1)) {
      if (!Object.prototype.hasOwnProperty.call(target, segment) || !target[segment] || typeof target[segment] !== 'object') throw new Error(`Template input "${input.label}" does not target an existing node data field`);
      target = target[segment] as Record<string, unknown>;
    }
    target[segments.at(-1)!] = value;
  }
  return clone;
}
