import type { SkillRunView } from "./agent-skill-run.service.js";

export type SkillResultPlacementContext = {
  flowId: string;
  sessionId: string;
  turnId: string;
};

/** Enforces that a result can only be written back to the canvas that created it. */
export function assertSkillResultPlacement(input: {
  run: Pick<SkillRunView, "flowId" | "sessionId" | "status" | "turnId">;
  input: SkillResultPlacementContext;
}): void {
  if (input.run.status !== "succeeded" && input.run.status !== "partial_success" && input.run.status !== "reviewing") {
    throw new Error("SKILL_RESULT_NOT_READY");
  }
  if (
    input.run.flowId !== input.input.flowId ||
    input.run.sessionId !== input.input.sessionId ||
    input.run.turnId !== input.input.turnId
  ) {
    throw new Error("SKILL_RESULT_CONTEXT_MISMATCH");
  }
}
