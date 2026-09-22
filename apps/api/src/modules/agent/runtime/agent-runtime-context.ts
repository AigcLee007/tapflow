import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Pool } from "pg";
import { normalizeAgentContextSnapshot, type AgentContextSnapshot } from "./agent-protocol.js";
import type { AgentRuntimeContext, AgentRuntimeSession } from "./agent-runtime.repository.js";
import type { AgentProductModel, AgentRequirementPlan } from "./agent-requirement-planner.js";
import type { AgentExecutionStep } from "./agent-execution-adapter.js";

type Draft = { projectId: string; flowId: string; revision: number; graph: { nodes: Record<string, unknown>[] } };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function assembleAgentContext(
  session: Pick<AgentRuntimeSession, "projectId" | "flowId">, input: AgentContextSnapshot, draft: Draft,
  findAvailableAssetIds: (ids: string[]) => Promise<string[]>,
): Promise<AgentContextSnapshot> {
  const snapshot = normalizeAgentContextSnapshot(input);
  if (!session.flowId || !session.projectId || snapshot.flowId !== session.flowId || snapshot.projectId !== session.projectId || draft.flowId !== session.flowId || draft.projectId !== session.projectId) throw new Error("AGENT_CONTEXT_SCOPE_CONFLICT");
  if (snapshot.graphRevision !== draft.revision) throw new Error("AGENT_GRAPH_REVISION_CONFLICT");
  if (snapshot.skillIds.length || snapshot.appIds.length) throw new Error("AGENT_CAPABILITY_UNAVAILABLE");
  if (new Set(snapshot.refs.map((ref) => ref.refId)).size !== snapshot.refs.length) throw new Error("AGENT_REFERENCE_INVALID");
  const refs = snapshot.refs.map((ref) => {
    if (ref.source === "canvas") {
      const node = draft.graph.nodes.find((node) => node.id === ref.nodeId);
      if (!node) throw new Error("AGENT_REFERENCE_UNAVAILABLE");
      const data = record(node.data);
      const assetId = typeof data.assetId === "string" ? data.assetId : undefined;
      if (ref.assetId && ref.assetId !== assetId) throw new Error("AGENT_REFERENCE_INVALID");
      return { ...ref, ...(assetId ? { assetId } : {}) };
    }
    if (!ref.assetId || ref.nodeId) throw new Error("AGENT_REFERENCE_INVALID");
    return ref;
  });
  const assetIds = [...new Set(refs.flatMap((ref) => ref.assetId ? [ref.assetId] : []))];
  const available = new Set(await findAvailableAssetIds(assetIds));
  if (assetIds.some((id) => !available.has(id))) throw new Error("AGENT_REFERENCE_UNAVAILABLE");
  return { ...snapshot, refs };
}

export class AgentRuntimeContextService {
  readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  async assemble(ctx: AgentRuntimeContext, session: AgentRuntimeSession, input: AgentContextSnapshot): Promise<AgentContextSnapshot> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query(`SELECT f.id::text AS flow_id, f.project_id::text, d.revision, d.graph_json
        FROM flows f JOIN projects p ON p.id=f.project_id AND p.tenant_id=f.tenant_id
        JOIN flow_drafts d ON d.flow_id=f.id AND d.tenant_id=f.tenant_id
        WHERE f.id=$1::uuid AND f.tenant_id=$2::uuid AND p.created_by=$3::uuid
          AND f.deleted_at IS NULL AND p.deleted_at IS NULL`, [session.flowId, ctx.tenantId, ctx.userId]);
      const row = result.rows[0];
      if (!row) throw new Error("AGENT_CONTEXT_SCOPE_CONFLICT");
      return assembleAgentContext(session, input, { flowId: row.flow_id, projectId: row.project_id, revision: Number(row.revision), graph: row.graph_json }, async (ids) => {
        if (!ids.length) return [];
        const assets = await client.query<{ id: string }>(`SELECT id::text FROM assets WHERE tenant_id=$1::uuid AND owner_user_id=$2::uuid
          AND id=ANY($3::uuid[]) AND status='available' AND deleted_at IS NULL`, [ctx.tenantId, ctx.userId, ids]);
        return assets.rows.map((asset) => asset.id);
      });
    }, this.pool);
  }

  async models(ctx: AgentRuntimeContext): Promise<AgentProductModel[]> {
    const routes = await this.routes(ctx);
    return [...new Map(routes.map((route) => [`${route.kind}:${route.key}`, { key: route.key, label: route.label, kind: route.kind }])).values()];
  }

  async resolveSteps(ctx: AgentRuntimeContext, plan: AgentRequirementPlan, snapshot: AgentContextSnapshot): Promise<AgentExecutionStep[]> {
    const routes = await this.routes(ctx);
    return plan.steps.map((step) => {
      if (snapshot.modelKey && step.modelKey && step.modelKey !== snapshot.modelKey) throw new Error("AGENT_MODEL_LOCK_CONFLICT");
      const lockedModel = snapshot.modelKey ?? step.modelKey;
      const route = routes.find((route) => route.kind === step.kind && (!lockedModel || route.key === lockedModel || route.routeKey === lockedModel));
      if (!route) throw new Error("AGENT_MODEL_UNAVAILABLE");
      const assets = step.referenceIds.map((id) => snapshot.refs.find((ref) => ref.refId === id)?.assetId);
      if (assets.some((asset) => !asset)) throw new Error("AGENT_REFERENCE_UNAVAILABLE");
      const frame = (refId: string | undefined, role: "first_frame" | "last_frame") => {
        if (!refId) return [];
        const assetId = snapshot.refs.find((ref) => ref.refId === refId)?.assetId;
        if (!assetId) throw new Error("AGENT_REFERENCE_UNAVAILABLE");
        return [{ source: { kind: "asset" as const, id: assetId }, mediaKind: "image" as const, role }];
      };
      if (step.kind === "video" && step.video) {
        const first = step.video.firstFrameRefId;
        const last = step.video.lastFrameRefId;
        if ((first && !last) || (!first && last)) throw new Error("AGENT_FIRST_LAST_FRAME_REQUIRED");
        if (first && last && (!step.aspectRatio || !step.video.durationSeconds || step.video.durationSeconds <= 0)) throw new Error("AGENT_FIRST_LAST_FRAME_METADATA_REQUIRED");
      }
      return {
        stepId: step.id, kind: step.kind, prompt: step.prompt, routeKey: route.routeKey,
        dependsOn: step.dependsOnStepIds, referenceAssetIds: step.kind === "video" ? [] : assets as string[],
        ...(step.kind === "image" ? { image: { aspectRatio: step.aspectRatio } } : {}),
        ...(step.video ? { video: {
          mode: step.video.firstFrameRefId ? "first_last_frame" as const : "text_to_video" as const,
          count: 1 as const, durationSeconds: step.video.durationSeconds, resolution: step.video.resolution.toUpperCase() as "480P" | "720P" | "1080P",
          aspectRatio: (step.aspectRatio ?? "16:9") as "16:9", generateAudio: step.video.generateAudio,
          referenceInputs: [...frame(step.video.firstFrameRefId, "first_frame"), ...frame(step.video.lastFrameRefId, "last_frame")],
        } } : {}),
      };
    });
  }

  async placementGraph(ctx: AgentRuntimeContext, session: AgentRuntimeSession, result: { id: string; assetId: string | null; contentText: string | null; kind: string; sourceRefs?: string[]; lineage?: Record<string, unknown>; label?: string }) {
    return withTenantTransaction(ctx, async (client) => {
      const row = (await client.query(`SELECT revision, graph_json FROM flow_drafts WHERE tenant_id=$1::uuid AND flow_id=$2::uuid FOR UPDATE`, [ctx.tenantId, session.flowId])).rows[0];
      if (!row) throw new Error("AGENT_FLOW_NOT_FOUND");
      const graph = row.graph_json ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
      const nodeId = `agent-result-${result.id}`;
      const existingNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
      const kind = result.kind === "text" ? "text" : result.kind === "video" ? "video" : "image";
      const position = { x: 120 + (existingNodes.length % 3) * 340, y: 140 + Math.floor(existingNodes.length / 3) * 260 };
      const agent = { sessionId: session.id, resultId: result.id, ...(result.lineage ?? {}) };
      const data = result.kind === "text"
        ? { kind, title: result.label ?? "Agent 文本结果", content: result.contentText, text: result.contentText, resultId: result.id, status: "succeeded", generationStatus: "done", agent, sourceRefs: result.sourceRefs ?? [] }
        : { kind, title: result.label ?? "Agent 生成结果", assetId: result.assetId, resultId: result.id, status: "succeeded", generationStatus: "done", agent, sourceRefs: result.sourceRefs ?? [] };
      return { expectedGraphRevision: Number(row.revision), placedNodeId: nodeId, graph: { ...graph, nodes: [...existingNodes, { id: nodeId, type: kind, position, data }] } };
    }, this.pool);
  }

  private async routes(ctx: AgentRuntimeContext): Promise<Array<AgentProductModel & { routeKey: string }>> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<{ key: string; label: string; kind: "image" | "video" | "text"; route_key: string }>(`SELECT DISTINCT ON (r.modality, COALESCE(r.model_family,m.model_key), r.route_key)
        COALESCE(r.model_family,m.model_key) AS key, m.display_name AS label, r.modality AS kind, r.route_key
        FROM ai_routes r JOIN ai_models m ON m.id=r.model_id JOIN ai_providers p ON p.id=r.provider_id
        WHERE (r.tenant_id=$1::uuid OR r.tenant_id IS NULL) AND r.status='active' AND m.status='active' AND p.status='active'
          AND r.modality IN ('image','video','text') AND p.kind NOT IN ('mock','mock-image','mock-video','mock-text')
        ORDER BY r.modality, COALESCE(r.model_family,m.model_key), r.route_key, (r.tenant_id=$1::uuid) DESC NULLS LAST, r.priority ASC`, [ctx.tenantId]);
      return result.rows.map((row) => ({ key: row.key, label: row.label, kind: row.kind, routeKey: row.route_key }));
    }, this.pool);
  }
}
