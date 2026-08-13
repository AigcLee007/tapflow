import { describe, expect, test, vi } from "vitest";

import { AiGatewayError } from "../src/errors.js";
import { AittcoTextRelayAdapter } from "../src/aittco-text-relay-adapter.js";

function context(overrides?: Partial<{
  apiKey: string;
  baseUrl: string;
  modelKey: string;
  providerKey: string;
  requestConfig: Record<string, unknown>;
  routeId: string;
  routeKey: string;
  timeoutMs: number;
}>) {
  return {
    apiKey: "test-relay-key",
    baseUrl: "https://api.aittco.com",
    modelKey: "product-model",
    providerKey: "aittco-text-relay",
    requestConfig: {},
    routeId: "route-1",
    routeKey: "text.test",
    timeoutMs: 5_000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const imageInputs = [
  { assetId: "first", kind: "image", mimeType: "image/png", metadata: { base64: "cG5nLWJ5dGVz" } },
  { assetId: "second", kind: "image", mimeType: "image/webp", metadata: { base64: "d2VicC1ieXRlcw==" } },
];

describe("AittcoTextRelayAdapter", () => {
  test("sends Gemini GenerateContent requests and parses usage", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: "Gemini reply" }] } }],
      usageMetadata: {
        candidatesTokenCount: 5,
        promptTokenCount: 4,
        totalTokenCount: 9,
      },
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({
      requestConfig: {
        model: "gemini-3.1-pro-preview",
        protocol: "gemini",
      },
    }), {
      maxTokens: 128,
      messages: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
        { content: "previous answer", role: "assistant" },
      ],
      model: "product-model",
      temperature: 0.2,
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.aittco.com/v1beta/models/gemini-3.1-pro-preview:generateContent");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-relay-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      contents: [
        { parts: [{ text: "hello" }], role: "user" },
        { parts: [{ text: "previous answer" }], role: "model" },
      ],
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0.2,
      },
      systemInstruction: { parts: [{ text: "You are concise." }] },
    });
    expect(result).toMatchObject({
      modelKey: "product-model",
      outputText: "Gemini reply",
      usage: {
        inputTokens: 4,
        outputTokens: 5,
        totalTokens: 9,
      },
    });
    expect(JSON.stringify(result.providerRequest)).not.toContain("test-relay-key");
    expect(JSON.stringify(result.providerRequest)).not.toContain("previous answer");
  });

  test("maps image inputs into Gemini inlineData parts and redacts diagnostics", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: "Gemini reply" }] } }],
      usageMetadata: {},
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({ requestConfig: { model: "gemini-3.1-pro-preview", protocol: "gemini" } }), {
      inputAssets: imageInputs,
      messages: [{ content: "describe", role: "user" }],
    });

    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      contents: [{ parts: [
        { text: "describe" },
        { inlineData: { data: "cG5nLWJ5dGVz", mimeType: "image/png" } },
        { inlineData: { data: "d2VicC1ieXRlcw==", mimeType: "image/webp" } },
      ], role: "user" }],
    });
    expect((result.providerRequest as { body: Record<string, unknown> }).body).toEqual({
      imageInputCount: 2,
      imageMimeTypes: ["image/png", "image/webp"],
    });
  });

  test("sends Responses requests using the configured upstream model", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      output: [{ content: [{ text: "Responses reply", type: "output_text" }], type: "message" }],
      usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({
      requestConfig: {
        model: "gpt-5.6-sol",
        path: "/v1/responses",
        protocol: "responses",
      },
    }), {
      maxTokens: 128,
      messages: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
      ],
      model: "product-model",
      temperature: 0.2,
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.aittco.com/v1/responses");
    expect(JSON.parse(String(init.body))).toEqual({
      input: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
      ],
      max_output_tokens: 128,
      model: "gpt-5.6-sol",
      temperature: 0.2,
    });
    expect(result.outputText).toBe("Responses reply");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 });
  });

  test("maps image inputs into Responses input_image items and redacts diagnostics", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ output_text: "Responses reply", usage: {} }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({ requestConfig: { model: "gpt-5.6-sol", protocol: "responses" } }), {
      inputAssets: imageInputs,
      messages: [{ content: "describe", role: "user" }],
    });

    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ input: [{ role: "user", content: [
      { type: "input_text", text: "describe" },
      { type: "input_image", image_url: "data:image/png;base64,cG5nLWJ5dGVz" },
      { type: "input_image", image_url: "data:image/webp;base64,d2VicC1ieXRlcw==" },
    ] }] });
    expect((result.providerRequest as { body: Record<string, unknown> }).body).toEqual({
      imageInputCount: 2,
      imageMimeTypes: ["image/png", "image/webp"],
    });
  });

  test("sends Chat Completions requests and parses string message content", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: "Chat Completions reply" } }],
      usage: { completion_tokens: 5, prompt_tokens: 4, total_tokens: 9 },
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({
      requestConfig: {
        model: "gpt-5.6-sol",
        protocol: "chat-completions",
      },
    }), {
      maxTokens: 128,
      messages: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
      ],
      temperature: 0.2,
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.aittco.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toEqual({
      max_tokens: 128,
      messages: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
      ],
      model: "gpt-5.6-sol",
      temperature: 0.2,
    });
    expect(result.outputText).toBe("Chat Completions reply");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 });
  });

  test("maps image inputs into Chat Completions image_url parts and redacts diagnostics", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "Chat reply" } }], usage: {} }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({ requestConfig: { model: "gpt-5.6-sol", protocol: "chat-completions" } }), {
      inputAssets: imageInputs,
      messages: [{ content: "describe", role: "user" }],
    });

    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ messages: [{ role: "user", content: [
      { type: "text", text: "describe" },
      { type: "image_url", image_url: { url: "data:image/png;base64,cG5nLWJ5dGVz" } },
      { type: "image_url", image_url: { url: "data:image/webp;base64,d2VicC1ieXRlcw==" } },
    ] }] });
    expect((result.providerRequest as { body: Record<string, unknown> }).body).toEqual({
      imageInputCount: 2,
      imageMimeTypes: ["image/png", "image/webp"],
    });
  });

  test("attaches images to the final user message when an assistant message follows", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "Chat reply" } }], usage: {} }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    await adapter.generateText(context({ requestConfig: { model: "gpt-5.6-sol", protocol: "chat-completions" } }), {
      inputAssets: imageInputs,
      messages: [
        { content: "describe", role: "user" },
        { content: "Earlier answer", role: "assistant" },
      ],
    });

    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ messages: [
      { role: "user", content: [
        { type: "text", text: "describe" },
        { type: "image_url", image_url: { url: "data:image/png;base64,cG5nLWJ5dGVz" } },
        { type: "image_url", image_url: { url: "data:image/webp;base64,d2VicC1ieXRlcw==" } },
      ] },
      { role: "assistant", content: "Earlier answer" },
    ] });
  });

  test("parses Chat Completions content parts", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: [{ text: "Part one", type: "text" }, { text: " part two", type: "text" }] } }],
      usage: { completion_tokens: 5, prompt_tokens: 4, total_tokens: 9 },
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({
      requestConfig: {
        model: "gpt-5.6-sol",
        protocol: "chat-completions",
      },
    }), {
      messages: [{ content: "hello", role: "user" }],
    });

    expect(result.outputText).toBe("Part one part two");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 });
  });

  test("sends Claude Messages requests and parses text content", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      content: [{ text: "Claude reply", type: "text" }],
      id: "msg_123",
      usage: { input_tokens: 4, output_tokens: 5 },
    }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({
      requestConfig: {
        model: "claude-opus-5",
        protocol: "claude",
      },
    }), {
      messages: [
        { content: "You are concise.", role: "system" },
        { content: "hello", role: "user" },
      ],
      temperature: 0.2,
    });

    const [url, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.aittco.com/v1/messages");
    expect(JSON.parse(String(init.body))).toEqual({
      max_tokens: 2048,
      messages: [{ content: "hello", role: "user" }],
      model: "claude-opus-5",
      system: "You are concise.",
      temperature: 0.2,
    });
    expect(result.outputText).toBe("Claude reply");
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 5, totalTokens: 9 });
  });

  test("maps image inputs into Claude image source blocks and redacts diagnostics", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ content: [{ text: "Claude reply", type: "text" }], usage: {} }));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    const result = await adapter.generateText(context({ requestConfig: { model: "claude-opus-5", protocol: "claude" } }), {
      inputAssets: imageInputs,
      messages: [{ content: "describe", role: "user" }],
    });

    const [, init] = fetchImplementation.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ messages: [{ role: "user", content: [
      { type: "text", text: "describe" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "cG5nLWJ5dGVz" } },
      { type: "image", source: { type: "base64", media_type: "image/webp", data: "d2VicC1ieXRlcw==" } },
    ] }] });
    expect((result.providerRequest as { body: Record<string, unknown> }).body).toEqual({
      imageInputCount: 2,
      imageMimeTypes: ["image/png", "image/webp"],
    });
  });

  test("maps provider errors without leaking credentials or prompt content", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ error: { message: "bad key" } }, 401));
    const adapter = new AittcoTextRelayAdapter({ fetchImplementation: fetchImplementation as typeof fetch });

    await expect(adapter.generateText(context({
      requestConfig: { model: "gpt-5.6-sol", protocol: "responses" },
    }), {
      messages: [{ content: "do not expose this prompt", role: "user" }],
    })).rejects.toMatchObject<Partial<AiGatewayError>>({ code: "PROVIDER_AUTH_FAILED" });
  });
});
