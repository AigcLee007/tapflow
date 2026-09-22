import { describe, expect, test } from "vitest";
import { projectTaskAttempts, projectTaskDiagnostics, projectTaskTimeline } from "../src/modules/console-query/console-query.service.js";

describe("console task safe detail projection", () => {
  test("projects lifecycle rows into a bounded timeline without payload JSON", () => {
    const result = projectTaskTimeline([
      { id: "event-1", kind: "task", event_type: "started", status: "running", node_run_id: null, execution_id: "run-1", attempt: null, created_at: "2026-09-21T10:00:00.000Z", finished_at: null, payload: { prompt: "private prompt" } },
      { id: "node-1", kind: "node", event_type: "video.generate", status: "succeeded", node_run_id: "node-1", execution_id: "node-1", attempt: 1, created_at: "2026-09-21T10:01:00.000Z", finished_at: "2026-09-21T10:02:00.000Z", payload: { output: "private output" } },
    ]);

    expect(result).toEqual([
      expect.objectContaining({ id: "event-1", kind: "task", label: "started", status: "running", nodeRunId: null }),
      expect.objectContaining({ id: "node-1", kind: "node", label: "video.generate", status: "succeeded", attempt: 1 }),
    ]);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  test("projects physical attempts and keeps only safe diagnostic identifiers", () => {
    const result = projectTaskAttempts([
      {
        id: "call-1", node_run_id: "node-1", execution_id: "exec-1", attempt: 2,
        operation: "poll", status: "http_failed", traffic_class: "user_generation",
        provider_request_id: "req-1", provider_task_id: "task-1", trace_id: "trace-1",
        http_status: 500, latency_ms: 120, connection_name_snapshot: "Primary",
        upstream_model_snapshot: "vendor/model-v1", product_model_key: "image",
        route_key_snapshot: "route-a", route_label_snapshot: "线路一",
        request_started_at: "2026-09-21T10:01:00.000Z", request_completed_at: "2026-09-21T10:01:00.120Z",
        error: { code: "HTTP_500", message: "private provider response" }, created_at: "2026-09-21T10:01:00.120Z",
      },
    ]);

    expect(result).toEqual([expect.objectContaining({
      id: "call-1", attempt: 2, operation: "poll", transportStatus: "http_failed",
      providerRequestId: "req-1", providerTaskId: "task-1", traceId: "trace-1",
      errorCode: "HTTP_500", connectionName: "Primary", upstreamModel: "vendor/model-v1",
    })]);
    expect(JSON.stringify(result)).not.toContain("private provider response");
  });

  test("separates actor and billing identities from physical request diagnostics", () => {
    const result = projectTaskDiagnostics([
      { actor_user_id: "10000000-0000-4000-8000-000000000001", billed_user_id: "10000000-0000-4000-8000-000000000002", trace_id: "trace-1", provider_request_id: "req-1", provider_task_id: "task-1", connection_name_snapshot: "Primary", upstream_model_snapshot: "vendor/model-v1", error: { code: "HTTP_500" } },
      { actor_user_id: null, billed_user_id: null, trace_id: "trace-1", provider_request_id: "req-2", provider_task_id: "task-1", connection_name_snapshot: "Secondary", upstream_model_snapshot: "vendor/model-v2", error: { code: "NETWORK_ERROR" } },
    ]);

    expect(result).toEqual({
      actorUserId: "10000000-0000-4000-8000-000000000001",
      billedUserId: "10000000-0000-4000-8000-000000000002",
      traceIds: ["trace-1"],
      providerRequestIds: ["req-1", "req-2"],
      providerTaskIds: ["task-1"],
      connectionNames: ["Primary", "Secondary"],
      upstreamModels: ["vendor/model-v1", "vendor/model-v2"],
      errorCodes: ["HTTP_500", "NETWORK_ERROR"],
    });
  });
});
