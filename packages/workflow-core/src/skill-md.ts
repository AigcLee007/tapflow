export type SkillModality = "text" | "image" | "video";

export type SkillFrontmatter = {
  approval_policy: "auto" | "credit_required";
  category?: string;
  compatible_graph_schema: "v2";
  description: string;
  inputs: string[];
  modality: SkillModality;
  name: string;
  outputs: string[];
  triggers: string[];
};

export type SkillMarkdownDocument = {
  body: string;
  frontmatter: SkillFrontmatter;
};

export type SkillGraphTemplate = {
  edges: Array<{
    source: string;
    sourceHandle?: string;
    target: string;
    targetHandle?: string;
  }>;
  inputBindings?: Record<string, {
    kind: "asset" | "choice" | "number" | "text";
    path: string;
    target: string;
  }>;
  nodes: Array<{
    data?: Record<string, unknown>;
    id: string;
    type: string;
  }>;
  schemaVersion: "v2";
};

type SkillInputBinding = NonNullable<SkillGraphTemplate["inputBindings"]>[string];

export class SkillPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillPackageValidationError";
  }
}

const ALLOWED_NODE_TYPES = new Set([
  "text",
  "image",
  "video",
  "upload",
  "storyboard",
  "director3d",
  "panorama_viewer",
  "video_editor",
]);
const BLOCKED_KEYS = /(?:apikey|authorization|baseurl|credential|provider|routekey|signedurl|script|command|executable|url|blob|base64|dataurl)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScalar(value: string): string | boolean | number {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(source: string): Record<string, unknown> {
  const lines = source.split(/\r?\n/);
  const output: Record<string, unknown> = {};
  let currentList: string[] | null = null;
  let currentKey = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const listItem = /^\s+-\s+(.+)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(String(parseScalar(listItem[1])));
      continue;
    }
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line);
    if (!entry) throw new SkillPackageValidationError("Invalid SKILL.md frontmatter line");
    currentKey = entry[1];
    const value = entry[2]?.trim() ?? "";
    if (!value) {
      currentList = [];
      output[currentKey] = currentList;
    } else {
      currentList = null;
      output[currentKey] = parseScalar(value);
    }
  }
  return output;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SkillPackageValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new SkillPackageValidationError(`${field} must be a non-empty string list`);
  }
  return value.map((item) => item.trim());
}

function normalizeFrontmatter(raw: Record<string, unknown>): SkillFrontmatter {
  const modality = requireString(raw.modality, "modality");
  if (!(["text", "image", "video"] as string[]).includes(modality)) {
    throw new SkillPackageValidationError("modality must be text, image, or video");
  }
  const approval = raw.approval_policy === undefined ? "auto" : requireString(raw.approval_policy, "approval_policy");
  if (approval !== "auto" && approval !== "credit_required") {
    throw new SkillPackageValidationError("approval_policy is invalid");
  }
  const schema = requireString(raw.compatible_graph_schema, "compatible_graph_schema");
  if (schema !== "v2") throw new SkillPackageValidationError("compatible_graph_schema must be v2");
  return {
    approval_policy: approval,
    ...(raw.category === undefined ? {} : { category: requireString(raw.category, "category") }),
    compatible_graph_schema: "v2",
    description: requireString(raw.description, "description"),
    inputs: requireStringList(raw.inputs, "inputs"),
    modality: modality as SkillModality,
    name: requireString(raw.name, "name"),
    outputs: requireStringList(raw.outputs, "outputs"),
    triggers: requireStringList(raw.triggers, "triggers"),
  };
}

export function parseSkillMarkdown(source: string): SkillMarkdownDocument {
  if (typeof source !== "string" || !source.startsWith("---\n")) {
    throw new SkillPackageValidationError("SKILL.md must start with YAML frontmatter");
  }
  const end = source.indexOf("\n---", 4);
  if (end < 0) throw new SkillPackageValidationError("SKILL.md frontmatter is not closed");
  const frontmatter = normalizeFrontmatter(parseFrontmatter(source.slice(4, end)));
  return { body: source.slice(end + 4).replace(/^\r?\n/, ""), frontmatter };
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value);
}

export function serializeSkillMarkdown(frontmatter: SkillFrontmatter, body: string): string {
  const normalized = normalizeFrontmatter(frontmatter as unknown as Record<string, unknown>);
  const lines = [
    "---",
    `name: ${yamlScalar(normalized.name)}`,
    `description: ${yamlScalar(normalized.description)}`,
    `modality: ${normalized.modality}`,
    ...(normalized.category ? [`category: ${yamlScalar(normalized.category)}`] : []),
    "triggers:",
    ...normalized.triggers.map((item) => `  - ${yamlScalar(item)}`),
    "inputs:",
    ...normalized.inputs.map((item) => `  - ${yamlScalar(item)}`),
    "outputs:",
    ...normalized.outputs.map((item) => `  - ${yamlScalar(item)}`),
    `approval_policy: ${normalized.approval_policy}`,
    "compatible_graph_schema: v2",
    "---",
    "",
    body.trim(),
    "",
  ];
  return lines.join("\n");
}

function validateSafeValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (BLOCKED_KEYS.test(path) || /(?:data:|blob:|https?:\/\/|javascript:)/i.test(value)) {
      throw new SkillPackageValidationError(`Unsafe graph value at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSafeValue(item, `${path}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (BLOCKED_KEYS.test(key)) throw new SkillPackageValidationError(`Unsafe graph field: ${path}.${key}`);
      validateSafeValue(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new SkillPackageValidationError(`Graph value at ${path} is not serializable`);
  }
}

export function validateSkillGraphTemplate(input: unknown): SkillGraphTemplate {
  if (!isRecord(input) || input.schemaVersion !== "v2" || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new SkillPackageValidationError("Graph template must use schemaVersion v2 with nodes and edges");
  }
  const nodeIds = new Set<string>();
  const nodes = input.nodes.map((node, index) => {
    if (!isRecord(node) || typeof node.id !== "string" || typeof node.type !== "string") {
      throw new SkillPackageValidationError(`Invalid graph node at index ${index}`);
    }
    if (!ALLOWED_NODE_TYPES.has(node.type)) throw new SkillPackageValidationError(`Unsupported graph node type: ${node.type}`);
    if (nodeIds.has(node.id)) throw new SkillPackageValidationError(`Duplicate graph node id: ${node.id}`);
    nodeIds.add(node.id);
    if (node.data !== undefined && !isRecord(node.data)) throw new SkillPackageValidationError(`Node ${node.id} data must be an object`);
    validateSafeValue(node.data ?? {}, `nodes.${node.id}.data`);
    return { id: node.id, type: node.type, ...(node.data === undefined ? {} : { data: node.data }) };
  });
  const edges = input.edges.map((edge, index) => {
    if (!isRecord(edge) || typeof edge.source !== "string" || typeof edge.target !== "string" || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new SkillPackageValidationError(`Invalid graph edge at index ${index}`);
    }
    if (edge.source === edge.target) throw new SkillPackageValidationError("Graph template cannot contain self-loops");
    return {
      source: edge.source,
      ...(typeof edge.sourceHandle === "string" ? { sourceHandle: edge.sourceHandle } : {}),
      target: edge.target,
      ...(typeof edge.targetHandle === "string" ? { targetHandle: edge.targetHandle } : {}),
    };
  });
  let inputBindings: SkillGraphTemplate["inputBindings"];
  if (input.inputBindings !== undefined) {
    if (!isRecord(input.inputBindings)) throw new SkillPackageValidationError("inputBindings must be an object");
    inputBindings = {};
    for (const [key, binding] of Object.entries(input.inputBindings)) {
      if (!isRecord(binding) || typeof binding.target !== "string" || !nodeIds.has(binding.target) || typeof binding.path !== "string" || !binding.path.startsWith("data.") || !["asset", "choice", "number", "text"].includes(String(binding.kind))) {
        throw new SkillPackageValidationError(`Invalid input binding: ${key}`);
      }
      inputBindings[key] = { kind: binding.kind as SkillInputBinding["kind"], path: binding.path, target: binding.target };
    }
  }
  return { schemaVersion: "v2", nodes, edges, ...(inputBindings ? { inputBindings } : {}) };
}
