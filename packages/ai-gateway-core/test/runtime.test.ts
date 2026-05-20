import { createServer } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, test } from "vitest";

import { AiGateway } from "../src/ai-gateway.js";
import { AiGatewayError } from "../src/errors.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
import { redactString, redactValue } from "../src/redaction.js";
import { RouteResolver } from "../src/route-resolver.js";
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
        modelKey: "gpt-image-1",
        providerKey: "openai",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "image.openai",
        timeoutMs: 5_000,
      },
      {
        prompt: "a tiny pig",
      },
    );

    expect(result.status).toBe("succeeded");
    expect(result.outputs?.[0]?.base64).toBeTruthy();
    expect(result.outputs?.[0]?.mimeType).toBe("image/png");

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

  test("ai gateway image timeout falls back to env then 120000 default", async () => {
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
      expect(capturedTimeout).toBe(120000);
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
