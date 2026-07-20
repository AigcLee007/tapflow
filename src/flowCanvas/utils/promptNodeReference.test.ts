import { describe, expect, test } from "vitest";

import { buildPromptReferenceNodeData, hasPromptInsertRequest } from "./promptNodeReference";

describe("promptNodeReference", () => {
  test("builds prompt-only image node data without provider configuration", () => {
    const data = buildPromptReferenceNodeData({
      promptId: "prompt-1",
      promptInsertRequestId: "request-1",
      promptText: "cinematic portrait",
      promptTitle: "Portrait",
    });

    expect(data.generationPrompt).toBe("cinematic portrait");
    expect(data.sourcePromptId).toBe("prompt-1");
    expect(data.sourcePromptInsertRequestId).toBe("request-1");
    expect(data.modelId).toBeUndefined();
    expect(data.routeKey).toBeUndefined();
  });

  test("suppresses only the same navigation request", () => {
    expect(hasPromptInsertRequest([{ data: { sourcePromptInsertRequestId: "request-1" } }], "request-1")).toBe(true);
    expect(hasPromptInsertRequest([{ data: { sourcePromptInsertRequestId: "request-1" } }], "request-2")).toBe(false);
  });
});
