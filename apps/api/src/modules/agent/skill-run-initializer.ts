import type { SkillRunContext, SkillRunService } from "./agent-skill-run.service.js";

export async function initializeSkillRun(
  runs: Pick<SkillRunService, "getRun" | "transition">,
  ctx: SkillRunContext,
  runId: string,
  created: boolean,
  waitingForInput: boolean,
) {
  const current = await runs.getRun(ctx, runId);
  if (!current) throw new Error("SKILL_RUN_NOT_FOUND");
  // A duplicate idempotency request returns the durable state unchanged;
  // replaying the draft transition would produce a stale-transition error.
  if (!created) return current;
  return waitingForInput
    ? runs.transition(ctx, runId, "draft", "waiting_for_input")
    : runs.transition(ctx, runId, "draft", "planned");
}
