import { describe, expect, it } from "vitest";

import { SkillStepRunner, buildSkillStepIdempotencyKey } from "../src/modules/agent/tools/skill-step-runner.js";

describe("SkillStepRunner", () => {
  it("generates text, persists a text-node result, and settles the existing billing callback", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    const runner = new SkillStepRunner({
      billing: { refund: async () => calls.push("refund"), reserve: async () => calls.push("reserve"), settle: async () => calls.push("settle") },
      pricing: async () => ({ amountCredits: 1 }),
      textRuntime: { generateText: async () => ({ outputText: "一段可靠的商品文案", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } }) },
      writeTextResult: async (input) => { expect(input.text).toBe("一段可靠的商品文案"); return { nodeId: "node-1" }; },
      updateStep: async (_context, stepId, patch) => { updates.push({ stepId, ...patch }); },
    });
    const result = await runner.runText({ tenantId: "tenant-1", userId: "user-1" }, { id: "step-1", runId: "run-1", prompt: "写商品文案", routeKey: "text.default", billingIdempotencyKey: "skill-step-1" });
    expect(result).toEqual({ nodeId: "node-1", text: "一段可靠的商品文案" });
    expect(calls).toEqual(["reserve", "settle"]);
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "running" }), expect.objectContaining({ status: "succeeded", nodeId: "node-1" })]));
  });

  it("marks the step failed and refunds a reservation when text generation fails", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    const runner = new SkillStepRunner({
      billing: { refund: async () => calls.push("refund"), reserve: async () => calls.push("reserve"), settle: async () => calls.push("settle") },
      pricing: async () => ({ amountCredits: 1 }),
      textRuntime: { generateText: async () => { throw new Error("provider unavailable"); } },
      writeTextResult: async () => ({ nodeId: "node-1" }),
      updateStep: async (_context, stepId, patch) => { updates.push({ stepId, ...patch }); },
    });
    await expect(runner.runText({ tenantId: "tenant-1", userId: "user-1" }, { id: "step-1", runId: "run-1", prompt: "写商品文案", billingIdempotencyKey: "skill-step-1" })).rejects.toThrow("provider unavailable");
    expect(calls).toEqual(["reserve", "refund"]);
    expect(updates.at(-1)).toMatchObject({ status: "failed", error: { code: "SKILL_TEXT_STEP_FAILED" } });
  });

  it("maps normalized actions to runtime actions", () => {
    const runner = new SkillStepRunner({
      textRuntime: { generateText: async () => ({ outputText: "unused" }) },
      updateStep: async () => undefined,
      writeTextResult: async () => ({ nodeId: "unused" }),
    });
    expect(runner.runtimeAction("analyze")).toBe("analyze");
    expect(runner.runtimeAction("canvas")).toBe("create_canvas");
    expect(runner.runtimeAction("text")).toBe("generate_text");
    expect(runner.runtimeAction("image")).toBe("generate_image");
    expect(runner.runtimeAction("video")).toBe("generate_video");
    expect(runner.runtimeAction("review")).toBe("review");
    expect(runner.runtimeAction("deliver")).toBe("deliver");
  });

  it("fails closed before a paid media runtime call when pricing is missing", async () => {
    const calls: string[] = [];
    const runner = new SkillStepRunner({
      mediaRuntime: {
        generateImage: async () => { calls.push("provider"); return { outputs: [{ assetId: "asset-1" }] }; },
      },
      pricing: async () => null,
      textRuntime: { generateText: async () => ({ outputText: "unused" }) },
      updateStep: async (_context, _stepId, patch) => { if (patch.status === "failed") calls.push(String((patch.error as Record<string, unknown>).code)); },
      writeTextResult: async () => ({ nodeId: "unused" }),
    });
    await expect(runner.runStep({ tenantId: "tenant-1", userId: "user-1" }, {
      action: "image",
      id: "step-image",
      runId: "run-1",
      prompt: "画一张图",
      routeKey: "image.default",
    })).rejects.toThrow("PRICING_NOT_FOUND");
    expect(calls).toEqual(["SKILL_PRICING_NOT_FOUND"]);
  });

  it("runs image and video actions through the existing media runtime and settles with stable retry identity", async () => {
    const calls: string[] = [];
    const outputs: Array<{ action: string; assetIds: string[] }> = [];
    const runner = new SkillStepRunner({
      billing: {
        reserve: async ({ idempotencyKey }) => calls.push(`reserve:${idempotencyKey}`),
        settle: async ({ idempotencyKey }) => calls.push(`settle:${idempotencyKey}`),
        refund: async ({ idempotencyKey }) => calls.push(`refund:${idempotencyKey}`),
      },
      mediaRuntime: {
        generateImage: async () => ({ outputs: [{ assetId: "image-1" }], usage: { totalTokens: 1 } }),
        generateVideo: async () => ({ outputs: [{ assetId: "video-1" }], usage: { totalTokens: 2 } }),
      },
      pricing: async () => ({ amountCredits: 3 }),
      updateStep: async () => undefined,
      writeMediaResult: async ({ action, outputs: mediaOutputs }) => {
        outputs.push({ action, assetIds: mediaOutputs.map((item) => item.assetId).filter((item): item is string => Boolean(item)) });
        return { assetIds: outputs.at(-1)!.assetIds };
      },
      textRuntime: { generateText: async () => ({ outputText: "unused" }) },
      writeTextResult: async () => ({ nodeId: "unused" }),
    });
    const context = { tenantId: "tenant-1", userId: "user-1" };
    await runner.runStep(context, { action: "image", id: "step-image", runId: "run-1", prompt: "画图" });
    await runner.runStep(context, { action: "video", id: "step-video", runId: "run-1", prompt: "做视频" });
    expect(outputs).toEqual([{ action: "image", assetIds: ["image-1"] }, { action: "video", assetIds: ["video-1"] }]);
    expect(calls).toEqual([
      `reserve:${buildSkillStepIdempotencyKey("run-1", "step-image")}`,
      `settle:${buildSkillStepIdempotencyKey("run-1", "step-image")}`,
      `reserve:${buildSkillStepIdempotencyKey("run-1", "step-video")}`,
      `settle:${buildSkillStepIdempotencyKey("run-1", "step-video")}`,
    ]);
  });

  it("returns per-step outcomes for a partial batch without hiding provider failures", async () => {
    const runner = new SkillStepRunner({
      mediaRuntime: { generateImage: async (_context, request) => {
        if (request.prompt === "bad") throw new Error("provider unavailable");
        return { outputs: [{ assetId: "asset-good" }] };
      } },
      pricing: async () => ({ amountCredits: 1 }),
      textRuntime: { generateText: async () => ({ outputText: "unused" }) },
      updateStep: async () => undefined,
      writeMediaResult: async () => ({ assetIds: ["asset-good"] }),
      writeTextResult: async () => ({ nodeId: "unused" }),
    });
    const result = await runner.runBatch({ tenantId: "tenant-1", userId: "user-1" }, [
      { action: "image", id: "step-good", runId: "run-1", prompt: "good" },
      { action: "image", id: "step-bad", runId: "run-1", prompt: "bad" },
    ]);
    expect(result.status).toBe("partial_success");
    expect(result.results.map((item) => item.status)).toEqual(["succeeded", "failed"]);
  });
});
