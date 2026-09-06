import { buildVisualContextRefs, type VisualContextRef, type VisualCapture } from "./agent-visual-context.js";
import { redactV2AgentContextValue } from "../agent-v2-context.js";

export type CanvasNodeSummary = { id: string; type: string; title?: string; position: { x: number; y: number }; selected: boolean; assetId?: string; status?: string };
export type CanvasDirectorContext = {
  task: { userGoal: string; selectedSkill?: { id: string; version: number; name?: string } };
  binding: { projectId: string; flowId: string; graphRevision: number };
  viewport: { x: number; y: number; zoom: number; visibleNodeIds: string[] };
  selection: { nodeIds: string[]; assetRefs: Array<{ refId: string; assetId: string; label: string }> };
  graph: { nodes: CanvasNodeSummary[]; edges: Array<{ id: string; source: string; target: string }>; offscreenClusters: Array<{ id: string; nodeIds: string[]; count: number }> };
  catalog: { productModels: Array<{ id: string; displayName: string; modality: string }>; pricingAvailability: Array<{ modelId: string; available: boolean }> };
  recentRuns: Array<{ id: string; status: string; summary?: string }>;
  visualContext: VisualContextRef[];
};

type CanvasInput = { nodes?: unknown[]; edges?: unknown[]; viewport?: unknown; selectedNodeIds?: unknown[] };
type Repo = { catalog?: (tenantId: string) => Promise<unknown[]>; pricing?: (tenantId: string, modelIds: string[]) => Promise<unknown[]>; recentRuns?: (tenantId: string, projectId: string, flowId: string) => Promise<unknown[]> };
const safeString = (v: unknown, max = 200) => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const redacted = redactV2AgentContextValue(v);
  return typeof redacted === "string" ? redacted.slice(0, max) : undefined;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

function nodeSummary(value: unknown): CanvasNodeSummary | null {
  const node = record(value); const id = safeString(node.id); if (!id) return null;
  const data = record(node.data); const position = record(node.position);
  const x = typeof position.x === "number" && Number.isFinite(position.x) ? position.x : 0;
  const y = typeof position.y === "number" && Number.isFinite(position.y) ? position.y : 0;
  const type = safeString(node.type, 80) ?? "unknown";
  const result: CanvasNodeSummary = { id, type, position: { x, y }, selected: node.selected === true };
  const title = safeString(data.title ?? data.label, 160); if (title) result.title = title;
  const assetId = safeString(data.assetId); if (assetId) result.assetId = assetId;
  const status = safeString(data.status, 40); if (status) result.status = status;
  return result;
}

function viewport(value: unknown) { const v = record(value); return { x: typeof v.x === "number" ? v.x : 0, y: typeof v.y === "number" ? v.y : 0, zoom: typeof v.zoom === "number" && v.zoom > 0 ? v.zoom : 1 }; }

export async function assembleCanvasDirectorContext(input: {
  tenantId: string; projectId: string; flowId: string; graphRevision: number; prompt: string;
  canvas: CanvasInput; selectedSkill?: { id: string; version: number; name?: string };
  visual?: { captures?: Array<{ id: string }> }; repositories?: Repo & { visual?: { findCapture: (id: string, tenantId?: string) => Promise<VisualCapture | null | undefined> } };
}): Promise<CanvasDirectorContext> {
  const vp = viewport(input.canvas.viewport); const all = (input.canvas.nodes ?? []).map(nodeSummary).filter((n): n is CanvasNodeSummary => Boolean(n));
  const selectedSet = new Set((input.canvas.selectedNodeIds ?? []).map((v) => safeString(v)).filter((v): v is string => Boolean(v)));
  all.forEach((node) => { if (node.selected) selectedSet.add(node.id); });
  const visible = all.filter((node) => Math.abs(node.position.x - (-vp.x / vp.zoom + 600)) <= 1000 / vp.zoom && Math.abs(node.position.y - (-vp.y / vp.zoom + 400)) <= 800 / vp.zoom);
  const selected = all.filter((node) => selectedSet.has(node.id)).slice(0, 12);
  const graphNodes = all.slice(0, 60);
  const offscreen = all.filter((node) => !visible.some((item) => item.id === node.id));
  const clusters = offscreen.length ? [{ id: "offscreen-0", nodeIds: offscreen.map((node) => node.id).slice(0, 60), count: offscreen.length }] : [];
  const edges = (input.canvas.edges ?? []).map((value) => { const e = record(value); const id = safeString(e.id); const source = safeString(e.source); const target = safeString(e.target); return id && source && target ? { id, source, target } : null; }).filter((e): e is { id: string; source: string; target: string } => Boolean(e)).slice(0, 120);
  const catalog = input.repositories?.catalog ? await input.repositories.catalog(input.tenantId) : [];
  const productModels = catalog.map((item) => { const m = record(item); const id = safeString(m.id); const displayName = safeString(m.displayName, 160); const modality = safeString(m.modality, 40); return id && displayName && modality ? { id, displayName, modality } : null; }).filter((m): m is { id: string; displayName: string; modality: string } => Boolean(m));
  const pricing = input.repositories?.pricing ? await input.repositories.pricing(input.tenantId, productModels.map((model) => model.id)) : [];
  const pricedModelIds = new Set(pricing.map((item) => safeString(record(item).modelId ?? record(item).id)).filter((id): id is string => Boolean(id)));
  const runs = input.repositories?.recentRuns ? await input.repositories.recentRuns(input.tenantId, input.projectId, input.flowId) : [];
  const recentRuns = runs.map((item) => { const r = record(item); const id = safeString(r.id); const status = safeString(r.status, 40); return id && status ? { id, status, ...(safeString(r.summary, 240) ? { summary: safeString(r.summary, 240) } : {}) } : null; }).filter((r): r is { id: string; status: string; summary?: string } => Boolean(r)).slice(0, 12);
  const visualContext = input.visual && input.repositories?.visual ? await buildVisualContextRefs({ flowId: input.flowId, captureIds: input.visual.captures?.map((capture) => capture.id) ?? [], repository: { findCapture: (id) => input.repositories!.visual!.findCapture(id, input.tenantId) } }) : [];
  return { task: { userGoal: safeString(input.prompt, 4000) ?? "", ...(input.selectedSkill ? { selectedSkill: input.selectedSkill } : {}) }, binding: { projectId: input.projectId, flowId: input.flowId, graphRevision: Number.isSafeInteger(input.graphRevision) ? input.graphRevision : 0 }, viewport: { ...vp, visibleNodeIds: visible.map((node) => node.id).slice(0, 60) }, selection: { nodeIds: selected.map((node) => node.id), assetRefs: selected.filter((node) => node.assetId).map((node) => ({ refId: `node-${node.id}`, assetId: node.assetId!, label: node.title ?? node.id })).slice(0, 12) }, graph: { nodes: graphNodes, edges, offscreenClusters: clusters }, catalog: { productModels, pricingAvailability: productModels.map((model) => ({ modelId: model.id, available: pricedModelIds.has(model.id) })) }, recentRuns, visualContext };
}
