import { describe, expect, test } from "vitest";
import { AiGateway } from "../src/ai-gateway.js";
import { DatabaseTextGenerationRuntime } from "../src/database-text-runtime.js";
import { DatabaseMediaRuntime } from "../src/database-media-runtime.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
import type { ResolvedRoute } from "../src/types.js";
import { observeProviderFetch } from "../src/provider-request-telemetry.js";
import { snapshotPendingProviderRoute } from "../src/pending-provider-route.js";

function harness(fetchImplementation: typeof fetch, requestConfig: Record<string, unknown> = {}) {
  const logs: Array<Record<string, any>> = [];
  const route: ResolvedRoute = {
    baseUrl: "https://provider.example", credential: { id: "credential", encryptedSecret: Buffer.from("secret"), nonce: Buffer.from("nonce"), authTag: Buffer.from("tag") },
    model: { id: "model", modelKey: "gpt-image-2" }, provider: { id: "provider", key: "test", kind: "openai-compatible", defaultBaseUrl: null },
    routeId: "route", routeKey: "image.gpt-image-2", requestConfig, priority: 1, weight: 1, status: "active", tenantId: null,
  };
  const runtime = new DatabaseMediaRuntime({ aiGateway: new AiGateway({ "openai-compatible": new OpenAiCompatibleTextAdapter({ fetchImplementation }) }), credentialVault: { getSecretForProviderCall: () => "sk-private-secret" } as never, pool: {} as never });
  Object.defineProperty(runtime, "resolveRoute", { configurable: true, value: async () => route });
  Object.defineProperty(runtime, "getRuntimeRouteById", { configurable: true, value: async () => route });
  Object.defineProperty(runtime, "insertAiCallLog", { value: async (value: Record<string, any>) => { logs.push(value); } });
  const pendingRoutes = new Map<string, ResolvedRoute>();
  Object.defineProperty(runtime, "savePendingRoutes", { value: async (_context: unknown, _executionId: unknown, snapshot: ResolvedRoute, taskIds: string[]) => { for (const id of taskIds) pendingRoutes.set(id, structuredClone(snapshot)); } });
  Object.defineProperty(runtime, "getPendingRoute", { value: async (_context: unknown, _executionId: unknown, taskId: string) => pendingRoutes.get(taskId) ?? null });
  return { logs, runtime, route };
}
const context = { tenantId: "tenant", userId: "user" };
const metadata = { nodeRunId: "node-execution", workflowRunId: "workflow", traceId: "trace" };

describe("physical provider request telemetry", () => {
  test("one submit and three polls are four requests for one execution, with pending distinct from success", async () => {
    let calls = 0;
    const { runtime, logs } = harness(async () => {
      calls += 1;
      return Response.json(calls === 1 ? { task_id: "task-1" } : calls < 4 ? { task_id: "task-1", status: "running" } : { task_id: "task-1", status: "succeeded", data: [{ url: "https://asset.example/result?signature=secret" }] });
    }, { async: true });
    await runtime.generateImage(context, { prompt: "private prompt" }, metadata);
    for (let poll = 0; poll < 3; poll += 1) await runtime.pollTask(context, "image", { providerTaskId: "task-1" }, metadata);
    const requests = logs.filter((row) => row.recordLevel === "request");
    expect(requests).toHaveLength(4);
    expect(requests.map((row) => row.operation)).toEqual(["submit", "poll", "poll", "poll"]);
    expect(new Set(requests.map((row) => row.executionId))).toEqual(new Set(["node-execution"]));
    expect(logs.filter((row) => row.recordLevel === "summary").map((row) => row.status)).toEqual(["waiting_provider", "running", "running", "succeeded"]);
    expect(JSON.stringify(logs)).not.toMatch(/private prompt|sk-private-secret|signature=secret|Authorization/);
  });

  test("image batch splits are distinct physical calls and one summary", async () => {
    let calls = 0;
    const { runtime, logs } = harness(async () => Response.json({ data: [{ b64_json: `image-${++calls}` }] }));
    await runtime.generateImage(context, { prompt: "private", metadata: { n: 2, params: { n: 2 } } }, metadata);
    expect(calls).toBe(2);
    expect(logs.filter((row) => row.recordLevel === "request").map((row) => row.attempt)).toEqual([1, 2]);
    expect(logs.filter((row) => row.recordLevel === "summary")).toHaveLength(1);
  });

  test("network and provider errors only retain safe codes and HTTP metadata", async () => {
    const { runtime, logs } = harness(async () => { throw new Error("sk-private-secret private prompt https://asset.example/?signature=secret"); });
    await expect(runtime.generateImage(context, { prompt: "private prompt" }, metadata)).rejects.toThrow();
    const request = logs.find((row) => row.recordLevel === "request");
    expect(request).toMatchObject({ status: "network_error", requestDispatched: true, httpStatus: null });
    expect(JSON.stringify(logs)).not.toMatch(/private prompt|sk-private-secret|signature=secret|Authorization/);
  });
});

test("accepted provider tasks poll their resolved route after that route is disabled and edited", async () => {
  const urls: string[] = [];
  const { runtime, route } = harness(async (input) => {
    urls.push(String(input));
    return Response.json(urls.length === 1 ? { task_id: "pending-task" } : { status: "running", task_id: "pending-task" });
  }, { async: true, pollPath: "/original/tasks/{task_id}" });
  await runtime.generateImage(context, { prompt: "test" }, metadata);
  route.baseUrl = "https://edited.example";
  route.status = "inactive";
  route.requestConfig.pollPath = "/edited/{task_id}";
  Object.defineProperty(runtime, "resolveRoute", { configurable: true, value: async () => { throw new Error("route inactive"); } });
  await expect(runtime.pollTask(context, "image", { providerTaskId: "pending-task" }, metadata)).resolves.toMatchObject({ status: "running" });
  expect(urls[1]).toBe("https://provider.example/original/tasks/pending-task");
});


test("text diagnostics select the exact inactive route only with explicit opt-in", async () => {
  const { route } = harness(fetch);
  route.status = "inactive";
  let queryArgs: unknown[] = [];
  const runtime = new DatabaseTextGenerationRuntime({ aiGateway: new AiGateway({ "openai-compatible": new OpenAiCompatibleTextAdapter({ fetchImplementation: async () => Response.json({ choices: [{ message: { content: "ok" } }], usage: {} }) }) }), credentialVault: { getSecretForProviderCall: () => "secret" } as never, pool: {} as never });
  Object.defineProperty(runtime, "listRuntimeRoutes", { value: async (...args: unknown[]) => { queryArgs = args; return [route]; } });
  Object.defineProperty(runtime, "insertAiCallLog", { value: async () => undefined });
  await expect(runtime.generateText(context, { messages: [{ role: "user", content: "test" }] }, { routeId: "route", includeInactiveRoute: true, trafficClass: "admin_test", source: "admin" })).resolves.toMatchObject({ routeId: "route" });
  expect(queryArgs[2]).toEqual({ routeId: "route", includeInactiveRoute: true });
  await expect(runtime.generateText(context, { messages: [{ role: "user", content: "test" }] }, { routeId: "route" })).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND" });
});

test("streaming records one transport request plus a separate final stream summary", async () => {
  const { route } = harness(fetch, { capabilities: { supportsTextStreaming: true } });
  const logs: Array<Record<string, any>> = [];
  const runtime = new DatabaseTextGenerationRuntime({ aiGateway: new AiGateway({ "openai-compatible": new OpenAiCompatibleTextAdapter({ fetchImplementation: async () => new Response('data: {"choices":[{"delta":{"content":"private response"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream", "x-request-id": "req-123" } }) }) }), credentialVault: { getSecretForProviderCall: () => "secret" } as never, pool: {} as never });
  Object.defineProperty(runtime, "listRuntimeRoutes", { value: async () => [route] });
  Object.defineProperty(runtime, "insertAiCallLog", { value: async (row: Record<string, any>) => { logs.push(row); } });
  for await (const _event of runtime.streamText(context, { messages: [{ role: "user", content: "private prompt" }] }, { executionId: "turn" })) { /* consume */ }
  expect(logs.filter((row) => row.recordLevel === "request")).toHaveLength(1);
  expect(logs.find((row) => row.recordLevel === "request")).toMatchObject({ operation: "stream", providerRequestId: "req-123", trafficClass: "agent_control", executionId: "turn" });
  expect(logs.find((row) => row.recordLevel === "summary")).toMatchObject({ operation: "stream", status: "succeeded", executionId: "turn" });
  expect(JSON.stringify(logs)).not.toMatch(/private response|private prompt/);
});

test("the same adapter invocation observes each internal fetch attempt without inventing runtime retries", async () => {
  const events: unknown[] = [];
  const providerContext = { apiKey: "secret", baseUrl: "https://provider.example", modelKey: "model", providerKey: "provider", requestConfig: {}, routeId: "route", routeKey: "route", timeoutMs: 1000, onProviderRequest: async (event: unknown) => { events.push(event); } };
  const responses = [Response.json({}, { status: 429 }), Response.json({})];
  const fetcher: typeof fetch = async () => responses.shift()!;
  await observeProviderFetch(providerContext, "generate", fetcher, "https://provider.example", { method: "POST" });
  await observeProviderFetch(providerContext, "generate", fetcher, "https://provider.example", { method: "POST" });
  expect(events).toHaveLength(2);
  expect(events).toMatchObject([{ httpStatus: 429, status: "http_failed" }, { httpStatus: 200, status: "http_succeeded" }]);
});

test("pending route snapshots retain only polling configuration and no secrets or signed URLs", () => {
  const { route } = harness(fetch, { pollPath: "/tasks/{task_id}?api_key=secret", prompt: "private prompt", headers: { Authorization: "Bearer secret" }, apiKey: "secret", timeoutMs: 3000, model: "original-model" });
  route.baseUrl = "https://user:password@provider.example/api?api_key=secret";
  const snapshot = snapshotPendingProviderRoute(route);
  expect(snapshot).toMatchObject({ baseUrl: "https://provider.example/api", requestConfig: { pollPath: "/tasks/{task_id}", timeoutMs: 3000, model: "original-model" } });
  expect(JSON.stringify(snapshot)).not.toMatch(/password|secret|private prompt|Authorization|encryptedSecret|nonce|authTag/);
});
