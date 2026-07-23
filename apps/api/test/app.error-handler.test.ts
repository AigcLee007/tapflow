import { afterEach, describe, expect, test, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getApiEnv } from "../src/config/env.js";
import { PROMPT_MEDIA_MAX_BYTES } from "../src/modules/prompts/prompts.service.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("production app error handling", () => {
  test("maps oversized prompt media parser errors to the prompt size error", async () => {
    const app = buildApp({
      env: getApiEnv(),
      logger: false,
      pool: { end: vi.fn() } as never,
      queueHealthService: { close: vi.fn() } as never,
      workflowRunsService: {} as never,
    });
    apps.push(app);

    const response = await app.inject({
      headers: { "content-type": "application/x-prompt-media" },
      method: "POST",
      payload: Buffer.alloc(PROMPT_MEDIA_MAX_BYTES + 1),
      url: "/api/v2/admin/prompts/73f9e9b3-27af-4bf0-89c1-6f06c72dd332/media",
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: {
        code: "PROMPT_MEDIA_SIZE_INVALID",
        message: "效果图大小必须在 25 MB 以内",
      },
    });
  });
});
