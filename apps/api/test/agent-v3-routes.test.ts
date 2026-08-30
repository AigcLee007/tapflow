import { describe, expect, it } from "vitest";
import { agentV3ApprovalSchema, agentV3EventsQuerySchema, agentV3TaskIdParamsSchema } from "../src/modules/agent/agent.schemas.js";

describe("V3 route boundary schemas", () => {
  it("requires a bounded task id and accepts replay cursors", () => {
    expect(agentV3TaskIdParamsSchema.safeParse({ taskId: "task-1" }).success).toBe(true);
    expect(agentV3EventsQuerySchema.parse({ after: "4" }).after).toBe(4);
    expect(agentV3TaskIdParamsSchema.safeParse({ taskId: "" }).success).toBe(false);
  });

  it("accepts explicit approval or input continuation", () => {
    expect(agentV3ApprovalSchema.parse({ approved: true })).toEqual({ approved: true });
    expect(agentV3ApprovalSchema.parse({ input: { style: "minimal" } })).toEqual({ input: { style: "minimal" } });
  });
});
