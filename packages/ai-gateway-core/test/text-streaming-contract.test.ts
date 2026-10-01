import { describe, expect, test } from "vitest";

import { AiGateway } from "../src/ai-gateway.js";
import { AittcoTextRelayAdapter } from "../src/aittco-text-relay-adapter.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
import { DatabaseTextGenerationRuntime } from "../src/database-text-runtime.js";
import {
  type ResolvedRoute,
  type TextGenerationRequest,
} from "../src/types.js";

function route(capabilities: Record<string, unknown>): ResolvedRoute {
  return {
    baseUrl: "https://provider.example",
    credential: { authTag: null, encryptedSecret: null, id: "credential", nonce: null },
    model: { id: "model", modelKey: "product-model" },
    priority: 1,
    provider: {
      capabilities: null,
      defaultBaseUrl: "https://provider.example",
      id: "provider",
      key: "provider",
      kind: "test",
    },
    requestConfig: { capabilities },
    routeId: "route",
    routeKey: "text.route",
    status: "active",
    tenantId: null,
    upstreamModel: "upstream-model",
    weight: 1,
  };
}

const request: TextGenerationRequest = {
  messages: [{ content: "Create the next canvas step", role: "user" }],
  tools: [{
    description: "Apply a safe canvas operation",
    inputSchema: { properties: { title: { type: "string" } }, type: "object" },
    name: "canvas.apply_ops",
  }],
  toolChoice: "auto",
};

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe("text streaming gateway contract", () => {
  test("database text runtime exposes only the normalized route capabilities", async () => {
    const runtime = new DatabaseTextGenerationRuntime({
      credentialVault: {} as never,
      pool: {} as never,
      routeResolver: {
        resolveTextRoute({ routes }: { routes: ResolvedRoute[] }) {
          return routes[0]!;
        },
      } as never,
    });
    Object.defineProperty(runtime, "listRuntimeRoutes", {
      value: async () => [route({ supportsTextStreaming: true, supportsToolCalling: true })],
    });

    await expect(runtime.getTextStreamingCapabilities({ tenantId: "tenant", userId: "user" }, "text.route"))
      .resolves.toEqual({ supportsTextStreaming: true, supportsToolCalling: true });
  });

  test("fails closed when the selected route does not advertise streaming and tool calling", async () => {
    const gateway = new AiGateway({
      test: {
        async *streamText() {
          yield { type: "text_delta", text: "should not run" };
        },
      },
    });

    await expect(collect(gateway.streamText({
      apiKey: "secret",
      request,
      route: route({}),
    }))).rejects.toMatchObject({ code: "AGENT_ROUTE_CAPABILITY_REQUIRED" });
  });

  test("normalizes text and split tool argument deltas into a completed tool call", async () => {
    const gateway = new AiGateway({
      test: {
        async *streamText() {
          yield { type: "text_delta", text: "Planning" };
          yield { type: "tool_call_delta", callId: "call-1", name: "canvas.apply_ops", argumentsDelta: '{"title":' };
          yield { type: "tool_call_delta", callId: "call-1", argumentsDelta: '"Draft"}' };
          yield { type: "usage", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } };
          yield { type: "done", finishReason: "tool_calls" };
        },
      },
    });

    const events = await collect(gateway.streamText({
      apiKey: "secret",
      request,
      route: route({ supportsTextStreaming: true, supportsToolCalling: true }),
    }));

    expect(events).toEqual([
      { type: "text_delta", text: "Planning" },
      { type: "tool_call_delta", callId: "call-1", name: "canvas.apply_ops", argumentsDelta: '{"title":' },
      { type: "tool_call_delta", callId: "call-1", argumentsDelta: '"Draft"}' },
      { type: "tool_call", callId: "call-1", name: "canvas.apply_ops", arguments: '{"title":"Draft"}' },
      { type: "usage", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } },
      { type: "done", finishReason: "tool_calls" },
    ]);
    expect(JSON.stringify(events)).not.toContain("provider");
  });

  test("parses OpenAI-compatible SSE deltas and forwards native tools", async () => {
    const fetchImplementation = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.stream).toBe(true);
      expect(body.tools).toMatchObject([{ type: "function", function: { name: "canvas.apply_ops" } }]);
      return new Response([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"canvas.apply_ops","arguments":"{\\"title\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Draft\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
        "data: [DONE]\n\n",
      ].join(""), { headers: { "content-type": "text/event-stream" } });
    };
    const adapter = new OpenAiCompatibleTextAdapter({ fetchImplementation: fetchImplementation as typeof fetch });
    const events = await collect(adapter.streamText!(
      {
        apiKey: "secret",
        baseUrl: "https://provider.example",
        modelKey: "product-model",
        providerKey: "provider",
        requestConfig: {},
        routeId: "route",
        routeKey: "text.route",
        timeoutMs: 1000,
      },
      request,
    ));
    expect(events).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "tool_call_delta", callId: "call-1", name: "canvas.apply_ops", argumentsDelta: '{"title":' },
      { type: "tool_call_delta", callId: "call-1", argumentsDelta: '"Draft"}' },
      { type: "usage", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } },
      { type: "done", finishReason: "tool_calls" },
    ]);
  });

  test("parses Aittco relay Chat Completions SSE deltas without exposing raw frames", async () => {
    const fetchImplementation = async () => new Response([
      'data: {"choices":[{"delta":{"content":"Relay"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"relay-call","function":{"name":"canvas.apply_ops","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ].join(""), { headers: { "content-type": "text/event-stream" } });
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });
    const events = await collect(adapter.streamText!(
      {
        apiKey: "secret",
        baseUrl: "https://relay.example",
        modelKey: "product-model",
        providerKey: "relay",
        requestConfig: { protocol: "chat-completions" },
        routeId: "route",
        routeKey: "text.route",
        timeoutMs: 1000,
      },
      request,
    ));
    expect(events).toEqual([
      { type: "text_delta", text: "Relay" },
      { type: "tool_call_delta", callId: "relay-call", name: "canvas.apply_ops", argumentsDelta: "{}" },
      { type: "usage", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
      { type: "done", finishReason: "tool_calls" },
    ]);
  });
});

/** A second-round request: the model already called a tool and we return its result. */
const toolLoopRequest: TextGenerationRequest = {
  messages: [
    { content: "You are a canvas agent", role: "system" },
    { content: "Look at my canvas", role: "user" },
    {
      content: "",
      role: "assistant",
      toolCalls: [{ arguments: '{"scope":"all"}', callId: "call-1", name: "canvas_inspect" }],
    },
    { content: '{"nodes":3}', role: "tool", toolCallId: "call-1", toolName: "canvas_inspect" },
  ],
  tools: request.tools,
  toolChoice: "auto",
};

function providerContext(requestConfig: Record<string, unknown>) {
  return {
    apiKey: "secret",
    baseUrl: "https://provider.example",
    modelKey: "product-model",
    providerKey: "provider",
    requestConfig,
    routeId: "route",
    routeKey: "text.route",
    timeoutMs: 1000,
  };
}

function sse(frames: unknown[]): Response {
  return new Response(
    [...frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`), "data: [DONE]\n\n"].join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function capturingFetch(frames: unknown[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImplementation = async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return sse(frames);
  };
  return { bodies, fetchImplementation: fetchImplementation as typeof fetch };
}

describe("tool-calling loop round trip", () => {
  test("OpenAI chat mode sends assistant tool_calls and tool results", async () => {
    const { bodies, fetchImplementation } = capturingFetch([{ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }]);
    const adapter = new OpenAiCompatibleTextAdapter({ fetchImplementation });
    await collect(adapter.streamText!(providerContext({}), toolLoopRequest));

    expect(bodies[0]!.messages).toEqual([
      { content: "You are a canvas agent", role: "system" },
      { content: "Look at my canvas", role: "user" },
      {
        content: null,
        role: "assistant",
        tool_calls: [{ function: { arguments: '{"scope":"all"}', name: "canvas_inspect" }, id: "call-1", type: "function" }],
      },
      { content: '{"nodes":3}', role: "tool", tool_call_id: "call-1" },
    ]);
  });

  test("OpenAI responses mode sends function_call items and function_call_output", async () => {
    const { bodies, fetchImplementation } = capturingFetch([{ type: "response.completed", response: {} }]);
    const adapter = new OpenAiCompatibleTextAdapter({ fetchImplementation });
    await collect(adapter.streamText!(providerContext({ apiMode: "responses" }), toolLoopRequest));

    expect(bodies[0]!.input).toEqual([
      { content: "You are a canvas agent", role: "system" },
      { content: "Look at my canvas", role: "user" },
      { arguments: '{"scope":"all"}', call_id: "call-1", name: "canvas_inspect", type: "function_call" },
      { call_id: "call-1", output: '{"nodes":3}', type: "function_call_output" },
    ]);
  });

  test("OpenAI responses mode joins name and argument deltas under call_id and reports tool_calls", async () => {
    const { fetchImplementation } = capturingFetch([
      { type: "response.output_item.added", item: { type: "function_call", id: "fc_item_1", call_id: "call_abc", name: "canvas.apply_ops" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_item_1", delta: '{"title":' },
      { type: "response.function_call_arguments.delta", item_id: "fc_item_1", delta: '"Draft"}' },
      { type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
    ]);
    const gateway = new AiGateway({ test: new OpenAiCompatibleTextAdapter({ fetchImplementation }) });
    const responsesRoute = route({ supportsTextStreaming: true, supportsToolCalling: true });
    responsesRoute.requestConfig = { ...responsesRoute.requestConfig, apiMode: "responses" };

    const events = await collect(gateway.streamText({ apiKey: "secret", request, route: responsesRoute }));

    expect(events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", callId: "call_abc", name: "canvas.apply_ops", arguments: '{"title":"Draft"}' },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "tool_calls" });
  });

  test("relay claude protocol sends tool_use / tool_result blocks and merges consecutive results", async () => {
    const { bodies, fetchImplementation } = capturingFetch([{ type: "message_delta", delta: { stop_reason: "end_turn" } }]);
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation });
    const twoResults: TextGenerationRequest = {
      ...toolLoopRequest,
      messages: [
        { content: "Look at my canvas", role: "user" },
        {
          content: "Checking.",
          role: "assistant",
          toolCalls: [
            { arguments: '{"scope":"all"}', callId: "toolu_1", name: "canvas_inspect" },
            { arguments: "not json", callId: "toolu_2", name: "asset_search" },
          ],
        },
        { content: '{"nodes":3}', role: "tool", toolCallId: "toolu_1" },
        { content: '{"assets":[]}', role: "tool", toolCallId: "toolu_2" },
      ],
    };
    await collect(adapter.streamText!(providerContext({ protocol: "claude" }), twoResults));

    expect(bodies[0]!.messages).toEqual([
      { content: "Look at my canvas", role: "user" },
      {
        content: [
          { text: "Checking.", type: "text" },
          { id: "toolu_1", input: { scope: "all" }, name: "canvas_inspect", type: "tool_use" },
          { id: "toolu_2", input: {}, name: "asset_search", type: "tool_use" },
        ],
        role: "assistant",
      },
      {
        content: [
          { content: '{"nodes":3}', tool_use_id: "toolu_1", type: "tool_result" },
          { content: '{"assets":[]}', tool_use_id: "toolu_2", type: "tool_result" },
        ],
        role: "user",
      },
    ]);
  });

  test("relay claude protocol keys argument deltas by the tool_use id and normalizes tool_use stop", async () => {
    const { fetchImplementation } = capturingFetch([
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_9", name: "canvas.apply_ops" } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"title":' } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"Draft"}' } },
      { type: "message_delta", delta: { stop_reason: "tool_use" } },
    ]);
    const gateway = new AiGateway({ test: new AittcoTextRelayAdapter({ fetchImplementation }) });
    const claudeRoute = route({ supportsTextStreaming: true, supportsToolCalling: true });
    claudeRoute.requestConfig = { ...claudeRoute.requestConfig, protocol: "claude" };

    const events = await collect(gateway.streamText({ apiKey: "secret", request, route: claudeRoute }));

    expect(events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", callId: "toolu_9", name: "canvas.apply_ops", arguments: '{"title":"Draft"}' },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "tool_calls" });
  });

  test("relay responses protocol joins name and argument deltas under call_id", async () => {
    const { bodies, fetchImplementation } = capturingFetch([
      { type: "response.output_item.added", item: { type: "function_call", id: "fc_2", call_id: "call_rel", name: "canvas.apply_ops" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_2", delta: "{}" },
      { type: "response.completed", response: {} },
    ]);
    const gateway = new AiGateway({ test: new AittcoTextRelayAdapter({ fetchImplementation }) });
    const responsesRoute = route({ supportsTextStreaming: true, supportsToolCalling: true });
    responsesRoute.requestConfig = { ...responsesRoute.requestConfig, protocol: "responses" };

    const events = await collect(gateway.streamText({ apiKey: "secret", request: toolLoopRequest, route: responsesRoute }));

    expect(events.filter((event) => event.type === "tool_call")).toEqual([
      { type: "tool_call", callId: "call_rel", name: "canvas.apply_ops", arguments: "{}" },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "tool_calls" });
    expect(bodies[0]!.input).toContainEqual({ call_id: "call-1", output: '{"nodes":3}', type: "function_call_output" });
  });

  test("relay claude protocol folds a user message that follows tool results into the same turn", async () => {
    const { bodies, fetchImplementation } = capturingFetch([{ type: "message_delta", delta: { stop_reason: "end_turn" } }]);
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation });
    await collect(adapter.streamText!(providerContext({ protocol: "claude" }), {
      ...toolLoopRequest,
      messages: [...toolLoopRequest.messages, { content: "换个思路", role: "user" }],
    }));

    expect(bodies[0]!.messages).toEqual([
      { content: "Look at my canvas", role: "user" },
      { content: [{ id: "call-1", input: { scope: "all" }, name: "canvas_inspect", type: "tool_use" }], role: "assistant" },
      {
        content: [
          { content: '{"nodes":3}', tool_use_id: "call-1", type: "tool_result" },
          { text: "换个思路", type: "text" },
        ],
        role: "user",
      },
    ]);
  });

  test("relay claude protocol appends review images to the turn holding tool results + review text", async () => {
    const { bodies, fetchImplementation } = capturingFetch([{ type: "message_delta", delta: { stop_reason: "end_turn" } }]);
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation });
    await collect(adapter.streamText!(providerContext({ protocol: "claude" }), {
      ...toolLoopRequest,
      inputAssets: [{ assetId: "a1", kind: "image", metadata: { base64: "QUJD" }, mimeType: "image/png" }],
      messages: [...toolLoopRequest.messages, { content: "请点评刚生成的图片", role: "user" }],
    }));

    const messages = bodies[0]!.messages as Array<{ content: unknown; role: string }>;
    expect(messages[0]).toEqual({ content: "Look at my canvas", role: "user" });
    expect(messages.at(-1)).toEqual({
      content: [
        { content: '{"nodes":3}', tool_use_id: "call-1", type: "tool_result" },
        { text: "请点评刚生成的图片", type: "text" },
        { source: { data: "QUJD", media_type: "image/png", type: "base64" }, type: "image" },
      ],
      role: "user",
    });
  });

  test("relay gemini protocol rejects tools instead of silently dropping them", async () => {
    const { bodies, fetchImplementation } = capturingFetch([]);
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation });

    await expect(collect(adapter.streamText!(providerContext({ protocol: "gemini" }), request)))
      .rejects.toMatchObject({ code: "TEXT_TOOL_CALLING_UNSUPPORTED_PROTOCOL" });
    expect(bodies).toHaveLength(0);
  });
});
