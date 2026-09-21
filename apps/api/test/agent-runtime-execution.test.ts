import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowRunsService } from "../src/modules/workflow-runs/workflow-runs.service.js";

const tenantId = randomUUID();
const userId = randomUUID();
const flowId = randomUUID();
const projectId = randomUUID();
const context = { tenantId, userId };
const graph = {
  nodes: ["one", "two"].map((id) => ({
    id, type: "image.generate", data: { routeKey: "image.test", generationPrompt: `Product direction ${id}` },
  })),
  edges: [],
};

function fixture(options: { owner?: boolean; pricing?: boolean; revision?: number; assets?: string[]; routeRevision?: string; routeModality?: string; providerStatus?: string } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const versions: Array<Record<string, unknown>> = [];
  const runs: Array<Record<string, unknown>> = [];
  const nodeRuns: Array<Record<string, unknown>> = [];
  const reserve = vi.fn(async () => ({ id: randomUUID() }));
  const add = vi.fn(async () => ({ id: randomUUID() }));
  let before: { versions: number; runs: number; nodeRuns: number };
  const query = async (rawSql: string, values: unknown[] = []) => {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    calls.push({ sql, values });
    if (sql === "BEGIN") before = { versions: versions.length, runs: runs.length, nodeRuns: nodeRuns.length };
    if (sql === "ROLLBACK") {
      versions.length = before.versions;
      runs.length = before.runs;
      nodeRuns.length = before.nodeRuns;
    }
    if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SELECT set_config|SELECT pg_advisory)/.test(sql)) return { rows: [] };
    if (sql.includes("FROM flows") && sql.includes("JOIN projects")) {
      expect(sql).toContain("flows.tenant_id = $2::uuid");
      expect(sql).toContain("projects.created_by = $3::uuid");
      expect(values).toEqual([flowId, tenantId, userId]);
      return { rows: options.owner === false ? [] : [{ id: flowId, project_id: projectId, status: "draft", current_version_id: "user-version" }] };
    }
    if (sql.includes("FROM flow_drafts")) return { rows: [{ revision: options.revision ?? 4 }] };
    if (sql.includes("FROM assets")) return { rows: (options.assets ?? []).map((id) => ({ id, kind: "image", status: "available", project_id: projectId })) };
    if (sql.includes("INSERT INTO flow_versions")) {
      const version = { id: values[0], checksum: values[5], compiled_graph_json: JSON.parse(String(values[4])), graph_json: JSON.parse(String(values[3])) };
      versions.push(version);
      return { rows: [version] };
    }
    if (sql.includes("FROM flow_versions")) return { rows: versions.filter((version) => version.checksum === values[1]) };
    if (sql.includes("FROM ai_routes")) return { rows: [{ route_key: "image.test", provider_key: "provider", model_key: "model", model_capabilities: {}, request_config: {}, route_binding: { updatedAt: options.routeRevision ?? "v1" }, route_modality: options.routeModality ?? "image", provider_status: options.providerStatus ?? "active", model_status: "active" }] };
    if (sql.includes("FROM model_pricing")) return { rows: options.pricing === false ? [] : [{ provider: "provider", model: "model", route: "image.test", unit: "image_generation", unit_credits: "7", min_charge_credits: "7" }] };
    if (sql.includes("INSERT INTO workflow_runs")) {
      const run = { id: values[0], tenant_id: values[1], flow_id: values[2], flow_version_id: values[3], status: "pending", input_json: JSON.parse(String(values[4])), idempotency_key: values[5], created_by: values[6] };
      runs.push(run);
      return { rows: [run] };
    }
    if (sql.includes("FROM workflow_runs")) return { rows: runs.filter((run) => run.idempotency_key === values[1]) };
    if (sql.includes("INSERT INTO node_runs")) {
      nodeRuns.push({ nodeId: values[3], type: values[4], status: values[5] });
      return { rows: [] };
    }
    if (sql.includes("FROM billing_accounts")) return { rows: [{ membership_tier: "free" }] };
    if (sql.includes("FROM workflow_run_events")) return { rows: [{ next_sequence: 1 }] };
    if (/^(INSERT INTO (workflow_run_events|audit_logs)|UPDATE node_runs)/.test(sql)) return { rows: [] };
    throw new Error(`Unexpected database operation: ${sql}`);
  };
  const client = { query, release() {} };
  const pool = { connect: async () => client, query };
  const service = new WorkflowRunsService({ pool: pool as never, nodeExecuteQueue: { add }, personalWalletService: { reserveUsageWithClient: reserve } as never });
  vi.spyOn(console, "info").mockImplementation(() => {});
  return { service, calls, versions, runs, nodeRuns, reserve, add };
}

afterEach(() => vi.restoreAllMocks());

describe("server-owned Agent execution snapshots", () => {
  it("requires an approval binding at the service entry", async () => {
    const f = fixture();
    await expect(f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, idempotencyKey: "agent:unapproved" })).rejects.toMatchObject({ code: "AGENT_APPROVAL_REQUIRED" });
    expect(f.reserve).not.toHaveBeenCalled();
  });
  it("invalidates approval when the route binding changes without a price change", async () => {
    const options = { routeRevision: "v1" };
    const f = fixture(options);
    const quote = await f.service.quoteAgentWorkflowRun(context, flowId, { graph, graphRevision: 4 });
    options.routeRevision = "v2";
    await expect(f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:route-changed", expectedQuoteFingerprint: quote.fingerprint })).rejects.toMatchObject({ code: "AGENT_QUOTE_CHANGED" });
    expect(f.reserve).not.toHaveBeenCalled();
  });

  it.each([{ routeModality: "text" }, { providerStatus: "inactive" }])("rejects an unavailable or wrong-modality resolved route: %j", async (options) => {
    const f = fixture(options);
    await expect(f.service.quoteAgentWorkflowRun(context, flowId, { graph, graphRevision: 4 })).rejects.toMatchObject({ code: "AGENT_ROUTE_UNAVAILABLE" });
    expect(f.reserve).not.toHaveBeenCalled();
  });
  it("quotes the same total later reserved, without creating a snapshot", async () => {
    const f = fixture();
    const quote = await f.service.quoteAgentWorkflowRun(context, flowId, { graph, graphRevision: 4 });
    expect(quote).toMatchObject({ credits: 14, nodes: [{ credits: 7, modelKey: "model" }, { credits: 7, modelKey: "model" }] });
    expect(f.versions).toHaveLength(0);
    expect(f.reserve).not.toHaveBeenCalled();
    await f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:quoted", expectedQuoteFingerprint: quote.fingerprint });
    expect(f.reserve).toHaveBeenCalledTimes(2);
  });

  it("rejects a stale quote before reservation", async () => {
    const f = fixture();
    await expect(f.service.createAgentWorkflowRun(context, flowId, {
      graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:quote-changed", expectedQuoteFingerprint: "old-fingerprint",
    })).rejects.toMatchObject({ statusCode: 409, code: "AGENT_QUOTE_CHANGED" });
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.add).not.toHaveBeenCalled();
    expect(f.runs).toHaveLength(0);
  });

  it("runs parallel image roots without writing the user's draft or current version", async () => {
    const f = fixture();
    expect(typeof f.service.createAgentWorkflowRun).toBe("function");
    const result = await f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:approval:1" });
    expect(result.status).toBe("pending");
    expect(f.versions).toHaveLength(1);
    expect(f.nodeRuns).toEqual([{ nodeId: "one", type: "image.generate", status: "runnable" }, { nodeId: "two", type: "image.generate", status: "runnable" }]);
    expect(f.reserve).toHaveBeenCalledTimes(2);
    expect(f.reserve.mock.calls.map((call) => (call as unknown[])[2])).toEqual(expect.arrayContaining([expect.objectContaining({ amountCredits: 7 })]));
    expect(f.add).toHaveBeenCalledTimes(2);
    expect(f.calls.some(({ sql }) => /^(UPDATE|INSERT INTO) (flows|flow_drafts)\b/.test(sql))).toBe(false);
  });

  it("reuses a durable run after a duplicate approval without reserving again", async () => {
    const f = fixture();
    const input = { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:approval:duplicate" };
    const first = await f.service.createAgentWorkflowRun(context, flowId, input);
    const second = await f.service.createAgentWorkflowRun(context, flowId, input);
    expect(second).toEqual(first);
    expect(f.runs).toHaveLength(1);
    expect(f.versions).toHaveLength(1);
    expect(f.reserve).toHaveBeenCalledTimes(2);
    expect(f.add).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed plan with the same idempotency key", async () => {
    const f = fixture();
    await f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:same" });
    await expect(f.service.createAgentWorkflowRun(context, flowId, {
      graph: { ...graph, nodes: [graph.nodes[0]] }, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:same",
    })).rejects.toMatchObject({ statusCode: 409, code: "AGENT_EXECUTION_IDEMPOTENCY_CONFLICT" });
    expect(f.reserve).toHaveBeenCalledTimes(2);
  });

  it("fails closed before any reserve or enqueue when pricing is missing", async () => {
    const f = fixture({ pricing: false });
    await expect(f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:no-price" })).rejects.toMatchObject({ code: "PRICING_NOT_FOUND" });
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.add).not.toHaveBeenCalled();
    expect(f.versions).toHaveLength(0);
    expect(f.runs).toHaveLength(0);
  });

  it("rejects stale revisions before snapshot creation", async () => {
    const f = fixture({ revision: 5 });
    await expect(f.service.createAgentWorkflowRun(context, flowId, { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:stale" })).rejects.toMatchObject({ statusCode: 409, code: "AGENT_GRAPH_REVISION_CONFLICT" });
    expect(f.versions).toHaveLength(0);
    expect(f.reserve).not.toHaveBeenCalled();
  });

  it("requires authenticated project ownership", async () => {
    const f = fixture({ owner: false });
    const input = { graph, graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:owner" };
    await expect(f.service.createAgentWorkflowRun({ ...context, userId: null }, flowId, input)).rejects.toMatchObject({ statusCode: 401 });
    await expect(f.service.createAgentWorkflowRun(context, flowId, input)).rejects.toMatchObject({ statusCode: 404 });
    expect(f.versions).toHaveLength(0);
  });

  it("rejects unresolved or foreign reference assets before spending", async () => {
    const f = fixture();
    const assetId = randomUUID();
    await expect(f.service.createAgentWorkflowRun(context, flowId, {
      graph: { nodes: [{ id: "ref", type: "image.asset", data: { assetId } }, ...graph.nodes], edges: [{ source: "ref", target: "one" }] },
      graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:asset",
    })).rejects.toMatchObject({ code: "AGENT_REFERENCE_NOT_FOUND" });
    expect(f.reserve).not.toHaveBeenCalled();
  });

  it.each(["data:image/png;base64,AAAA", "blob:temporary", "https://assets.test/image?X-Amz-Signature=secret"])("rejects transient graph media: %s", async (value) => {
    const f = fixture();
    await expect(f.service.createAgentWorkflowRun(context, flowId, {
      graph: { nodes: [{ ...graph.nodes[0], data: { ...graph.nodes[0].data, previewUrl: value } }], edges: [] },
      graphRevision: 4, maxApprovedCredits: 14, idempotencyKey: "agent:transient",
    })).rejects.toMatchObject({ code: "UNSUPPORTED_LOCAL_PAYLOAD" });
    expect(f.reserve).not.toHaveBeenCalled();
  });
});

describe("Agent workflow execution adapter", () => {
  it("builds deterministic parallel roots from a server-owned plan and keeps product metadata private", async () => {
    const { AgentExecutionAdapter } = await import("../src/modules/agent/runtime/agent-execution-adapter.js");
    const f = fixture();
    const adapter = new AgentExecutionAdapter({ workflowRuns: f.service });
    const input = { flowId, graphRevision: 4, steps: ["one", "two"].map((stepId) => ({ stepId, kind: "image" as const, routeKey: "image.test", prompt: `Product ${stepId}`, image: { aspectRatio: "9:16" } })) };
    const quote = await adapter.quote(context, input);
    expect(quote.credits).toBe(14);
    expect(quote.steps.map((step) => step.stepId)).toEqual(["one", "two"]);
    expect(JSON.stringify(quote)).not.toContain("image.test");
    const first = await adapter.start(context, { ...input, executionKey: "turn-approved", expectedQuoteFingerprint: quote.fingerprint });
    const second = await adapter.start(context, { ...input, executionKey: "turn-approved", expectedQuoteFingerprint: quote.fingerprint });
    expect(second).toEqual(first);
    expect(Object.keys(first.nodeIdsByStepId)).toEqual(["one", "two"]);
    expect(f.add).toHaveBeenCalledTimes(2);
  });

  it("maps ordered first/last frame references to the existing video schema", async () => {
    const { buildAgentExecutionGraph } = await import("../src/modules/agent/runtime/agent-execution-adapter.js");
    const result = buildAgentExecutionGraph([
      { stepId: "first", kind: "image", routeKey: "image.test", prompt: "Opening frame" },
      { stepId: "last", kind: "image", routeKey: "image.test", prompt: "Closing frame" },
      { stepId: "clip", kind: "video", routeKey: "video.test", prompt: "Camera moves forward", video: {
        mode: "first_last_frame", aspectRatio: "9:16", resolution: "720P", durationSeconds: 4, generateAudio: true, count: 1,
        referenceInputs: [
          { source: { kind: "step", id: "first" }, role: "first_frame", mediaKind: "image" },
          { source: { kind: "step", id: "last" }, role: "last_frame", mediaKind: "image" },
        ],
      } },
    ]);
    const clip = result.graph.nodes.find((node) => node.id === result.nodeIdsByStepId.clip)!;
    expect((clip.data?.params as Record<string, unknown>).videoGeneration).toMatchObject({ schemaVersion: 2, mode: "first_last_frame", referenceInputs: [
      { source: { kind: "upstream", id: result.nodeIdsByStepId.first }, role: "first_frame", order: 0 },
      { source: { kind: "upstream", id: result.nodeIdsByStepId.last }, role: "last_frame", order: 1 },
    ] });
    expect(result.graph.edges).toHaveLength(2);
  });

  it("preserves an actual text generation step and rejects missing dependencies", async () => {
    const { buildAgentExecutionGraph } = await import("../src/modules/agent/runtime/agent-execution-adapter.js");
    const result = buildAgentExecutionGraph([{ stepId: "copy", kind: "text", routeKey: "text.test", prompt: "Write product copy" }]);
    expect(result.graph.nodes[0]).toMatchObject({ type: "text.generate", data: { generationPrompt: "Write product copy", routeKey: "text.test" } });
    expect(() => buildAgentExecutionGraph([{ stepId: "a", kind: "image", routeKey: "image.test", prompt: "Product", dependsOn: ["missing"] }])).toThrow(/dependency/i);
  });

  it("scopes status and cancel to the same owner, tenant and flow", async () => {
    const { AgentExecutionAdapter } = await import("../src/modules/agent/runtime/agent-execution-adapter.js");
    const cancel = vi.fn(async () => ({ status: "canceled" }));
    const adapter = new AgentExecutionAdapter({ workflowRuns: {
      getWorkflowRun: async () => ({ workflowRun: { id: "run", flowId, tenantId, createdBy: userId, inputJson: { agentExecution: {} }, status: "running" }, nodeRuns: [] }),
      cancelWorkflowRun: cancel,
    } as never });
    await expect(adapter.get(context, { flowId: "foreign-flow", runId: "run" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(adapter.cancel({ ...context, userId: "foreign-user" }, { flowId, runId: "run" })).rejects.toMatchObject({ statusCode: 404 });
    expect(cancel).not.toHaveBeenCalled();
    expect((await adapter.get(context, { flowId, runId: "run" })).workflowRun.status).toBe("running");
    await adapter.cancel(context, { flowId, runId: "run" });
    expect(cancel).toHaveBeenCalledWith(context, "run");
  });
});
