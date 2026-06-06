import { createServer } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, test } from "vitest";

import { AiGateway } from "../src/ai-gateway.js";
import { AiGatewayError } from "../src/errors.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
import { PixelleLabsGeminiImageAdapter } from "../src/pixellelabs-gemini-image-adapter.js";
import { redactString, redactValue } from "../src/redaction.js";
import { RouteResolver } from "../src/route-resolver.js";
import { VisionaryNanoBananaAdapter } from "../src/visionary-nano-banana-adapter.js";
import type { ResolvedRoute } from "../src/types.js";

const openServers = new Set<ReturnType<typeof createServer>>();

async function withHttpServer(
  handler: Parameters<typeof createServer>[0],
): Promise<{ close: () => Promise<void>; url: string }> {
  const server = createServer(handler);
  openServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an HTTP server address");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      openServers.delete(server);
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

afterEach(async () => {
  for (const server of openServers) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    openServers.delete(server);
  }
});

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
  return {
    baseUrl: overrides?.baseUrl ?? "http://localhost:1234",
    credential: overrides?.credential ?? {
      authTag: null,
      encryptedSecret: null,
      id: "credential-1",
      nonce: null,
    },
    model: overrides?.model ?? {
      id: "model-1",
      modelKey: "gpt-test",
    },
    priority: overrides?.priority ?? 100,
    provider: overrides?.provider ?? {
      defaultBaseUrl: "http://localhost:1234",
      id: "provider-1",
      key: "openai-compatible",
      kind: "openai-compatible",
    },
    requestConfig: overrides?.requestConfig ?? {},
    routeId: overrides?.routeId ?? "route-1",
    routeKey: overrides?.routeKey ?? "default",
    status: overrides?.status ?? "active",
    tenantId: overrides?.tenantId ?? null,
    weight: overrides?.weight ?? 100,
  };
}

describe("openai-compatible text adapter", () => {
  test("returns text and usage from a mock HTTP provider", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/chat/completions");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages: Array<{ content: string }>;
        model: string;
      };

      expect(body.model).toBe("gpt-test");
      expect(body.messages[0]?.content).toBe("hello");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "mocked hello",
              },
            },
          ],
          usage: {
            completion_tokens: 2,
            prompt_tokens: 1,
            total_tokens: 3,
          },
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateText(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-test",
        providerKey: "openai-compatible",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "default",
        timeoutMs: 5_000,
      },
      {
        messages: [{ content: "hello", role: "user" }],
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-test",
      outputText: "mocked hello",
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
      },
    });

    await server.close();
  });

  test("maps 401 to PROVIDER_AUTH_FAILED", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: "bad key" } }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateText(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-test",
          providerKey: "openai-compatible",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "default",
          timeoutMs: 5_000,
        },
        {
          messages: [{ content: "hello", role: "user" }],
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_AUTH_FAILED",
    });

    await server.close();
  });

  test("maps 429 to PROVIDER_RATE_LIMIT", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 429;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: "slow down" } }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateText(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-test",
          providerKey: "openai-compatible",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "default",
          timeoutMs: 5_000,
        },
        {
          messages: [{ content: "hello", role: "user" }],
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_RATE_LIMIT",
    });

    await server.close();
  });

  test("maps timeout to PROVIDER_TIMEOUT", async () => {
    const server = await withHttpServer(async (_request, _response) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateText(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-test",
          providerKey: "openai-compatible",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "default",
          timeoutMs: 10,
        },
        {
          messages: [{ content: "hello", role: "user" }],
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_TIMEOUT",
    });

    await server.close();
  });

  test("generateImage parses b64_json outputs from OpenAI images API", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/images/generations");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "gpt-image-2",
        n: 2,
        output_format: "jpeg",
        prompt: "a tiny pig",
        quality: "high",
        response_format: "b64_json",
        size: "1024x1024",
      });
      expect(body.output_compression).toBe(70);

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              b64_json:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
            },
          ],
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "openai",
        requestConfig: { outputFormat: "png" },
        routeId: "route-1",
        routeKey: "image.openai",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            n: 2,
            outputCompression: 70,
            outputFormat: "jpeg",
            quality: "high",
            size: "1024x1024",
          },
        },
        prompt: "a tiny pig",
      },
    );

    expect(result.status).toBe("succeeded");
    expect(result.outputs?.[0]?.base64).toBeTruthy();
    expect(result.outputs?.[0]?.filename).toBe("openai-image-1.jpg");
    expect(result.outputs?.[0]?.mimeType).toBe("image/jpeg");

    await server.close();
  });

  test("generateImage uses multipart edits when reference images are present", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/images/edits");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("multipart/form-data");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      expect(body).toContain('name="model"');
      expect(body).toContain("gpt-image-2");
      expect(body).toContain('name="prompt"');
      expect(body).toContain("edit with reference");
      expect(body).toContain('name="image[]"');
      expect(body).toContain('name="response_format"');
      expect(body).toContain("b64_json");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              url: "https://cdn.example/generated.webp",
            },
          ],
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "openai-compatible",
        requestConfig: {
          editPath: "/images/edits",
          outputFormat: "webp",
          path: "/images/generations",
        },
        routeId: "route-1",
        routeKey: "image.gpt-image-2",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            output_format: "webp",
            size: "1536x1024",
          },
          referenceImages: [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
          ],
        },
        prompt: "edit with reference",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-image-2",
      outputs: [
        {
          filename: "openai-image-1.webp",
          mimeType: "image/webp",
          url: "https://cdn.example/generated.webp",
        },
      ],
      providerRequest: {
        body: {
          imageCount: 1,
          model: "gpt-image-2",
        },
        url: `${server.url}/images/edits`,
      },
      status: "succeeded",
    });

    await server.close();
  });

  test("generateImage maps auth failure to PROVIDER_AUTH_FAILED", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: "bad key" } }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-image-1",
          providerKey: "openai",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.openai",
          timeoutMs: 5_000,
        },
        {
          prompt: "this should fail",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_AUTH_FAILED",
    });

    await server.close();
  });

  test("generateImage maps 429 to PROVIDER_RATE_LIMIT", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 429;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: "slow down" } }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-image-1",
          providerKey: "openai",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.openai",
          timeoutMs: 5_000,
        },
        {
          prompt: "this should rate limit",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_RATE_LIMIT",
    });

    await server.close();
  });

  test("generateImage maps 400 to PROVIDER_BAD_REQUEST", async () => {
    const server = await withHttpServer((_request, response) => {
      response.statusCode = 400;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: { message: "bad prompt" } }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-image-1",
          providerKey: "openai",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.openai",
          timeoutMs: 5_000,
        },
        {
          prompt: "this should be bad request",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_BAD_REQUEST",
    });

    await server.close();
  });

  test("generateImage maps timeout to PROVIDER_TIMEOUT", async () => {
    const server = await withHttpServer(async (_request, _response) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-image-1",
          providerKey: "openai",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.openai",
          timeoutMs: 10,
        },
        {
          prompt: "this should timeout",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_TIMEOUT",
    });

    await server.close();
  });

  test("generateImage throws PROVIDER_INVALID_RESPONSE for empty data", async () => {
    const server = await withHttpServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [] }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-test-secret",
          baseUrl: server.url,
          modelKey: "gpt-image-1",
          providerKey: "openai",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.openai",
          timeoutMs: 5_000,
        },
        {
          prompt: "malformed",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_INVALID_RESPONSE",
    });

    await server.close();
  });

  test("generateImage respects custom baseUrl and does not duplicate /v1", async () => {
    const responses = [
      new Response(
        JSON.stringify({
          data: [{ b64_json: "aGVsbG8=" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      new Response(
        JSON.stringify({
          data: [{ b64_json: "d29ybGQ=" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ];
    const calledUrls: string[] = [];
    const fetchMock = async (input: string | URL | Request): Promise<Response> => {
      calledUrls.push(String(input));
      return responses.shift() as Response;
    };

    const adapter = new OpenAiCompatibleTextAdapter({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: "https://sub.siphonlab.cn",
        modelKey: "gpt-image-1",
        providerKey: "openai-compatible",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "image.openai",
        timeoutMs: 5_000,
      },
      { prompt: "first" },
    );

    await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: "https://sub.siphonlab.cn/v1/",
        modelKey: "gpt-image-1",
        providerKey: "openai-compatible",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "image.openai",
        timeoutMs: 5_000,
      },
      { prompt: "second" },
    );

    expect(calledUrls).toEqual([
      "https://sub.siphonlab.cn/images/generations",
      "https://sub.siphonlab.cn/v1/images/generations",
    ]);
  });
});

describe("visionary nano banana adapter", () => {
  test("posts Nano Banana Pro payload and parses result URLs", async () => {
    const calls: Array<{ body: Record<string, unknown>; headers: HeadersInit | undefined; url: string }> = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({
        body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
        headers: init?.headers,
        url: String(input),
      });
      return new Response(
        JSON.stringify({
          id: "nb-1",
          results: [{ url: "https://visionary.beer/api/generations/nb-1/display" }],
          status: "succeeded",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const adapter = new VisionaryNanoBananaAdapter({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.generateImage(
      {
        apiKey: "sk-visionary",
        baseUrl: "https://visionary.beer",
        modelKey: "nano-banana-pro",
        providerKey: "visionary",
        requestConfig: { path: "/v1/api/nano-banana" },
        routeId: "route-1",
        routeKey: "image.nano-banana-pro",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          aspect_ratio: "16:9",
          images: ["https://cdn.example/a.png"],
          size: "4k",
          optimizeChineseText: true,
        },
        prompt: "merge reference images",
      },
    );

    expect(calls[0]?.url).toBe("https://visionary.beer/v1/api/nano-banana");
    expect(calls[0]?.headers).toMatchObject({
      Authorization: "Bearer sk-visionary",
      "Content-Type": "application/json",
    });
    expect(calls[0]?.body).toMatchObject({
      aspectRatio: "16:9",
      imageSize: "4K",
      images: ["https://cdn.example/a.png"],
      model: "nano-banana-pro",
      optimizeChineseText: true,
      prompt: "merge reference images",
      replyType: "json",
    });
    expect(result).toMatchObject({
      modelKey: "nano-banana-pro",
      outputs: [
        {
          mimeType: "image/png",
          url: "https://visionary.beer/api/generations/nb-1/display",
        },
      ],
      status: "succeeded",
    });
  });

  test("rejects unsupported Nano Banana model names", async () => {
    const adapter = new VisionaryNanoBananaAdapter({
      fetchImplementation: (async () => {
        throw new Error("fetch should not be called");
      }) as unknown as typeof fetch,
    });

    await expect(
      adapter.generateImage(
        {
          apiKey: "sk-visionary",
          baseUrl: "https://visionary.beer",
          modelKey: "not-supported",
          providerKey: "visionary",
          requestConfig: {},
          routeId: "route-1",
          routeKey: "image.nano-banana-pro",
          timeoutMs: 5_000,
        },
        {
          prompt: "test",
        },
      ),
    ).rejects.toMatchObject<Partial<AiGatewayError>>({
      code: "PROVIDER_BAD_REQUEST",
    });
  });
});

describe("pixellelabs gemini image adapter", () => {
  test("posts Gemini generateContent payload and parses inline image output", async () => {
    const calls: Array<{ body: Record<string, unknown>; headers: HeadersInit | undefined; url: string }> = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({
        body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
        headers: init?.headers,
        url: String(input),
      });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: "iVBORw0KGgo=",
                      mimeType: "image/png",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const adapter = new PixelleLabsGeminiImageAdapter({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    });

    const result = await adapter.generateImage(
      {
        apiKey: "sk-pixelle",
        baseUrl: "https://api.pixellelabs.com",
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "pixellelabs",
        requestConfig: {
          path: "/v1beta/models/gemini-3-pro-image-preview:generateContent",
        },
        routeId: "route-1",
        routeKey: "image.pixellelabs.nano-banana-pro",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          aspectRatio: "16:9",
          images: ["https://example.com/input.jpg"],
          imageSize: "2K",
        },
        prompt: "Keep the composition, make it watercolor style",
      },
    );

    expect(calls[0]?.url).toBe(
      "https://api.pixellelabs.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
    );
    expect(calls[0]?.headers).toMatchObject({
      Authorization: "Bearer sk-pixelle",
      "Content-Type": "application/json",
    });
    expect(calls[0]?.body).toEqual({
      contents: [
        {
          parts: [
            { text: "Keep the composition, make it watercolor style" },
            {
              fileData: {
                fileUri: "https://example.com/input.jpg",
                mimeType: "image/jpeg",
              },
            },
          ],
          role: "user",
        },
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K",
        },
        responseModalities: ["IMAGE"],
      },
    });
    expect(result).toMatchObject({
      modelKey: "gemini-3-pro-image-preview",
      outputs: [
        {
          base64: "iVBORw0KGgo=",
          mimeType: "image/png",
        },
      ],
      status: "succeeded",
    });
  });
});

describe("redaction", () => {
  test("removes authorization headers and api keys", () => {
    const input = {
      authorization: "Bearer sk-secret-1234",
      encrypted_secret: "ciphertext",
      nested: {
        header: "Authorization: Bearer sk-secret-1234",
        token: "sk-secret-1234",
      },
    };

    expect(redactString("Bearer sk-secret-1234", ["sk-secret-1234"])).toContain("[REDACTED]");
    const redacted = redactValue(input, ["sk-secret-1234"]) as {
      authorization: string;
      encrypted_secret: string;
      nested: { header: string; token: string };
    };

    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.encrypted_secret).toBe("[REDACTED]");
    expect(redacted.nested.token).toBe("[REDACTED]");
    expect(redacted.nested.header).not.toContain("sk-secret-1234");
    expect(redacted.nested.header).toContain("[REDACTED]");
  });
});

describe("route resolver and ai gateway", () => {
  test("tenant route overrides system route for the same key", () => {
    const resolver = new RouteResolver();
    const selected = resolver.resolveTextRoute({
      routeKey: "shared",
      routes: [
        makeRoute({
          routeId: "system-route",
          routeKey: "shared",
          tenantId: null,
        }),
        makeRoute({
          priority: 200,
          routeId: "tenant-route",
          routeKey: "shared",
          tenantId: "tenant-a",
        }),
      ],
    });

    expect(selected.routeId).toBe("tenant-route");
  });

  test("ai gateway generateText delegates to the adapter for the selected route", async () => {
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateText() {
          return {
            modelKey: "gpt-test",
            outputText: "hello from adapter",
            providerRequest: { ok: true },
            providerResponse: { ok: true },
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          };
        },
      },
    });

    const result = await gateway.generateText({
      apiKey: "sk-test-secret",
      request: {
        messages: [{ content: "hello", role: "user" }],
      },
      route: makeRoute(),
    });

    expect(result).toMatchObject({
      modelKey: "gpt-test",
      outputText: "hello from adapter",
      providerKey: "openai-compatible",
      status: "succeeded",
    });
  });

  test("ai gateway generateImage delegates sync media outputs", async () => {
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage() {
          return {
            modelKey: "image-test",
            outputs: [
              {
                mimeType: "image/png",
                url: "https://example.com/generated.png",
                width: 512,
              },
            ],
            providerRequest: { authorization: "Bearer sk-test-secret" },
            providerResponse: { data: "ok" },
            status: "succeeded" as const,
            usage: {
              inputTokens: 4,
              outputTokens: 1,
              totalTokens: 5,
            },
          };
        },
      },
    });

    const result = await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: {
        prompt: "draw a fox",
      },
      route: makeRoute(),
    });

    expect(result).toMatchObject({
      modelKey: "image-test",
      outputs: [
        {
          mimeType: "image/png",
          url: "https://example.com/generated.png",
          width: 512,
        },
      ],
      providerKey: "openai-compatible",
      status: "succeeded",
    });
  });

  test("ai gateway image timeout prefers route request_config timeoutMs", async () => {
    let capturedTimeout: number | null = null;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage(context) {
          capturedTimeout = context.timeoutMs;
          return {
            modelKey: "image-test",
            outputs: [{ mimeType: "image/png", url: "https://example.com/a.png" }],
            providerRequest: {},
            providerResponse: {},
            status: "succeeded" as const,
            usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          };
        },
      },
    });

    await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: { prompt: "timeout-route" },
      route: makeRoute({
        requestConfig: { timeoutMs: 23456 },
      }),
    });

    expect(capturedTimeout).toBe(23456);
  });

  test("database media runtime can override request config for diagnostic calls", async () => {
    const { DatabaseMediaRuntime } = await import("../src/database-media-runtime.js");
    let capturedTimeout: number | null = null;
    const runtime = new DatabaseMediaRuntime({
      aiGateway: new AiGateway({
        "openai-compatible": {
          async generateImage(context) {
            capturedTimeout = context.timeoutMs;
            return {
              modelKey: "image-test",
              outputs: [{ mimeType: "image/png", url: "https://example.com/diag.png" }],
              providerRequest: {},
              providerResponse: {},
              status: "succeeded" as const,
              usage: { inputTokens: null, outputTokens: null, totalTokens: null },
            };
          },
        },
      }),
      credentialVault: {
        getSecretForProviderCall() {
          return "sk-test-secret";
        },
      } as never,
      pool: {} as never,
      routeResolver: {
        resolveMediaRoute({ routes }: { routes: ResolvedRoute[] }) {
          return routes[0];
        },
      } as never,
    });

    Object.defineProperty(runtime, "listRuntimeRoutes", {
      value: async () => [
        makeRoute({
          credential: {
            authTag: Buffer.from("tag"),
            encryptedSecret: Buffer.from("secret"),
            id: "credential-1",
            nonce: Buffer.from("nonce"),
          },
          requestConfig: { timeoutMs: 300000 },
        }),
      ],
    });
    Object.defineProperty(runtime, "insertAiCallLog", {
      value: async () => undefined,
    });

    await runtime.generateImage(
      {
        tenantId: "tenant-1",
        userId: "user-1",
      },
      {
        prompt: "diagnostic",
        routeKey: "image.gpt-image-2",
      },
      {
        requestConfigOverride: {
          timeoutMs: 30000,
        },
      },
    );

    expect(capturedTimeout).toBe(30000);
  });

  test("ai gateway image timeout falls back to provider capabilities timeoutMs", async () => {
    let capturedTimeout: number | null = null;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage(context) {
          capturedTimeout = context.timeoutMs;
          return {
            modelKey: "image-test",
            outputs: [{ mimeType: "image/png", url: "https://example.com/b.png" }],
            providerRequest: {},
            providerResponse: {},
            status: "succeeded" as const,
            usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          };
        },
      },
    });

    await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: { prompt: "timeout-provider" },
      route: makeRoute({
        provider: {
          defaultBaseUrl: "http://localhost:1234",
          id: "provider-1",
          key: "openai-compatible",
          kind: "openai-compatible",
          capabilities: {
            timeoutMs: 34567,
          },
        },
        requestConfig: {},
      }),
    });

    expect(capturedTimeout).toBe(34567);
  });

  test("ai gateway image timeout falls back to env then 300000 default", async () => {
    const originalCompat = process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS;
    const originalOpenAi = process.env.OPENAI_IMAGE_TIMEOUT_MS;
    let capturedTimeout: number | null = null;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage(context) {
          capturedTimeout = context.timeoutMs;
          return {
            modelKey: "image-test",
            outputs: [{ mimeType: "image/png", url: "https://example.com/c.png" }],
            providerRequest: {},
            providerResponse: {},
            status: "succeeded" as const,
            usage: { inputTokens: null, outputTokens: null, totalTokens: null },
          };
        },
      },
    });

    try {
      process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS = "45678";
      delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
      await gateway.generateImage({
        apiKey: "sk-test-secret",
        request: { prompt: "timeout-env" },
        route: makeRoute({ requestConfig: {} }),
      });
      expect(capturedTimeout).toBe(45678);

      delete process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS;
      delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
      await gateway.generateImage({
        apiKey: "sk-test-secret",
        request: { prompt: "timeout-default" },
        route: makeRoute({ requestConfig: {} }),
      });
      expect(capturedTimeout).toBe(300000);
    } finally {
      if (originalCompat === undefined) {
        delete process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS;
      } else {
        process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS = originalCompat;
      }
      if (originalOpenAi === undefined) {
        delete process.env.OPENAI_IMAGE_TIMEOUT_MS;
      } else {
        process.env.OPENAI_IMAGE_TIMEOUT_MS = originalOpenAi;
      }
    }
  });

  test("ai gateway generateVideo delegates async provider task creation", async () => {
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateVideo() {
          return {
            modelKey: "video-test",
            outputs: [],
            providerRequest: { ok: true },
            providerResponse: { accepted: true },
            providerTaskId: "task-123",
            status: "waiting_provider" as const,
            usage: {
              inputTokens: 6,
              outputTokens: null,
              totalTokens: 6,
            },
          };
        },
      },
    });

    const result = await gateway.generateVideo({
      apiKey: "sk-test-secret",
      request: {
        prompt: "animate a river",
      },
      route: makeRoute(),
    });

    expect(result).toMatchObject({
      modelKey: "video-test",
      providerKey: "openai-compatible",
      providerTaskId: "task-123",
      status: "waiting_provider",
    });
  });

  test("ai gateway pollTask returns pending running succeeded and failed task states", async () => {
    const pollStates = [
      { status: "pending" as const },
      { status: "running" as const },
      {
        mimeType: "video/mp4",
        outputUrls: ["https://example.com/final.mp4"],
        status: "succeeded" as const,
      },
      {
        error: { code: "PROVIDER_FAILED", message: "provider failed" },
        status: "failed" as const,
      },
    ];

    const gateway = new AiGateway({
      "openai-compatible": {
        async pollTask() {
          return {
            providerTaskId: "task-123",
            providerResponse: { ok: true },
            providerRequest: { ok: true },
            usage: null,
            ...pollStates.shift()!,
          };
        },
      },
    });

    await expect(
      gateway.pollTask({
        apiKey: "sk-test-secret",
        request: {
          providerTaskId: "task-123",
        },
        route: makeRoute(),
      }),
    ).resolves.toMatchObject({ status: "pending" });
    await expect(
      gateway.pollTask({
        apiKey: "sk-test-secret",
        request: {
          providerTaskId: "task-123",
        },
        route: makeRoute(),
      }),
    ).resolves.toMatchObject({ status: "running" });
    await expect(
      gateway.pollTask({
        apiKey: "sk-test-secret",
        request: {
          providerTaskId: "task-123",
        },
        route: makeRoute(),
      }),
    ).resolves.toMatchObject({
      mimeType: "video/mp4",
      outputUrls: ["https://example.com/final.mp4"],
      status: "succeeded",
    });
    await expect(
      gateway.pollTask({
        apiKey: "sk-test-secret",
        request: {
          providerTaskId: "task-123",
        },
        route: makeRoute(),
      }),
    ).resolves.toMatchObject({
      error: { code: "PROVIDER_FAILED", message: "provider failed" },
      status: "failed",
    });
  });

  test("media request and response redaction still removes secrets", () => {
    const mediaPayload = {
      authorization: "Bearer sk-secret-1234",
      outputBase64: ["c2VjcmV0"],
      providerResponse: {
        nested: {
          token: "sk-secret-1234",
          url: "https://example.com/result.png?api_key=sk-secret-1234",
        },
      },
      providerTaskId: "task-123",
    };

    const redacted = redactValue(mediaPayload, ["sk-secret-1234"]) as {
      authorization: string;
      providerResponse: {
        nested: {
          token: string;
          url: string;
        };
      };
    };

    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.providerResponse.nested.token).toBe("[REDACTED]");
    expect(redacted.providerResponse.nested.url).not.toContain("sk-secret-1234");
  });
});
