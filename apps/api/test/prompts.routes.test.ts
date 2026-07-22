import Fastify from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";

import { registerPromptRoutes } from "../src/modules/prompts/prompts.routes.js";

const promptId = "73f9e9b3-27af-4bf0-89c1-6f06c72dd332";
const mediaId = "d8f7b201-2a5b-449f-afec-21d47bd06af4";

function buildPromptRouteApp(service: Record<string, unknown>) {
  const app = Fastify({ logger: false });
  app.decorate("promptsService", service);
  app.decorateRequest("ctx", null);
  app.addHook("onRequest", async (request) => {
    request.ctx = {
      isAuthenticated: true,
      permissions: ["admin:system", "prompt:read", "prompt:favorite"],
      requestId: "request-1",
      tenantId: "9c07e9dd-9853-4d6d-bb37-22b4b0d55884",
      traceId: "trace-1",
      userId: "f4bba6ab-89aa-4af7-a30e-bfb00afc5f6f",
    } as never;
  });
  registerPromptRoutes(app);
  return app;
}

const apps: Array<ReturnType<typeof buildPromptRouteApp>> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("prompt routes", () => {
  test("serves requested media variants with immutable private caching and 304 support", async () => {
    const getLocalMediaBytes = vi.fn(async () => ({ body: Buffer.from("preview"), etag: `\"${mediaId}-preview-3\"`, mimeType: "image/webp" }));
    const app = buildPromptRouteApp({ getLocalMediaBytes }); apps.push(app);

    const first = await app.inject({ method: "GET", url: `/api/v2/prompts/media/${mediaId}/bytes?variant=preview` });
    expect(first.statusCode).toBe(200);
    expect(first.headers).toMatchObject({
      "cache-control": "private, max-age=31536000, immutable",
      "content-length": "7",
      "content-type": "image/webp",
      etag: `\"${mediaId}-preview-3\"`,
      vary: "Authorization",
    });
    expect(getLocalMediaBytes).toHaveBeenCalledWith(expect.anything(), mediaId, undefined, "preview");

    const cached = await app.inject({ headers: { "if-none-match": first.headers.etag! }, method: "GET", url: `/api/v2/prompts/media/${mediaId}/bytes?variant=preview` });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
  });

  test("registers guarded delete and complete reorder admin routes", async () => {
    const deleteAdminPrompt = vi.fn(async () => ({ ok: true }));
    const reorderAdminPrompts = vi.fn(async () => []);
    const app = buildPromptRouteApp({ deleteAdminPrompt, reorderAdminPrompts }); apps.push(app);

    const removed = await app.inject({ method: "DELETE", url: `/api/v2/admin/prompts/${promptId}` });
    expect(removed.statusCode).toBe(200);
    expect(deleteAdminPrompt).toHaveBeenCalledWith(expect.anything(), promptId);

    const reordered = await app.inject({ method: "PATCH", payload: { promptIds: [promptId] }, url: "/api/v2/admin/prompts/order" });
    expect(reordered.statusCode).toBe(200);
    expect(reorderAdminPrompts).toHaveBeenCalledWith(expect.anything(), [promptId]);
  });
});
