import { describe, expect, it } from "vitest";
import {
  CanvasDirectorLoop,
  type CanvasDirectorDecision,
  type CanvasDirectorInput,
  type CanvasDirectorEvent,
} from "../src/modules/agent/v3/canvas-director-loop.js";

const input: CanvasDirectorInput = {
  taskId: "task-1",
  tenantId: "tenant-1",
  projectId: "project-1",
  flowId: "flow-1",
  graphRevision: 3,
  prompt: "make a poster",
};

function harness(decisions: CanvasDirectorDecision[], overrides: Partial<ConstructorParameters<typeof CanvasDirectorLoop>[0]> = {}) {
  const events: CanvasDirectorEvent[] = [];
  const loop = new CanvasDirectorLoop({
    decide: async () => decisions.shift() ?? { type: "finish", delivery: { kind: "text", verified: true } },
    persist: async (event) => events.push(event),
    ...overrides,
  });
  return { events, loop };
}

describe("CanvasDirectorLoop", () => {
  it("keeps observe-only reads side-effect free and persists the plan", async () => {
    const { events, loop } = harness([
      { type: "read", tool: "get_graph" },
      { type: "plan", actions: ["create_text"], summary: "Create a draft" },
      { type: "finish", delivery: { kind: "text", verified: true } },
    ]);
    const result = await loop.run(input);
    expect(result.status).toBe("succeeded");
    expect(events.map((event) => event.status)).toEqual(["observing", "planning", "verifying", "succeeded"]);
    expect(events.find((event) => event.type === "plan")?.plan?.actions).toEqual(["create_text"]);
  });

  it("suspends at preview until the caller approves", async () => {
    const { events, loop } = harness([
      { type: "plan", actions: ["create_image"], summary: "Create image" },
      { type: "preview", risk: "paid", requiresApproval: true },
    ]);
    const result = await loop.run(input);
    expect(result.status).toBe("waiting_for_approval");
    expect(events.at(-1)?.status).toBe("waiting_for_approval");
  });

  it("suspends for explicit input and resumes with the same task identity", async () => {
    const { loop } = harness([{ type: "input_required", prompt: "Choose a style" }]);
    const paused = await loop.run(input);
    expect(paused).toMatchObject({ taskId: "task-1", status: "waiting_for_input" });
    const resumed = await loop.resume({ taskId: "task-1", input: "minimal" });
    expect(resumed.taskId).toBe("task-1");
  });

  it("suspends for async runs and verifies delivery before finishing", async () => {
    const verification: string[] = [];
    const { events, loop } = harness([
      { type: "run", runId: "run-1", asynchronous: true },
      { type: "finish", delivery: { kind: "image", verified: true } },
    ], {
      waitForRun: async () => ({ state: "succeeded", output: { assetId: "asset-1" } }),
      verifyDelivery: async () => { verification.push("verified"); return { verified: true, kind: "image" }; },
    });
    const result = await loop.run(input);
    expect(result.status).toBe("succeeded");
    expect(verification).toEqual(["verified"]);
    expect(events.some((event) => event.status === "running")).toBe(true);
    expect(events.some((event) => event.status === "verifying")).toBe(true);
  });

  it("repairs one failed delivery and then succeeds", async () => {
    let checks = 0;
    const { events, loop } = harness([
      { type: "run", runId: "run-1", asynchronous: false },
      { type: "repair", reason: "asset not placed" },
      { type: "finish", delivery: { kind: "image", verified: true } },
    ], {
      verifyDelivery: async () => ({ verified: ++checks > 1, kind: "image", reason: "asset not placed" }),
    });
    const result = await loop.run(input);
    expect(result.status).toBe("succeeded");
    expect(events.some((event) => event.status === "repairing")).toBe(true);
  });

  it("stops after one repair attempt", async () => {
    const { loop } = harness([
      { type: "run", runId: "run-1", asynchronous: false },
      { type: "repair", reason: "still broken" },
      { type: "repair", reason: "still broken" },
    ], { verifyDelivery: async () => ({ verified: false, kind: "image" }) });
    await expect(loop.run(input)).resolves.toMatchObject({ status: "failed", code: "AGENT_REPAIR_LIMIT_EXCEEDED" });
  });

  it("bounds decisions to eight rounds", async () => {
    const { loop } = harness(Array.from({ length: 10 }, () => ({ type: "read" as const, tool: "get_graph" })));
    await expect(loop.run(input)).resolves.toMatchObject({ status: "failed", code: "AGENT_TOOL_ROUND_LIMIT_EXCEEDED" });
  });

  it("turns invalid tool calls into a repair decision", async () => {
    const { events, loop } = harness([
      { type: "tool_call", namespace: "proposal", name: "unknown", input: {} },
      { type: "finish", delivery: { kind: "text", verified: true } },
    ]);
    const result = await loop.run(input);
    expect(result.status).toBe("succeeded");
    expect(events.some((event) => event.type === "repair_required")).toBe(true);
  });

  it("replays a terminal task without calling the decision function", async () => {
    let decisions = 0;
    const loop = new CanvasDirectorLoop({
      decide: async () => { decisions += 1; return { type: "finish", delivery: { kind: "text", verified: true } }; },
      persist: async () => undefined,
      load: async () => ({ taskId: "task-1", status: "succeeded", code: undefined }),
    });
    const result = await loop.run(input);
    expect(result.status).toBe("succeeded");
    expect(decisions).toBe(0);
  });
});
