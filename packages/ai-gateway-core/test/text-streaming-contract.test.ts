import { describe, expect, test } from "vitest";

import { AiGateway } from "../src/ai-gateway.js";
import { AittcoTextRelayAdapter } from "../src/aittco-text-relay-adapter.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
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
