import { pathToFileURL } from "node:url";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

type SmokeArgs = {
  apiBaseUrl: string;
  count: number;
  dryRun: boolean;
  flowId: string | null;
  prompt: string;
  tenantId: string | null;
  timeoutMs: number;
  token: string | null;
};

type RunResult = {
  createLatencyMs: number;
  runId: string;
  status: string;
  targetNodeId: string;
};

function parseArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = {
    apiBaseUrl: process.env.TAPFLOW_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:3366",
    count: 3,
    dryRun: false,
    flowId: null,
    prompt: "concurrent smoke test image",
    tenantId: process.env.TAPFLOW_TENANT_ID ?? null,
    timeoutMs: 180_000,
    token: process.env.TAPFLOW_ACCESS_TOKEN ?? null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--api-base-url":
        args.apiBaseUrl = (next ?? args.apiBaseUrl).replace(/\/$/, "");
        index += 1;
        break;
      case "--count":
        args.count = Math.max(1, Number.parseInt(next ?? "", 10) || args.count);
        index += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--flow-id":
        args.flowId = next ?? null;
        index += 1;
        break;
      case "--prompt":
        args.prompt = next ?? args.prompt;
        index += 1;
        break;
      case "--tenant-id":
        args.tenantId = next ?? null;
        index += 1;
        break;
      case "--timeout-ms":
        args.timeoutMs = Number.parseInt(next ?? "", 10) || args.timeoutMs;
        index += 1;
        break;
      case "--token":
        args.token = next ?? null;
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

async function apiFetch<T>(args: SmokeArgs, path: string, init?: RequestInit): Promise<T> {
  if (!args.token) {
    throw new Error("Provide --token or TAPFLOW_ACCESS_TOKEN.");
  }
  const response = await fetch(`${args.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${args.token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return await response.json() as T;
}

async function createSmokeFlow(args: SmokeArgs, nodeIds: string[]): Promise<string> {
  const project = await apiFetch<{ id: string }>(args, "/api/v2/projects", {
    body: JSON.stringify({ name: `Concurrent smoke ${new Date().toISOString()}` }),
    method: "POST",
  });
  const flow = await apiFetch<{ id: string }>(args, `/api/v2/projects/${project.id}/flows`, {
    body: JSON.stringify({ title: "Concurrent target-node smoke" }),
    method: "POST",
  });
  await apiFetch(args, `/api/v2/flows/${flow.id}/draft`, {
    body: JSON.stringify({
      graph: {
        edges: [],
        nodes: nodeIds.map((nodeId, index) => ({
          data: {
            generationPrompt: `${args.prompt} ${index + 1}`,
            routeKey: "image.default",
          },
          id: nodeId,
          position: { x: index * 320, y: 0 },
          type: "image.generate",
        })),
      },
    }),
    method: "PUT",
  });
  return flow.id;
}

async function startRun(args: SmokeArgs, flowId: string, targetNodeId: string): Promise<RunResult> {
  const started = Date.now();
  const result = await apiFetch<{ runId: string; status: string }>(args, `/api/v2/flows/${flowId}/runs`, {
    body: JSON.stringify({
      input: {
        prompt: args.prompt,
        runMode: "target_node",
        targetNodeId,
      },
    }),
    method: "POST",
  });
  return {
    createLatencyMs: Date.now() - started,
    runId: result.runId,
    status: result.status,
    targetNodeId,
  };
}

async function waitForRuns(args: SmokeArgs, runs: RunResult[]) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const details = await Promise.all(runs.map((run) =>
      apiFetch<{ workflowRun: { status: string }; nodeRuns: Array<{ finishedAt: string | null; nodeId: string; startedAt: string | null; status: string }> }>(
        args,
        `/api/v2/workflow-runs/${run.runId}`,
      ),
    ));
    if (details.every((detail) => ["failed", "succeeded", "canceled"].includes(detail.workflowRun.status))) {
      return details;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out after ${args.timeoutMs}ms waiting for workflow runs`);
}

async function loadDbMetrics(tenantId: string, runIds: string[]) {
  const pool = createPgPool();
  try {
    return await withTenantTransaction(
      { tenantId, userId: null },
      async (client) => {
        const nodeRuns = await client.query(
          `
            SELECT
              workflow_run_id::text AS workflow_run_id,
              id::text AS node_run_id,
              node_id,
              status,
              started_at::text AS started_at,
              finished_at::text AS finished_at
            FROM node_runs
            WHERE workflow_run_id = ANY($1::uuid[])
            ORDER BY started_at ASC NULLS LAST
          `,
          [runIds],
        );
        const calls = await client.query(
          `
            SELECT
              workflow_run_id::text AS workflow_run_id,
              node_run_id::text AS node_run_id,
              status,
              created_at::text AS provider_started_at,
              latency_ms
            FROM ai_call_logs
            WHERE workflow_run_id = ANY($1::uuid[])
            ORDER BY created_at ASC
          `,
          [runIds],
        );
        const ledger = await client.query(
          `
            SELECT entry_type, COUNT(*)::int AS count
            FROM billing_ledger
            WHERE metadata->>'workflowRunId' = ANY($1::text[])
            GROUP BY entry_type
            ORDER BY entry_type
          `,
          [runIds],
        );
        return {
          billingLedger: ledger.rows,
          nodeRuns: nodeRuns.rows,
          providerCalls: calls.rows,
        };
      },
      pool,
    );
  } finally {
    await pool.end();
  }
}

function summarizeWarnings(runs: RunResult[], metrics: Awaited<ReturnType<typeof loadDbMetrics>> | null): string[] {
  const warnings: string[] = [];
  for (const run of runs) {
    if (run.createLatencyMs > 2000) {
      warnings.push(`create run for ${run.targetNodeId} took ${run.createLatencyMs}ms`);
    }
  }
  const starts = (metrics?.providerCalls ?? [])
    .map((row: { provider_started_at?: string }) => row.provider_started_at ? Date.parse(row.provider_started_at) : NaN)
    .filter((value: number) => Number.isFinite(value));
  if (starts.length >= 2 && Math.max(...starts) - Math.min(...starts) > 5000) {
    warnings.push(`provider_started_at spread is ${Math.max(...starts) - Math.min(...starts)}ms`);
  }
  return warnings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nodeIds = Array.from({ length: args.count }, (_, index) => `smoke-image-${Date.now()}-${index + 1}`);
  const flowId = args.flowId ?? (args.dryRun ? "dry-run-flow" : await createSmokeFlow(args, nodeIds));

  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, flowId, nodeIds }, null, 2));
    return;
  }

  const runs = await Promise.all(nodeIds.map((nodeId) => startRun(args, flowId, nodeId)));
  const details = await waitForRuns(args, runs);
  const metrics = args.tenantId ? await loadDbMetrics(args.tenantId, runs.map((run) => run.runId)) : null;
  const warnings = summarizeWarnings(runs, metrics);

  console.log(JSON.stringify({
    details: details.map((detail) => detail.workflowRun),
    flowId,
    metrics,
    runs,
    success: details.every((detail) => detail.workflowRun.status === "succeeded"),
    warnings,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
