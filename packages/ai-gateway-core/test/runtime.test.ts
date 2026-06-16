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
    ...(overrides?.connection ? { connection: overrides.connection } : {}),
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

  test("returns text from OpenAI-compatible responses API when configured", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/responses");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        input: Array<{ content: string; role: string }>;
        max_output_tokens?: number;
        model: string;
        temperature?: number;
      };

      expect(body).toMatchObject({
        input: [
          { content: "You are concise.", role: "system" },
          { content: "hello", role: "user" },
        ],
        max_output_tokens: 128,
        model: "gpt-5.5",
        temperature: 0.2,
      });

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: "mocked responses hello",
                  type: "output_text",
                },
              ],
              type: "message",
            },
          ],
          usage: {
            input_tokens: 4,
            output_tokens: 5,
            total_tokens: 9,
          },
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateText(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-5.5",
        providerKey: "siphonlab-openai-text",
        requestConfig: {
          apiMode: "responses",
          path: "/v1/responses",
        },
        routeId: "route-1",
        routeKey: "text.gpt-5-5.responses",
        timeoutMs: 5_000,
      },
      {
        maxTokens: 128,
        messages: [
          { content: "You are concise.", role: "system" },
          { content: "hello", role: "user" },
        ],
        temperature: 0.2,
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-5.5",
      outputText: "mocked responses hello",
      usage: {
        inputTokens: 4,
        outputTokens: 5,
        totalTokens: 9,
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
        size: "1024x1024",
      });
      expect(body.response_format).toBeUndefined();
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

  test("generateImage converts gpt-image-2 canvas size tier to pixel size for OpenAI images API", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/images/generations");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body.size).toBe("1248x1248");

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ url: "https://example.test/generated.png" }] }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "openai-compatible",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "image.gpt-image-2",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "1:1",
            size: "1k",
          },
        },
        prompt: "a tiny pig",
      },
    );

    await server.close();
  });

  test("generateImage keeps non-gpt-image-2 size tiers unchanged", async () => {
    const server = await withHttpServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body.model).toBe("other-image-model");
      expect(body.size).toBe("1k");

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [{ url: "https://example.test/generated.png" }] }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "other-image-model",
        providerKey: "openai-compatible",
        requestConfig: {},
        routeId: "route-1",
        routeKey: "image.other",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "1:1",
            size: "1k",
          },
        },
        prompt: "a tiny pig",
      },
    );

    await server.close();
  });

  test("generateImage submits MouxiHub async generation with size-specific upstream model", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/generations?async=true");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("application/json");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: "gemini-3.1-flash-image-preview-2k",
        n: 1,
        prompt: "a tiny pig",
        size: "2k",
      });
      expect(body.response_format).toBeUndefined();

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-mouxihub-1" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          modelBySize: {
            "1K": "gemini-3.1-flash-image-preview",
            "2K": "gemini-3.1-flash-image-preview-2k",
            "4K": "gemini-3.1-flash-image-preview-4k",
          },
          path: "/v1/images/generations",
          responseFormat: null,
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            size: "2k",
          },
        },
        prompt: "a tiny pig",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gemini-3.1-flash-image-preview-2k",
      providerTaskId: "task-mouxihub-1",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage forwards MouxiHub async generation aspect ratio to upstream payload", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/generations?async=true");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({
        aspect_ratio: "3:4",
        model: "gemini-3.1-flash-image-preview-2k",
        n: 1,
        prompt: "animal sports day, 3d style",
        size: "2k",
      });

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-mouxihub-aspect-ratio" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          modelBySize: {
            "1K": "gemini-3.1-flash-image-preview",
            "2K": "gemini-3.1-flash-image-preview-2k",
            "4K": "gemini-3.1-flash-image-preview-4k",
          },
          path: "/v1/images/generations",
          responseFormat: null,
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "3:4",
            size: "2k",
          },
        },
        prompt: "animal sports day, 3d style",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gemini-3.1-flash-image-preview-2k",
      providerTaskId: "task-mouxihub-aspect-ratio",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage defaults MouxiHub async generation to 1K upstream model when size is missing", async () => {
    const server = await withHttpServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(request.url).toBe("/v1/images/generations?async=true");
      expect(body).toMatchObject({
        model: "gemini-3.1-flash-image-preview",
        n: 1,
        prompt: "forest sports day",
        size: "1K",
      });

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-mouxihub-default-size" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          modelBySize: {
            "1K": "gemini-3.1-flash-image-preview",
            "2K": "gemini-3.1-flash-image-preview-2k",
            "4K": "gemini-3.1-flash-image-preview-4k",
          },
          path: "/v1/images/generations",
          responseFormat: null,
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        metadata: {},
        prompt: "forest sports day",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gemini-3.1-flash-image-preview",
      providerTaskId: "task-mouxihub-default-size",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage submits MouxiHub async edits through multipart endpoint", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/edits?async=true");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("multipart/form-data");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      expect(body).toContain('name="model"');
      expect(body).toContain("gemini-3.1-flash-image-preview-4k");
      expect(body).toContain('name="prompt"');
      expect(body).toContain("edit with reference");
      expect(body).toContain('name="image[]"');
      expect(body).not.toContain('name="response_format"');

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-mouxihub-edit" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          editPath: "/v1/images/edits",
          modelBySize: {
            "1K": "gemini-3.1-flash-image-preview",
            "2K": "gemini-3.1-flash-image-preview-2k",
            "4K": "gemini-3.1-flash-image-preview-4k",
          },
          path: "/v1/images/generations",
          responseFormat: null,
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            imageSize: "4K",
          },
          referenceImages: [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
          ],
        },
        prompt: "edit with reference",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gemini-3.1-flash-image-preview-4k",
      providerTaskId: "task-mouxihub-edit",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage submits MouxiHub GPT-Image-2 async generation with provider base model plus pixel size payload", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/generations?async=true");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("application/json");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({
        aspect_ratio: "3:2",
        model: "gpt-image-2",
        n: 1,
        prompt: "product poster",
        size: "2512x1664",
      });
      expect(body.response_format).toBeUndefined();

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-gpt-image-line3" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          aspectRatioParam: "aspect_ratio",
          modelBySize: {
            "1K": "gpt-image-2",
            "2K": "gpt-image-2-2k",
            "4K": "gpt-image-2-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
          responseFormat: null,
        },
        routeId: "route-line3",
        routeKey: "image.gpt-image-2.line3",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "3:2",
            size: "2K",
          },
        },
        prompt: "product poster",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-image-2-2k",
      providerTaskId: "task-gpt-image-line3",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage submits MouxiHub GPT-Image-2 async edits through multipart endpoint with provider base model and tier-aware result model", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/edits?async=true");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("multipart/form-data");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      expect(body).toContain('name="model"');
      expect(body).toContain("gpt-image-2-vip");
      expect(body).not.toContain("gpt-image-2-vip-4k");
      expect(body).toContain('name="image"');
      expect(body).not.toContain('name="image[]"');

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-gpt-image-line4-edit" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          aspectRatioParam: "aspect_ratio",
          editPath: "/v1/images/edits",
          modelBySize: {
            "1K": "gpt-image-2-vip",
            "2K": "gpt-image-2-vip-2k",
            "4K": "gpt-image-2-vip-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
          responseFormat: null,
        },
        routeId: "route-line4",
        routeKey: "image.gpt-image-2.line4",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            size: "4K",
          },
          referenceImages: [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
          ],
        },
        prompt: "edit this image",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-image-2-vip-4k",
      providerTaskId: "task-gpt-image-line4-edit",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("generateImage keeps MouxiHub GPT-Image-2 line4 on provider base model with pixel size payload even when legacy requestConfig.model is stale", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/generations?async=true");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      expect(body).toMatchObject({
        aspect_ratio: "9:16",
        model: "gpt-image-2-vip",
        n: 1,
        prompt: "legacy line4 check",
        size: "2160x3840",
      });

      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ code: "success", message: "", data: "task-gpt-image-line4-legacy" }));
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "mouxihub-openai",
        requestConfig: {
          async: true,
          aspectRatioParam: "aspect_ratio",
          model: "gpt-image-2",
          modelBySize: {
            "1K": "gpt-image-2-vip",
            "2K": "gpt-image-2-vip-2k",
            "4K": "gpt-image-2-vip-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
          responseFormat: null,
        },
        routeId: "route-line4",
        routeKey: "image.gpt-image-2.line4",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "9:16",
            size: "4K",
          },
        },
        prompt: "legacy line4 check",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-image-2-vip-4k",
      providerTaskId: "task-gpt-image-line4-legacy",
      status: "waiting_provider",
    });

    await server.close();
  });

  test("pollTask parses MouxiHub async image task states and nested outputs", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/tasks/task-mouxihub-1");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          code: "success",
          message: "",
          data: {
            data: {
              created: 1758993885,
              data: [
                {
                  b64_json: "",
                  revised_prompt: "cat",
                  url: "https://cdn.example/generated.png",
                },
              ],
              model: "nano-banana",
              usage: {
                completion_tokens: 1290,
                prompt_tokens: 1425,
                total_tokens: 2715,
              },
            },
            fail_reason: "",
            status: "SUCCESS",
            task_id: "task-mouxihub-1",
          },
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.pollTask!(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          pollPath: "/v1/images/tasks/{task_id}",
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        providerTaskId: "task-mouxihub-1",
      },
    );

    expect(result).toMatchObject({
      outputs: [
        {
          filename: "openai-image-1.png",
          mimeType: "image/png",
          url: "https://cdn.example/generated.png",
        },
      ],
      providerTaskId: "task-mouxihub-1",
      status: "succeeded",
      usage: {
        inputTokens: 1425,
        outputTokens: 1290,
        totalTokens: 2715,
      },
    });

    await server.close();
  });

  test("pollTask treats MouxiHub queued task states as still pending", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/tasks/task-mouxihub-queued");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          created_at: 1781439891,
          model_name: "gemini-3.1-flash-image-preview-4k",
          progress: "0%",
          status: "SUBMITTED",
          task_id: "task-mouxihub-queued",
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.pollTask!(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          pollPath: "/v1/images/tasks/{task_id}",
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        providerTaskId: "task-mouxihub-queued",
      },
    );

    expect(result).toMatchObject({
      providerTaskId: "task-mouxihub-queued",
      status: "pending",
    });

    await server.close();
  });

  test("pollTask parses MouxiHub top-level success task details", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/tasks/task-mouxihub-top-level");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          created_at: 1781439891,
          finish_time: 1781439927,
          model_name: "gemini-3.1-flash-image-preview-4k",
          progress: "100%",
          status: "SUCCESS",
          task_id: "task-mouxihub-top-level",
          data: {
            created: 1781439927,
            data: [
              {
                url: "https://cdn.example/top-level-generated.png",
              },
            ],
            usage: {
              completion_tokens: 22,
              prompt_tokens: 11,
              total_tokens: 33,
            },
          },
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.pollTask!(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          pollPath: "/v1/images/tasks/{task_id}",
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        providerTaskId: "task-mouxihub-top-level",
      },
    );

    expect(result).toMatchObject({
      outputs: [
        {
          filename: "openai-image-1.png",
          mimeType: "image/png",
          url: "https://cdn.example/top-level-generated.png",
        },
      ],
      providerTaskId: "task-mouxihub-top-level",
      status: "succeeded",
      usage: {
        inputTokens: 11,
        outputTokens: 22,
        totalTokens: 33,
      },
    });

    await server.close();
  });

  test("pollTask infers MouxiHub success from completed output when status is missing", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/tasks/task-mouxihub-no-status-success");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          code: "success",
          data: {
            finish_time: 1781439927,
            progress: "100%",
            task_id: "task-mouxihub-no-status-success",
            data: {
              data: [
                {
                  url: "https://cdn.example/no-status-generated.png",
                },
              ],
              usage: {
                completion_tokens: 9,
                prompt_tokens: 7,
                total_tokens: 16,
              },
            },
          },
          message: "",
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.pollTask!(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          pollPath: "/v1/images/tasks/{task_id}",
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        providerTaskId: "task-mouxihub-no-status-success",
      },
    );

    expect(result).toMatchObject({
      outputs: [
        {
          filename: "openai-image-1.png",
          mimeType: "image/png",
          url: "https://cdn.example/no-status-generated.png",
        },
      ],
      providerTaskId: "task-mouxihub-no-status-success",
      status: "succeeded",
      usage: {
        inputTokens: 7,
        outputTokens: 9,
        totalTokens: 16,
      },
    });

    await server.close();
  });

  test("pollTask infers MouxiHub in-flight task when status is missing", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/v1/images/tasks/task-mouxihub-no-status-running");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          code: "success",
          data: {
            platform: "sync-task",
            progress: "35%",
            start_time: 1781439927,
            task_id: "task-mouxihub-no-status-running",
          },
          message: "",
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    const result = await adapter.pollTask!(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        requestConfig: {
          pollPath: "/v1/images/tasks/{task_id}",
        },
        routeId: "route-t3",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        timeoutMs: 5_000,
      },
      {
        providerTaskId: "task-mouxihub-no-status-running",
      },
    );

    expect(result).toMatchObject({
      providerTaskId: "task-mouxihub-no-status-running",
      status: "running",
    });

    await server.close();
  });

  test("generateImage uses Responses API image_generation tool for gpt-5.5 line two", async () => {
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/responses");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("application/json");

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
      expect(body.model).toBe("gpt-5.5");
      expect(body.input).toContain("Use the following text as the complete prompt");
      expect(body.tool_choice).toBe("required");
      expect(body.tools[0]).toMatchObject({
        action: "generate",
        output_format: "jpeg",
        quality: "high",
        size: "2720x1536",
        type: "image_generation",
      });
      expect(body.tools[0].size).not.toBe("2k");
      expect(body.tools[0].output_compression).toBe(80);

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          output: [
            {
              result:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
              type: "image_generation_call",
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
          apiMode: "responses",
          model: "gpt-5.5",
          path: "/responses",
        },
        routeId: "route-2",
        routeKey: "image.gpt-image-2.line2",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            aspectRatio: "16:9",
            outputCompression: 80,
            outputFormat: "jpeg",
            quality: "high",
            size: "2k",
          },
        },
        prompt: "a tiny pig",
      },
    );

    expect(result).toMatchObject({
      modelKey: "gpt-5.5",
      outputs: [
        {
          filename: "openai-response-image-1.jpg",
          mimeType: "image/jpeg",
        },
      ],
      status: "succeeded",
    });
    expect(result.outputs?.[0]?.base64).toBeTruthy();

    await server.close();
  });

  test("generateImage lets Responses route config override request model", async () => {
    const server = await withHttpServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
      expect(body.model).toBe("gpt-5.5");

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          output: [
            {
              result:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
              type: "image_generation_call",
            },
          ],
        }),
      );
    });

    const adapter = new OpenAiCompatibleTextAdapter();
    await adapter.generateImage(
      {
        apiKey: "sk-test-secret",
        baseUrl: server.url,
        modelKey: "gpt-image-2",
        providerKey: "openai-compatible",
        requestConfig: {
          apiMode: "responses",
          model: "gpt-5.5",
          path: "/responses",
        },
        routeId: "route-2",
        routeKey: "image.gpt-image-2.line2",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            size: "1k",
          },
        },
        model: "gpt-image-2",
        prompt: "a tiny pig",
      },
    );

    await server.close();
  });

  test("generateImage uses Responses API edit action with input images", async () => {
    const server = await withHttpServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
      expect(body.model).toBe("gpt-5.5");
      expect(body.tools[0]).toMatchObject({
        action: "edit",
        output_format: "png",
        size: "auto",
        type: "image_generation",
      });
      expect(body.tools[0].output_compression).toBeUndefined();
      expect(body.input[0].content).toEqual([
        expect.objectContaining({ type: "input_text" }),
        { image_url: "https://cdn.example/input.png", type: "input_image" },
      ]);

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          output: [
            {
              result: {
                b64_json:
                  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
              },
              type: "image_generation_call",
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
          endpoint: "responses",
          model: "gpt-5.5",
          outputFormat: "png",
          path: "/responses",
        },
        routeId: "route-2",
        routeKey: "image.gpt-image-2.line2",
        timeoutMs: 5_000,
      },
      {
        metadata: {
          params: {
            images: ["https://cdn.example/input.png"],
            size: "auto",
          },
        },
        prompt: "edit this image",
      },
    );

    expect(result.outputs?.[0]?.base64).toBeTruthy();

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
      expect(body).not.toContain('name="response_format"');

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

  test("ai gateway splits gpt-image-2 reference edit batches into one-image provider requests", async () => {
    const requestBodies: string[] = [];
    const server = await withHttpServer(async (request, response) => {
      expect(request.url).toBe("/images/edits");
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      requestBodies.push(body);

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              url: `https://cdn.example/generated-${requestBodies.length}.webp`,
            },
          ],
        }),
      );
    });

    const gateway = new AiGateway({
      "openai-compatible": new OpenAiCompatibleTextAdapter(),
    });
    const result = await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: {
        metadata: {
          params: {
            n: 3,
            output_format: "webp",
            size: "1536x1024",
          },
          referenceImages: [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=",
          ],
        },
        prompt: "edit with reference",
      },
      route: makeRoute({
        baseUrl: server.url,
        model: {
          id: "model-1",
          modelKey: "gpt-image-2",
        },
        requestConfig: {
          editPath: "/images/edits",
          outputFormat: "webp",
          path: "/images/generations",
        },
        routeKey: "image.gpt-image-2",
      }),
    });

    expect(requestBodies).toHaveLength(3);
    for (const body of requestBodies) {
      expect(body).toContain('name="n"');
      expect(body).toContain("\r\n1\r\n");
      expect(body).not.toContain("\r\n2\r\n");
      expect(body).not.toContain("\r\n3\r\n");
    }
    expect(result.outputs?.map((output) => output.url)).toEqual([
      "https://cdn.example/generated-1.webp",
      "https://cdn.example/generated-2.webp",
      "https://cdn.example/generated-3.webp",
    ]);

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

  test("includes input asset urls as Nano Banana reference images", async () => {
    const calls: Array<{ body: Record<string, unknown> }> = [];
    const adapter = new VisionaryNanoBananaAdapter({
      fetchImplementation: (async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({
          body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            results: [{ url: "https://visionary.beer/api/generations/nb-asset/display" }],
            status: "succeeded",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    await adapter.generateImage(
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
        inputAssets: [
          {
            assetId: "asset-source",
            metadata: {
              signedUrl: "https://assets.example/source-preview.png",
            },
          },
        ],
        metadata: {
          images: ["https://cdn.example/manual-reference.png"],
        },
        prompt: "extend this image",
      },
    );

    expect(calls[0]?.body.images).toEqual([
      "https://cdn.example/manual-reference.png",
      "https://assets.example/source-preview.png",
    ]);
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

  test("includes input asset urls as Gemini fileData references", async () => {
    const calls: Array<{ body: Record<string, unknown> }> = [];
    const adapter = new PixelleLabsGeminiImageAdapter({
      fetchImplementation: (async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({
          body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
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
      }) as unknown as typeof fetch,
    });

    await adapter.generateImage(
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
        inputAssets: [
          {
            assetId: "asset-source",
            metadata: {
              signedUrl: "https://assets.example/source-preview.png",
            },
          },
        ],
        metadata: {
          images: ["https://example.com/input.jpg"],
        },
        prompt: "relight this image",
      },
    );

    expect(calls[0]?.body).toMatchObject({
      contents: [
        {
          parts: [
            { text: "relight this image" },
            {
              fileData: {
                fileUri: "https://example.com/input.jpg",
              },
            },
            {
              fileData: {
                fileUri: "https://assets.example/source-preview.png",
              },
            },
          ],
        },
      ],
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
  test("system route overrides tenant route for the same key", () => {
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

    expect(selected.routeId).toBe("system-route");
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

  test("ai gateway uses the connection adapter kind over provider kind", async () => {
    let openAiCompatibleCalled = false;
    let mockCalled = false;
    const gateway = new AiGateway({
      mock: {
        async generateImage() {
          mockCalled = true;
          return {
            modelKey: "mock-image",
            outputs: [
              {
                height: 1,
                mimeType: "image/png",
                url: "https://example.com/mock.png",
                width: 1,
              },
            ],
            providerRequest: { adapter: "mock" },
            providerResponse: { adapter: "mock" },
            status: "succeeded" as const,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          };
        },
      },
      "openai-compatible": {
        async generateImage() {
          openAiCompatibleCalled = true;
          return {
            modelKey: "gpt-image-2",
            outputs: [
              {
                mimeType: "image/png",
                url: "https://example.com/generated.png",
                width: 1024,
              },
            ],
            providerRequest: { adapter: "openai-compatible" },
            providerResponse: { adapter: "openai-compatible" },
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
        prompt: "draw through connection adapter",
      },
      route: makeRoute({
        connection: {
          adapterKind: "openai-compatible",
          id: "connection-1",
          name: "MouxiHub",
        },
        provider: {
          defaultBaseUrl: "mock://local",
          id: "provider-1",
          key: "mock-local-dev",
          kind: "mock",
        },
      }),
    });

    expect(mockCalled).toBe(false);
    expect(openAiCompatibleCalled).toBe(true);
    expect(result).toMatchObject({
      modelKey: "gpt-image-2",
      outputs: [
        {
          url: "https://example.com/generated.png",
          width: 1024,
        },
      ],
      providerKey: "mock-local-dev",
      status: "succeeded",
    });
  });

  test("ai gateway generateImage repeats single-output sync adapters until requested image count is reached", async () => {
    let callCount = 0;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage() {
          callCount += 1;
          return {
            modelKey: "image-test",
            outputs: [
              {
                mimeType: "image/png",
                url: `https://example.com/generated-${callCount}.png`,
              },
            ],
            providerRequest: { callCount },
            providerResponse: { callCount },
            status: "succeeded" as const,
            usage: {
              inputTokens: 2,
              outputTokens: 1,
              rawCost: 12,
              totalTokens: 3,
            },
          };
        },
      },
    });

    const result = await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: {
        metadata: { params: { n: 2 } },
        prompt: "draw two images",
      },
      route: makeRoute(),
    });

    expect(callCount).toBe(2);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs?.map((output) => output.url)).toEqual([
      "https://example.com/generated-1.png",
      "https://example.com/generated-2.png",
    ]);
    expect(result.usage).toEqual({
      inputTokens: 4,
      outputTokens: 2,
      rawCost: 24,
      totalTokens: 6,
    });
  });

  test("ai gateway splits gpt-image-2 generation batches into one-image provider requests", async () => {
    const calls: Array<{ n: unknown; prompt: string }> = [];
    let callCount = 0;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage(_context, request) {
          callCount += 1;
          const metadata = request.metadata && typeof request.metadata === "object" ? request.metadata : {};
          const params = "params" in metadata && metadata.params && typeof metadata.params === "object"
            ? metadata.params as Record<string, unknown>
            : {};
          calls.push({
            n: params.n,
            prompt: request.prompt,
          });
          return {
            modelKey: "gpt-image-2",
            outputs: [
              {
                mimeType: "image/png",
                url: `https://example.com/gpt-image-2-${callCount}.png`,
              },
            ],
            providerRequest: { callCount, n: params.n },
            providerResponse: { callCount },
            status: "succeeded" as const,
            usage: {
              inputTokens: 5,
              outputTokens: 10,
              totalTokens: 15,
            },
          };
        },
      },
    });

    const result = await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: {
        metadata: {
          params: {
            n: 2,
            outputFormat: "png",
            size: "1k",
          },
        },
        prompt: "draw two polished product shots",
      },
      route: makeRoute({
        model: {
          id: "model-1",
          modelKey: "gpt-image-2",
        },
        routeKey: "image.gpt-image-2.line1",
      }),
    });

    expect(calls).toEqual([
      { n: 1, prompt: "draw two polished product shots" },
      { n: 1, prompt: "draw two polished product shots" },
    ]);
    expect(result.outputs?.map((output) => output.url)).toEqual([
      "https://example.com/gpt-image-2-1.png",
      "https://example.com/gpt-image-2-2.png",
    ]);
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      rawCost: null,
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

  test("ai gateway splits MouxiHub T3 async image quantity into multiple provider tasks", async () => {
    const calls: Array<{ n: unknown; prompt: string }> = [];
    let taskNumber = 0;
    const gateway = new AiGateway({
      "openai-compatible": {
        async generateImage(_context, request) {
          taskNumber += 1;
          const metadata = request.metadata && typeof request.metadata === "object" ? request.metadata : {};
          const params = "params" in metadata && metadata.params && typeof metadata.params === "object"
            ? metadata.params as Record<string, unknown>
            : {};
          calls.push({
            n: params.n,
            prompt: request.prompt,
          });
          return {
            modelKey: "gemini-3.1-flash-image-preview-2k",
            outputs: [],
            providerRequest: { call: taskNumber },
            providerResponse: { task: taskNumber },
            providerTaskId: `task-${taskNumber}`,
            status: "waiting_provider" as const,
            usage: {
              inputTokens: 3,
              outputTokens: null,
              totalTokens: 3,
            },
          };
        },
      },
    });

    const result = await gateway.generateImage({
      apiKey: "sk-test-secret",
      request: {
        metadata: {
          n: 3,
          params: {
            imageSize: "2K",
            n: 3,
          },
        },
        prompt: "three variations",
      },
      route: makeRoute({
        routeKey: "image.mouxihub.nano-banana-pro.t3",
      }),
    });

    expect(calls).toEqual([
      { n: 1, prompt: "three variations" },
      { n: 1, prompt: "three variations" },
      { n: 1, prompt: "three variations" },
    ]);
    expect(result).toMatchObject({
      modelKey: "gemini-3.1-flash-image-preview-2k",
      providerTaskId: "task-1",
      providerTaskIds: ["task-1", "task-2", "task-3"],
      status: "waiting_provider",
    });
    expect(Array.isArray(result.providerRequest)).toBe(true);
    expect(Array.isArray(result.providerResponse)).toBe(true);
    expect(result.usage).toMatchObject({
      inputTokens: 9,
      outputTokens: null,
      totalTokens: 9,
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
