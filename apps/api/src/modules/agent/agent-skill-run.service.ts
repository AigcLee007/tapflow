import type { Pool } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import { assertSkillRunTransition, assertSkillStepTransition, canSkillApprovalTransition, type SkillRunStatus, type SkillStepStatus } from "./agent-skill-policy.js";

export type SkillRunContext = { tenantId: string; userId: string | null };
export type SkillRunView = {
  approvalState: "not_required" | "pending" | "approved" | "rejected";
  budgetSnapshot: Record<string, unknown>;
  error: Record<string, unknown> | null;
  flowId: string | null;
  graphRevision: number | null;
  id: string;
  idempotencyKey: string;
  output: Record<string, unknown>;
  projectId: string | null;
  sessionId: string | null;
  skillVersionId: string;
  status: SkillRunStatus;
  steps: SkillStepView[];
  turnId: string | null;
};
export type SkillStepView = {
  action: "analyze" | "canvas" | "text" | "image" | "video" | "review" | "deliver";
  approvalState: "not_required" | "pending" | "approved" | "rejected";
  assetId: string | null;
  error: Record<string, unknown> | null;
  id: string;
  nodeId: string | null;
  output: Record<string, unknown>;
  retryCount: number;
  status: SkillStepStatus;
  stepIndex: number;
  workflowRunId: string | null;
};

export type SkillRunRepository = {
  createRun(input: { tenantId: string; sessionId?: string | null; turnId?: string | null; projectId?: string | null; flowId?: string | null; skillVersionId: string; idempotencyKey: string; graphRevision?: number | null; budgetSnapshot?: Record<string, unknown>; approvalState?: SkillRunView["approvalState"] }): Promise<{ id: string; created: boolean }>;
  getRun(context: SkillRunContext, runId: string): Promise<SkillRunView | null>;
  listEvents(context: SkillRunContext, runId: string, afterSeq?: number): Promise<SkillRunEventView[]>;
  transitionRun(context: SkillRunContext, runId: string, from: SkillRunStatus, to: SkillRunStatus, patch?: { approvalState?: SkillRunView["approvalState"]; error?: Record<string, unknown> | null; output?: Record<string, unknown> }): Promise<SkillRunView>;
  approveRun(context: SkillRunContext, runId: string): Promise<SkillRunView>;
  cancelRun(context: SkillRunContext, runId: string, reason?: string): Promise<SkillRunView>;
  createStep(input: { tenantId: string; skillRunId: string; stepIndex: number; action: SkillStepView["action"]; approvalState?: SkillStepView["approvalState"]; nodeId?: string | null }): Promise<SkillStepView>;
  updateStep(context: SkillRunContext, stepId: string, patch: { status?: SkillStepStatus; approvalState?: SkillStepView["approvalState"]; output?: Record<string, unknown>; error?: Record<string, unknown> | null; nodeId?: string | null; workflowRunId?: string | null; assetId?: string | null; retryCount?: number }): Promise<SkillStepView>;
  replaceBudgetSnapshot?(context: SkillRunContext, runId: string, snapshot: Record<string, unknown>): Promise<SkillRunView>;
  claimApprovalLaunch?(context: SkillRunContext, runId: string): Promise<boolean>;
};

export type SkillRunEventView = {
  eventJson: Record<string, unknown>;
  eventType: string;
  fromStatus: string | null;
  id: string;
  seq: number;
  toStatus: string;
};

export class DatabaseSkillRunRepository implements SkillRunRepository {
  readonly pool: Pool;
  constructor(options: { pool?: Pool } = {}) { this.pool = options.pool ?? createPgPool(); }

  async createRun(input: Parameters<SkillRunRepository["createRun"]>[0]): Promise<{ id: string; created: boolean }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string }>(`INSERT INTO agent_skill_runs (tenant_id, session_id, turn_id, project_id, flow_id, skill_version_id, status, approval_state, idempotency_key, graph_revision, budget_snapshot) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'draft',$7,$8,$9,$10::jsonb) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING RETURNING id::text AS id`, [input.tenantId, input.sessionId ?? null, input.turnId ?? null, input.projectId ?? null, input.flowId ?? null, input.skillVersionId, input.approvalState ?? "not_required", input.idempotencyKey, input.graphRevision ?? null, JSON.stringify(input.budgetSnapshot ?? {})]);
      if (result.rows[0]) return { id: result.rows[0].id, created: true };
      const existing = await client.query<{ id: string }>(`SELECT id::text AS id FROM agent_skill_runs WHERE tenant_id = $1::uuid AND idempotency_key = $2`, [input.tenantId, input.idempotencyKey]);
      if (!existing.rows[0]) throw new Error("SKILL_RUN_IDEMPOTENCY_CONFLICT");
      return { id: existing.rows[0].id, created: false };
    }, this.pool);
  }

  async getRun(context: SkillRunContext, runId: string): Promise<SkillRunView | null> {
    return withTenantTransaction(context, async (client) => {
      const run = await client.query<RunRow>(`SELECT id::text AS id, skill_version_id::text AS skill_version_id, session_id::text AS session_id, turn_id::text AS turn_id, project_id::text AS project_id, flow_id::text AS flow_id, status, approval_state, idempotency_key, graph_revision::text AS graph_revision, budget_snapshot, output_json, error_json FROM agent_skill_runs WHERE tenant_id = $1::uuid AND id = $2::uuid`, [context.tenantId, runId]);
      const row = run.rows[0];
      if (!row) return null;
      const steps = await client.query<StepRow>(`SELECT id::text AS id, step_index, action, status, approval_state, node_id, workflow_run_id::text AS workflow_run_id, asset_id::text AS asset_id, retry_count, output_json, error_json FROM agent_skill_step_runs WHERE tenant_id = $1::uuid AND skill_run_id = $2::uuid ORDER BY step_index ASC`, [context.tenantId, runId]);
      return mapRun(row, steps.rows.map(mapStep));
    }, this.pool);
  }

  async listEvents(context: SkillRunContext, runId: string, afterSeq = 0): Promise<SkillRunEventView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{
        event_json: Record<string, unknown>;
        event_type: string;
        from_status: string | null;
        id: string;
        seq: number;
        to_status: string;
      }>(`SELECT id::text AS id, seq, event_type, from_status, to_status, event_json FROM agent_skill_run_events WHERE tenant_id = $1::uuid AND skill_run_id = $2::uuid AND seq > $3 ORDER BY seq ASC LIMIT 200`, [context.tenantId, runId, Math.max(0, afterSeq)]);
      return result.rows.map((row) => ({ eventJson: row.event_json ?? {}, eventType: row.event_type, fromStatus: row.from_status, id: row.id, seq: Number(row.seq), toStatus: row.to_status }));
    }, this.pool);
  }

  async transitionRun(context: SkillRunContext, runId: string, from: SkillRunStatus, to: SkillRunStatus, patch: Parameters<SkillRunRepository["transitionRun"]>[4] = {}): Promise<SkillRunView> {
    assertSkillRunTransition(from, to);
    return withTenantTransaction(context, async (client) => {
      const currentResult = await client.query<{ status: SkillRunStatus; approval_state: SkillRunView["approvalState"] }>(`SELECT status, approval_state FROM agent_skill_runs WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE`, [context.tenantId, runId]);
      const current = currentResult.rows[0];
      if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
      if (current.status !== from) throw new Error("SKILL_RUN_STALE_TRANSITION");
      const nextApproval = patch.approvalState ?? current.approval_state;
      if (!canSkillApprovalTransition(current.approval_state, nextApproval)) throw new Error("SKILL_RUN_INVALID_APPROVAL");
      if (to === "waiting_for_approval" && nextApproval !== "pending") throw new Error("SKILL_RUN_APPROVAL_REQUIRED");
      if (from === "waiting_for_approval" && to === "running" && nextApproval !== "approved") throw new Error("SKILL_RUN_APPROVAL_REQUIRED");
      const result = await client.query<{ id: string; skill_version_id: string; turn_id: string | null; idempotency_key: string; graph_revision: string | null }>(`UPDATE agent_skill_runs SET status = $3, approval_state = COALESCE($4, approval_state), output_json = COALESCE($5::jsonb, output_json), error_json = $6::jsonb, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = $7 RETURNING id::text AS id, skill_version_id::text AS skill_version_id, turn_id::text AS turn_id, idempotency_key, graph_revision::text AS graph_revision`, [context.tenantId, runId, to, patch.approvalState ?? null, patch.output ? JSON.stringify(patch.output) : null, patch.error ? JSON.stringify(patch.error) : null, from]);
      if (result.rowCount !== 1) throw new Error("SKILL_RUN_STALE_TRANSITION");
      const row = result.rows[0]!;
      await client.query(`INSERT INTO agent_skill_run_events (tenant_id, skill_run_id, seq, event_type, from_status, to_status, skill_version_id, turn_id, idempotency_key, graph_revision, redaction_version, event_json) VALUES ($1::uuid,$2::uuid,(SELECT COALESCE(MAX(seq),0)+1 FROM agent_skill_run_events WHERE tenant_id=$1::uuid AND skill_run_id=$2::uuid),$3,$4,$5,$6::uuid,$7::uuid,$8,$9::bigint,'v2',$10::jsonb)`, [context.tenantId, row.id, "skill_run.transition", from, to, row.skill_version_id, row.turn_id, row.idempotency_key, row.graph_revision, JSON.stringify({ approvalState: patch.approvalState ?? null, error: patch.error ?? null, output: patch.output ?? null })]);
      const next = await this.getRun(context, runId);
      if (!next) throw new Error("SKILL_RUN_NOT_FOUND");
      return next;
    }, this.pool);
  }

  async approveRun(context: SkillRunContext, runId: string): Promise<SkillRunView> {
    const current = await this.getRun(context, runId);
    if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
    if (current.approvalState === "approved") return current;
    if (current.approvalState !== "pending" || current.status !== "waiting_for_approval") throw new Error("SKILL_RUN_STALE_APPROVAL");
    return this.transitionRun(context, runId, "waiting_for_approval", "running", { approvalState: "approved" });
  }

  async cancelRun(context: SkillRunContext, runId: string, reason = "Cancelled by user"): Promise<SkillRunView> {
    const current = await this.getRun(context, runId);
    if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
    if (current.status === "cancelled") return current;
    if (["succeeded", "partial_success", "failed"].includes(current.status)) throw new Error("SKILL_RUN_ALREADY_TERMINAL");
    return this.transitionRun(context, runId, current.status, "cancelled", {
      approvalState: current.approvalState === "pending" ? "rejected" : current.approvalState,
      error: { code: "SKILL_RUN_CANCELLED", reason },
    });
  }

  async createStep(input: Parameters<SkillRunRepository["createStep"]>[0]): Promise<SkillStepView> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<StepRow>(`INSERT INTO agent_skill_step_runs (tenant_id, skill_run_id, step_index, action, approval_state, node_id) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6) ON CONFLICT (skill_run_id,step_index) DO UPDATE SET action = agent_skill_step_runs.action RETURNING id::text AS id, step_index, action, status, approval_state, node_id, workflow_run_id::text AS workflow_run_id, asset_id::text AS asset_id, retry_count, output_json, error_json`, [input.tenantId, input.skillRunId, input.stepIndex, input.action, input.approvalState ?? "not_required", input.nodeId ?? null]);
      return mapStep(result.rows[0]!);
    }, this.pool);
  }

  async updateStep(context: SkillRunContext, stepId: string, patch: Parameters<SkillRunRepository["updateStep"]>[2]): Promise<SkillStepView> {
    return withTenantTransaction(context, async (client) => {
      // Step events share the run sequence. Lock the parent run before the
      // update so concurrent step completions cannot allocate the same seq.
      await client.query(`SELECT run.id FROM agent_skill_runs run JOIN agent_skill_step_runs step ON step.skill_run_id = run.id WHERE run.tenant_id = $1::uuid AND step.tenant_id = $1::uuid AND step.id = $2::uuid FOR UPDATE`, [context.tenantId, stepId]);
      const result = await client.query<StepRow & { skill_run_id: string; skill_version_id: string; turn_id: string | null; idempotency_key: string; graph_revision: string | null; previous_status: SkillStepStatus }>(`WITH current AS (SELECT status AS previous_status FROM agent_skill_step_runs WHERE tenant_id = $1::uuid AND id = $2::uuid) UPDATE agent_skill_step_runs SET status = COALESCE($3,status), approval_state = COALESCE($4,approval_state), output_json = COALESCE($5::jsonb,output_json), error_json = $6::jsonb, node_id = COALESCE($7,node_id), workflow_run_id = COALESCE($8::uuid,workflow_run_id), asset_id = COALESCE($9::uuid,asset_id), retry_count = COALESCE($10,retry_count), updated_at = now() FROM current WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING agent_skill_step_runs.id::text AS id, step_index, action, agent_skill_step_runs.status, approval_state, node_id, workflow_run_id::text AS workflow_run_id, asset_id::text AS asset_id, retry_count, output_json, error_json, skill_run_id::text AS skill_run_id, (SELECT skill_version_id::text FROM agent_skill_runs WHERE id = agent_skill_step_runs.skill_run_id) AS skill_version_id, (SELECT turn_id::text FROM agent_skill_runs WHERE id = agent_skill_step_runs.skill_run_id) AS turn_id, (SELECT idempotency_key FROM agent_skill_runs WHERE id = agent_skill_step_runs.skill_run_id) AS idempotency_key, (SELECT graph_revision::text FROM agent_skill_runs WHERE id = agent_skill_step_runs.skill_run_id) AS graph_revision, current.previous_status`, [context.tenantId, stepId, patch.status ?? null, patch.approvalState ?? null, patch.output ? JSON.stringify(patch.output) : null, patch.error ? JSON.stringify(patch.error) : null, patch.nodeId ?? null, patch.workflowRunId ?? null, patch.assetId ?? null, patch.retryCount ?? null]);
      if (!result.rows[0]) throw new Error("SKILL_STEP_NOT_FOUND");
      const row = result.rows[0];
      assertSkillStepTransition(row.previous_status, row.status);
      if (row.previous_status !== row.status || patch.error || patch.output) {
        await client.query(`INSERT INTO agent_skill_run_events (tenant_id, skill_run_id, seq, event_type, from_status, to_status, skill_version_id, turn_id, idempotency_key, graph_revision, redaction_version, event_json) VALUES ($1::uuid,$2::uuid,(SELECT COALESCE(MAX(seq),0)+1 FROM agent_skill_run_events WHERE tenant_id=$1::uuid AND skill_run_id=$2::uuid),'skill_step.transition',$3,$4,$5::uuid,$6::uuid,$7,$8::bigint,'v2',$9::jsonb)`, [context.tenantId, row.skill_run_id, row.previous_status, row.status, row.skill_version_id, row.turn_id, row.idempotency_key, row.graph_revision, JSON.stringify({ stepId: row.id, stepIndex: row.step_index, action: row.action, approvalState: patch.approvalState ?? null, error: patch.error ?? null, output: patch.output ?? null })]);
      }
      return mapStep(row);
    }, this.pool);
  }

  async replaceBudgetSnapshot(context: SkillRunContext, runId: string, snapshot: Record<string, unknown>): Promise<SkillRunView> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query(`UPDATE agent_skill_runs SET budget_snapshot = $3::jsonb, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid RETURNING id`, [context.tenantId, runId, JSON.stringify(snapshot)]);
      if (result.rowCount !== 1) throw new Error("SKILL_RUN_NOT_FOUND");
      const run = await client.query<RunRow>(`SELECT id::text AS id, skill_version_id::text AS skill_version_id, session_id::text AS session_id, turn_id::text AS turn_id, project_id::text AS project_id, flow_id::text AS flow_id, status, approval_state, idempotency_key, graph_revision::text AS graph_revision, budget_snapshot, output_json, error_json FROM agent_skill_runs WHERE tenant_id = $1::uuid AND id = $2::uuid`, [context.tenantId, runId]);
      const row = run.rows[0];
      if (!row) throw new Error("SKILL_RUN_NOT_FOUND");
      const steps = await client.query<StepRow>(`SELECT id::text AS id, step_index, action, status, approval_state, node_id, workflow_run_id::text AS workflow_run_id, asset_id::text AS asset_id, retry_count, output_json, error_json FROM agent_skill_step_runs WHERE tenant_id = $1::uuid AND skill_run_id = $2::uuid ORDER BY step_index ASC`, [context.tenantId, runId]);
      return mapRun(row, steps.rows.map(mapStep));
    }, this.pool);
  }

  async claimApprovalLaunch(context: SkillRunContext, runId: string): Promise<boolean> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query(`UPDATE agent_skill_runs SET output_json = jsonb_set(COALESCE(output_json, '{}'::jsonb), '{approvalLaunchClaimed}', 'true'::jsonb), updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'running' AND approval_state = 'approved' AND COALESCE(output_json->>'approvalLaunchClaimed', 'false') <> 'true' RETURNING id`, [context.tenantId, runId]);
      return result.rowCount === 1;
    }, this.pool);
  }
}

export class SkillRunService {
  readonly repository: SkillRunRepository;

  constructor(repository?: SkillRunRepository) {
    if (repository) {
      this.repository = repository;
      return;
    }

    let databaseRepository: SkillRunRepository | undefined;
    const getRepository = () => (databaseRepository ??= new DatabaseSkillRunRepository());
    this.repository = {
      approveRun: (...args) => getRepository().approveRun(...args),
      cancelRun: (...args) => getRepository().cancelRun(...args),
      createRun: (...args) => getRepository().createRun(...args),
      createStep: (...args) => getRepository().createStep(...args),
      getRun: (...args) => getRepository().getRun(...args),
      listEvents: (...args) => getRepository().listEvents(...args),
      transitionRun: (...args) => getRepository().transitionRun(...args),
      updateStep: (...args) => getRepository().updateStep(...args),
      replaceBudgetSnapshot: (...args) => getRepository().replaceBudgetSnapshot!(...args),
      claimApprovalLaunch: (...args) => getRepository().claimApprovalLaunch!(...args),
    };
  }

  createRun(input: Parameters<SkillRunRepository["createRun"]>[0]) { return this.repository.createRun(input); }
  getRun(context: SkillRunContext, runId: string) { return this.repository.getRun(context, runId); }
  listEvents(context: SkillRunContext, runId: string, afterSeq?: number) { return this.repository.listEvents(context, runId, afterSeq); }
  transition(context: SkillRunContext, runId: string, from: SkillRunStatus, to: SkillRunStatus, patch?: Parameters<SkillRunRepository["transitionRun"]>[4]) { return this.repository.transitionRun(context, runId, from, to, patch); }
  async approve(context: SkillRunContext, runId: string) {
    const current = await this.repository.getRun(context, runId);
    if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
    if (current.approvalState === "approved") return current;
    if (current.status !== "waiting_for_approval" || current.approvalState !== "pending") throw new Error("SKILL_RUN_STALE_APPROVAL");
    return this.repository.approveRun(context, runId);
  }
  async cancel(context: SkillRunContext, runId: string, reason?: string) {
    const current = await this.repository.getRun(context, runId);
    if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
    if (current.status === "cancelled") return current;
    if (["succeeded", "partial_success", "failed"].includes(current.status)) {
      throw new Error("SKILL_RUN_ALREADY_TERMINAL");
    }
    return this.repository.cancelRun(context, runId, reason);
  }
  createStep(input: Parameters<SkillRunRepository["createStep"]>[0]) { return this.repository.createStep(input); }
  updateStep(context: SkillRunContext, stepId: string, patch: Parameters<SkillRunRepository["updateStep"]>[2]) { return this.repository.updateStep(context, stepId, patch); }
  replaceBudgetSnapshot(context: SkillRunContext, runId: string, snapshot: Record<string, unknown>) {
    if (!this.repository.replaceBudgetSnapshot) throw new Error("SKILL_RUN_SNAPSHOT_NOT_CONFIGURED");
    return this.repository.replaceBudgetSnapshot(context, runId, snapshot);
  }
  claimApprovalLaunch(context: SkillRunContext, runId: string) {
    if (!this.repository.claimApprovalLaunch) throw new Error("SKILL_RUN_LAUNCH_CLAIM_NOT_CONFIGURED");
    return this.repository.claimApprovalLaunch(context, runId);
  }
}

type RunRow = { id: string; skill_version_id: string; session_id: string | null; turn_id: string | null; project_id: string | null; flow_id: string | null; status: SkillRunStatus; approval_state: SkillRunView["approvalState"]; idempotency_key: string; graph_revision: string | null; budget_snapshot: Record<string, unknown>; output_json: Record<string, unknown>; error_json: Record<string, unknown> | null };
type StepRow = { id: string; step_index: number; action: SkillStepView["action"]; status: SkillStepStatus; approval_state: SkillStepView["approvalState"]; node_id: string | null; workflow_run_id: string | null; asset_id: string | null; retry_count: number; output_json: Record<string, unknown>; error_json: Record<string, unknown> | null };
function mapStep(row: StepRow): SkillStepView { return { action: row.action, approvalState: row.approval_state, assetId: row.asset_id, error: row.error_json, id: row.id, nodeId: row.node_id, output: row.output_json ?? {}, retryCount: row.retry_count, status: row.status, stepIndex: Number(row.step_index), workflowRunId: row.workflow_run_id }; }
function mapRun(row: RunRow, steps: SkillStepView[]): SkillRunView { return { approvalState: row.approval_state, budgetSnapshot: row.budget_snapshot ?? {}, error: row.error_json, flowId: row.flow_id, graphRevision: row.graph_revision === null ? null : Number(row.graph_revision), id: row.id, idempotencyKey: row.idempotency_key, output: row.output_json ?? {}, projectId: row.project_id, sessionId: row.session_id, skillVersionId: row.skill_version_id, status: row.status, steps, turnId: row.turn_id }; }
