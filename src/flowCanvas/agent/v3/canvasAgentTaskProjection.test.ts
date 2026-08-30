import { describe, expect, it } from "vitest";
import { reduceCanvasAgentV3Event } from "./canvasAgentTaskProjection";
import type { CanvasAgentV3Task } from "./canvasAgentV3Types";

const task: CanvasAgentV3Task = { id: "t", status: "planning", lastSequence: 2, events: [] };
describe("canvas agent v3 projection", () => {
  it("ignores duplicate and out-of-order events", () => { expect(reduceCanvasAgentV3Event(task, { sequence: 2, type: "duplicate", status: "failed" })).toBe(task); });
  it("protects terminal state", () => { const done = { ...task, status: "succeeded" as const }; expect(reduceCanvasAgentV3Event(done, { sequence: 3, type: "late", status: "failed" })).toBe(done); });
  it("accepts ordered safe status transitions", () => { expect(reduceCanvasAgentV3Event(task, { sequence: 3, type: "approval", status: "waiting_for_approval" }).status).toBe("waiting_for_approval"); });
});
